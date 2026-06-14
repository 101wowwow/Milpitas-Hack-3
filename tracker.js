/**
 * tracker.js – Screen-time tracker for the Milpitas John Electron app (Windows)
 *
 * Strategy:
 *  • Every POLL_MS (5 s) we call a tiny PowerShell snippet to get the
 *    title of the foreground window + its process name.
 *  • We also check `powerMonitor.getSystemIdleTime()` to skip idle periods
 *    (idle = no keyboard/mouse for IDLE_THRESHOLD_S seconds).
 *  • Accumulated seconds are flushed to a JSON file at FLUSH_MS intervals
 *    and on app quit.
 *  • The renderer can request today's summary via IPC ('screentime-get-today').
 *
 * Data shape saved to  screentime-data.json  (in app userData):
 * {
 *   "2025-06-13": {
 *     "work": 1234,        // seconds on "work" apps/sites
 *     "casual": 5678,      // seconds on "casual" apps/sites
 *     "byApp": {           // raw per-process accumulation (seconds)
 *       "chrome.exe": 900,
 *       "WINWORD.EXE": 300,
 *       ...
 *     }
 *   },
 *   ...
 * }
 */

'use strict';

const { ipcMain, powerMonitor, app } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

// ─── Configuration ────────────────────────────────────────────────────────────

const POLL_MS            = 5_000;   // poll interval
const FLUSH_MS           = 30_000;  // how often to write to disk
const IDLE_THRESHOLD_S   = 60;      // seconds of no input → skip counting

// Apps/window-title substrings considered "work"
const WORK_PATTERNS = [
  // IDEs / editors
  'visual studio', 'vscode', 'code.exe', 'idea64', 'pycharm', 'webstorm',
  'sublime', 'atom', 'notepad++', 'eclipse',
  // Office
  'word', 'excel', 'powerpoint', 'outlook', 'teams', 'winword', 'excel',
  'onenote', 'access',
  // Productivity / docs
  'notion', 'obsidian', 'figma', 'slack', 'zoom', 'meet',
  // Terminals
  'cmd.exe', 'powershell', 'wt.exe', 'windowsterminal', 'bash', 'git',
  // Browsers with work-ish titles (heuristic)
  'github', 'stackoverflow', 'jira', 'confluence', 'trello', 'asana',
  'google docs', 'google sheets', 'google slides', 'gmail', 'drive',
  'linear', 'notion', 'claude', 'chatgpt', 'openai',
  // Learning
  'coursera', 'udemy', 'khanacademy', 'edx', 'leetcode', 'hackerrank',
];

// Apps/title substrings considered "casual" (anything not matched as work)
// (We categorise everything NOT in WORK_PATTERNS as casual automatically,
//  but we can also be explicit about known leisure apps.)
const CASUAL_PATTERNS = [
  'youtube', 'netflix', 'twitch', 'spotify', 'discord', 'reddit',
  'twitter', 'x.com', 'instagram', 'tiktok', 'facebook', 'steam',
  'epicgames', 'minecraft', 'roblox', 'valorant', 'fortnite',
];

// ─── State ───────────────────────────────────────────────────────────────────

let dataFilePath = null;
let data = {};          // full multi-day store
let config = null;      // persisted app-group and target settings
let pollTimer = null;
let flushTimer = null;
let isTracking = false;

const CONFIG_KEY = '__config';
const DEFAULT_CONFIG = {
  targetHours: {
    work: 8,
    casual: 2,
  },
  appGroups: {
    instagram: 'casual',
    'instagram.exe': 'casual',
    'google drive': 'work',
    'docs.google.com': 'work',
    'drive.google.com': 'work',
    'meet.google.com': 'work',
    notion: 'work',
    slack: 'work',
    discord: 'casual',
    youtube: 'casual',
    twitch: 'casual',
    twitter: 'casual',
    facebook: 'casual',
    spotify: 'casual',
    figma: 'work',
    zoom: 'work',
    teams: 'work',
    word: 'work',
    excel: 'work',
    powerpoint: 'work',
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function ensureToday() {
  const k = todayKey();
  if (!data[k]) {
    data[k] = { work: 0, casual: 0, byApp: {} };
  }
  return data[k];
}

function getAppGroup(processName, windowTitle) {
  const combined = (processName + ' ' + windowTitle).toLowerCase();
  if (!config || !config.appGroups) return null;
  for (const [rule, group] of Object.entries(config.appGroups)) {
    if (!rule || !group) continue;
    if (combined.includes(rule.toLowerCase())) return group;
  }
  return null;
}

function classify(processName, windowTitle) {
  const combined = (processName + ' ' + windowTitle).toLowerCase();

  const appGroup = getAppGroup(processName, windowTitle);
  if (appGroup === 'work' || appGroup === 'casual') {
    return appGroup;
  }

  for (const p of WORK_PATTERNS) {
    if (combined.includes(p)) return 'work';
  }
  // Browsers default to casual unless title matched work above
  return 'casual';
}

/** PowerShell one-liner: returns "ProcessName|WindowTitle" */
const PS_SCRIPT = `
$fg = (Get-Process | Where-Object { $_.MainWindowHandle -eq (Add-Type -MemberDefinition '
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
' -Name Win32 -PassThru)::GetForegroundWindow() } | Select-Object -First 1)
if ($fg) { "$($fg.ProcessName)|$($fg.MainWindowTitle)" } else { "unknown|" }
`.trim();

// Simpler & faster alternative using the COM approach
const PS_SIMPLE = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
"@
$hwnd = [Win32]::GetForegroundWindow()
$pid = 0
[Win32]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
$proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
if ($proc) { "$($proc.ProcessName)|$($proc.MainWindowTitle)" } else { "unknown|" }
`;

function getActiveWindow(callback) {
  execFile('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
    '-Command', PS_SIMPLE
  ], { timeout: 4000, windowsHide: true }, (err, stdout) => {
    if (err) return callback(null);
    const line = stdout.trim();
    const sep = line.indexOf('|');
    if (sep === -1) return callback(null);
    const processName = line.slice(0, sep).trim();
    const windowTitle = line.slice(sep + 1).trim();
    callback({ processName, windowTitle });
  });
}

// ─── Load / Save ─────────────────────────────────────────────────────────────

function loadData() {
  if (!dataFilePath) return;
  try {
    if (fs.existsSync(dataFilePath)) {
      data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8')) || {};
    }
  } catch (e) {
    console.warn('[tracker] Could not load data file:', e.message);
    data = {};
  }

  const storedConfig = data[CONFIG_KEY] || {};
  config = {
    ...DEFAULT_CONFIG,
    ...storedConfig,
    targetHours: {
      ...DEFAULT_CONFIG.targetHours,
      ...(storedConfig.targetHours || {}),
    },
    appGroups: {
      ...DEFAULT_CONFIG.appGroups,
      ...(storedConfig.appGroups || {}),
    },
  };
}

function saveData() {
  if (!dataFilePath) return;
  try {
    data[CONFIG_KEY] = config;
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('[tracker] Could not save data file:', e.message);
  }
}

// ─── Polling ─────────────────────────────────────────────────────────────────

function poll() {
  // Skip if system is idle
  try {
    const idleSec = powerMonitor.getSystemIdleTime();
    if (idleSec >= IDLE_THRESHOLD_S) return;
  } catch (_) { /* powerMonitor not available in some contexts */ }

  getActiveWindow((win) => {
    if (!win) return;
    const { processName, windowTitle } = win;
    const category = classify(processName, windowTitle);
    const seconds = POLL_MS / 1000;

    const day = ensureToday();
    day[category] = (day[category] || 0) + seconds;
    day.byApp[processName] = (day.byApp[processName] || 0) + seconds;
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Start the tracker. Call once from main.js after app is ready.
 * @param {string} userDataPath – app.getPath('userData')
 */
function start(userDataPath) {
  if (isTracking) return;
  isTracking = true;

  dataFilePath = path.join(userDataPath, 'screentime-data.json');
  loadData();

  pollTimer  = setInterval(poll, POLL_MS);
  flushTimer = setInterval(saveData, FLUSH_MS);

  console.log('[tracker] Started. Data at:', dataFilePath);
}

function stop() {
  if (!isTracking) return;
  clearInterval(pollTimer);
  clearInterval(flushTimer);
  saveData();
  isTracking = false;
  console.log('[tracker] Stopped and flushed.');
}

/**
 * Get today's summary as { work, casual, byApp }
 * work / casual are in HOURS (float, 2 dp).
 */
function getTodaySummary() {
  const day = ensureToday();
  return {
    work:   +(day.work   / 3600).toFixed(2),
    casual: +(day.casual / 3600).toFixed(2),
    byApp:  Object.fromEntries(
      Object.entries(day.byApp).map(([k, v]) => [k, +(v / 3600).toFixed(2)])
    ),
  };
}

/**
 * Get summaries for the last N days (default 30).
 * Returns array of { date, work, casual, byApp } sorted oldest→newest.
 */
function getHistory(days = 30) {
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const day = data[key] || { work: 0, casual: 0, byApp: {} };
    result.push({
      date:   key,
      work:   +(day.work   / 3600).toFixed(2),
      casual: +(day.casual / 3600).toFixed(2),
      byApp:  Object.fromEntries(
        Object.entries(day.byApp).map(([k, v]) => [k, +(v / 3600).toFixed(2)])
      ),
    });
  }
  return result;
}

function getConfig() {
  return config || { ...DEFAULT_CONFIG };
}

function saveConfig(newConfig) {
  config = {
    ...DEFAULT_CONFIG,
    ...newConfig,
    targetHours: {
      ...DEFAULT_CONFIG.targetHours,
      ...(newConfig.targetHours || {}),
    },
    appGroups: {
      ...DEFAULT_CONFIG.appGroups,
      ...(newConfig.appGroups || {}),
    },
  };
  saveData();
  return config;
}

// ─── IPC handlers (renderer → main) ─────────────────────────────────────────

ipcMain.handle('screentime-get-today',   () => getTodaySummary());
ipcMain.handle('screentime-get-history', (_e, days) => getHistory(days || 30));
ipcMain.handle('screentime-get-config',  () => getConfig());
ipcMain.handle('screentime-save-config', (_e, newConfig) => saveConfig(newConfig));

// Expose for use in main.js
module.exports = { start, stop, getTodaySummary, getHistory, getConfig, saveConfig };
