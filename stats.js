// stats.js – Analysis page logic
// Reads questionnaire data from localStorage AND real screen-time data
// from the tracker (via Electron IPC), then merges them into one stats array.

(function () {
  'use strict';

  // ── IPC (Electron renderer) ────────────────────────────────────────────────
  let ipcRenderer = null;
  try {
    ipcRenderer = require('electron').ipcRenderer;
  } catch (_) { /* running in a plain browser – ipc unavailable */ }

  let currentConfig = {
    targetHours: { work: 8, casual: 2 },
    appGroups: {},
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
  function formatDate(d) { return d.toISOString().slice(0, 10); }
  function classifyAppName(appName) {
    const normalized = appName.toLowerCase();
    for (const [keyword, group] of Object.entries(currentConfig.appGroups || {})) {
      if (!keyword || !group) continue;
      if (normalized.includes(keyword.toLowerCase())) return group;
    }
    return null;
  }
  function formatGoal(value) { return Number.isFinite(value) ? `${value.toFixed(1)} h` : '—'; }

  async function loadConfig() {
    if (!ipcRenderer) return;
    try {
      const remoteConfig = await ipcRenderer.invoke('screentime-get-config');
      if (remoteConfig) {
        currentConfig = {
          targetHours: {
            ...currentConfig.targetHours,
            ...(remoteConfig.targetHours || {}),
          },
          appGroups: {
            ...currentConfig.appGroups,
            ...(remoteConfig.appGroups || {}),
          },
        };
      }
    } catch (e) {
      console.warn('[stats] Could not load config:', e.message);
    }
  }

  function generateSample(days = 30) {
    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = daysAgo(i);
      const stress = Math.round(Math.max(0, Math.min(10, 3 + Math.random() * 6 + (i < 7 ? 1 : 0))));
      const happiness = Math.round(Math.max(0, Math.min(10, 7 - Math.random() * 4 - (i < 7 ? 1 : 0))));
      const workScreenTime = +(Math.round((Math.random() * 6 + (i < 7 ? 1 : 0)) * 10) / 10);
      const casualScreenTime = +(Math.round((Math.random() * 3 + Math.random() * 2) * 10) / 10);
      const taskCompletionRate = +(Math.round((0.6 + Math.random() * 0.4 - (i < 7 ? 0.05 : 0)) * 100) / 100);
      const energy = Math.round(Math.max(0, Math.min(10, 5 + Math.random() * 4 - (i < 7 ? 1 : 0))));
      const social = Math.round(Math.max(0, Math.min(10, 4 + Math.random() * 4 - (i < 7 ? 1 : 0))));
      const confidence = Math.round(Math.max(0, Math.min(10, 5 + Math.random() * 4 - (i < 7 ? 1 : 0))));
      data.push({ date: formatDate(date), stress, happiness, workScreenTime, casualScreenTime, taskCompletionRate, energy, social, confidence, missedPlanned: 0 });
    }
    return data;
  }

  const MAPS = {
    stress:  { 'Very low': 0, 'Low': 2.5, 'Medium': 5, 'High': 7.5, 'Very high': 10 },
    mood:    { 'Very low': 0, 'Low': 2.5, 'Neutral': 5, 'Good': 7.5, 'Very good': 10 },
    sleep:   { 'Poor': 2, 'Fair': 4, 'Okay': 6, 'Good': 8, 'Great': 10 },
  };

  function normalizeQuestionnaireValue(value, map) {
    if (value == null) return null;
    const num = Number(value);
    if (!Number.isNaN(num)) return num;
    if (map && typeof value === 'string') return map[value] ?? null;
    return null;
  }

  function findLatestActualStatsEntry(stats) {
    for (let i = stats.length - 1; i >= 0; i -= 1) {
      const item = stats[i];
      if (item == null) continue;
      if ([item.stress, item.happiness, item.energy, item.confidence, item.workScreenTime, item.casualScreenTime].some(v => v != null)) {
        return item;
      }
    }
    return stats[stats.length - 1] || null;
  }

  // ── Build stats from questionnaire + screen-time data ─────────────────────
  function buildStats(screentimeHistory) {
    // keyed by date
    const stMap = {};
    if (Array.isArray(screentimeHistory)) {
      for (const entry of screentimeHistory) {
        stMap[entry.date] = entry;
      }
    }

    let questionnaires = [];
    try {
      const raw = localStorage.getItem('dailyQuestionnaireEntries');
      questionnaires = raw ? JSON.parse(raw) : [];
    } catch (_) { }

    const result = [];
    for (let i = 29; i >= 0; i--) {
      const d = daysAgo(i);
      const date = formatDate(d);

      const qEntry = questionnaires.filter(q => q.date === date).slice(-1)[0];
      const st = stMap[date] || null;

      const stress     = qEntry ? normalizeQuestionnaireValue(qEntry.stress)                        : null;
      const happiness  = qEntry ? normalizeQuestionnaireValue(qEntry.mood)                          : null;
      const energy     = qEntry ? normalizeQuestionnaireValue(qEntry.sleepQuality)                 : null;
      const confidence = qEntry ? normalizeQuestionnaireValue(qEntry.confidence)                   : null;

      // Real screen-time from tracker (hours); null if not tracked yet
      const workScreenTime   = st ? st.work   : null;
      const casualScreenTime = st ? st.casual : null;

      result.push({
        date,
        stress,
        happiness,
        workScreenTime,
        casualScreenTime,
        taskCompletionRate: null,
        energy,
        social: null,
        confidence,
        missedPlanned: 0,
        byApp: st ? st.byApp : {},
      });
    }

    const hasAny = result.some(r => r.stress !== null || r.happiness !== null || r.workScreenTime !== null || r.casualScreenTime !== null);
    if (!hasAny) return generateSample(30);
    return result;
  }

  // ── Burnout score ─────────────────────────────────────────────────────────
  function computeBurnout(latest, history) {
    const actualHistory = history.filter(item => item && [item.stress, item.happiness, item.energy, item.confidence, item.workScreenTime, item.casualScreenTime].some(v => v != null));
    const actualLatest = findLatestActualStatsEntry(history) || latest;
    const w = { workScreenTime: 14, stress: 18, happiness: 16, energy: 12, social: 10, confidence: 12, missedPlanned: 18 };

    const workScreen   = typeof actualLatest.workScreenTime  === 'number' ? actualLatest.workScreenTime  : 0;
    const stressVal    = typeof actualLatest.stress          === 'number' ? actualLatest.stress          : 5;
    const happinessVal = typeof actualLatest.happiness       === 'number' ? actualLatest.happiness       : 5;
    const energyVal    = typeof actualLatest.energy          === 'number' ? actualLatest.energy          : 5;
    const socialVal    = typeof actualLatest.social          === 'number' ? actualLatest.social          : 5;
    const confidenceVal= typeof actualLatest.confidence      === 'number' ? actualLatest.confidence      : 5;

    const normWork       = Math.min(1, workScreen / 8);
    const normStress     = Math.min(1, stressVal  / 10);
    const normHappiness  = 1 - Math.min(1, happinessVal  / 10);
    const normEnergy     = 1 - Math.min(1, energyVal     / 10);
    const normSocial     = 1 - Math.min(1, socialVal     / 10);
    const normConfidence = 1 - Math.min(1, confidenceVal / 10);
    const normMissed     = actualLatest.missedPlanned ? 1 : 0;

    let trend = 0;
    const last7 = actualHistory.slice(-7);
    if (last7.length >= 2) {
      const hStart = typeof last7[0].happiness === 'number'              ? last7[0].happiness              : 5;
      const hEnd   = typeof last7[last7.length - 1].happiness === 'number' ? last7[last7.length - 1].happiness : 5;
      const sStart = typeof last7[0].stress === 'number'                 ? last7[0].stress                 : 5;
      const sEnd   = typeof last7[last7.length - 1].stress === 'number'   ? last7[last7.length - 1].stress   : 5;
      trend += Math.min(1, Math.max(0, -(hEnd - hStart) / 10)) * 10;
      trend += Math.min(1, Math.max(0,  (sEnd - sStart) / 10)) * 12;
    }

    const total = Object.values(w).reduce((a, b) => a + b, 0);
    const score = Math.round(
      100 * (w.workScreenTime * normWork + w.stress * normStress + w.happiness * normHappiness +
             w.energy * normEnergy + w.social * normSocial + w.confidence * normConfidence +
             w.missedPlanned * normMissed) / total + trend
    );
    return Math.max(0, Math.min(100, score));
  }

  // ── UI: burnout meter ─────────────────────────────────────────────────────
  function updateMeter(stats) {
    const latest = stats[stats.length - 1];
    const score  = computeBurnout(latest, stats);

    const fill    = document.getElementById('burnout-fill');
    const text    = document.getElementById('burnout-text');
    const reasons = document.getElementById('burnout-reasons');
    const stress4 = document.getElementById('stress-4d');

    const reasonsArr = [];
    if (latest.workScreenTime >= 8) reasonsArr.push('High work screen time');
    if (latest.stress >= 7)         reasonsArr.push('High stress');
    if (latest.happiness <= 4)      reasonsArr.push('Low happiness');
    if (latest.energy <= 4)         reasonsArr.push('Low energy');
    if (latest.social <= 3)         reasonsArr.push('Low social');
    if (latest.confidence <= 4)     reasonsArr.push('Low confidence');
    if (latest.missedPlanned)       reasonsArr.push('Missed planned tasks');

    fill.style.width = score + '%';
    text.textContent = score + '%';
    reasons.textContent = reasonsArr.length ? reasonsArr.join(' • ') : 'No major flags';

    if (ipcRenderer) {
      ipcRenderer.send('burnout-score', score);
    }

    const sum4 = stats.slice(-4).map(s => s.stress || 0).reduce((a, b) => a + b, 0);
    stress4.textContent = sum4;
    if (sum4 > 30) {
      fill.style.boxShadow = '0 0 12px rgba(239,68,68,0.35)';
    } else {
      fill.style.boxShadow = 'none';
    }
  }

  // ── UI: today screen-time panel ───────────────────────────────────────────
  function updateTargetPanel(stats) {
    const panel = document.getElementById('target-summary');
    if (!panel) return;
    const today = stats[stats.length - 1];
    const work = today.workScreenTime ?? 0;
    const casual = today.casualScreenTime ?? 0;
    const workGoal = currentConfig.targetHours.work ?? 0;
    const casualGoal = currentConfig.targetHours.casual ?? 0;

    panel.innerHTML = `
      <div class="target-card">
        <h3>Work target</h3>
        <p>${formatGoal(workGoal)}</p>
        <div style="margin-top:8px;font-size:13px;color:#4b5563;">Today: ${formatGoal(work)} (${Math.round(workGoal ? (work / workGoal) * 100 : 0)}%)</div>
      </div>
      <div class="target-card">
        <h3>Casual target</h3>
        <p>${formatGoal(casualGoal)}</p>
        <div style="margin-top:8px;font-size:13px;color:#4b5563;">Today: ${formatGoal(casual)} (${Math.round(casualGoal ? (casual / casualGoal) * 100 : 0)}%)</div>
      </div>
    `;
  }

  function updateScreenTimePanel(stats) {
    const panel = document.getElementById('screentime-panel');
    if (!panel) return;

    const today = stats[stats.length - 1];
    const work   = today.workScreenTime   ?? 0;
    const casual = today.casualScreenTime ?? 0;
    const total  = work + casual;

    const workPct   = total > 0 ? Math.round((work   / total) * 100) : 0;
    const casualPct = total > 0 ? Math.round((casual / total) * 100) : 0;

    // Top apps
    const byApp = today.byApp || {};
    const topApps = Object.entries(byApp)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, hrs]) => {
        const group = classifyAppName(name) || 'unknown';
        return `<li><span class="app-name">${name}</span><span class="app-meta">${group}</span><span class="app-time">${hrs.toFixed(1)} h</span></li>`;
      })
      .join('');

    panel.innerHTML = `
      <h2 style="margin-top:0;font-size:15px;color:#374151;">Today's Screen Time</h2>
      <div class="st-row">
        <div class="st-block work">
          <div class="st-label">Work</div>
          <div class="st-value">${work.toFixed(1)} h</div>
          <div class="st-pct">${workPct}%</div>
        </div>
        <div class="st-block casual">
          <div class="st-label">Casual</div>
          <div class="st-value">${casual.toFixed(1)} h</div>
          <div class="st-pct">${casualPct}%</div>
        </div>
        <div class="st-block total">
          <div class="st-label">Total</div>
          <div class="st-value">${total.toFixed(1)} h</div>
        </div>
      </div>
      ${topApps ? `<div class="top-apps-label">Top apps</div><ul class="top-apps">${topApps}</ul>` : '<p class="small" style="color:#999">No app data yet – data accumulates while the app runs.</p>'}
    `;
  }

  // ── Charts ────────────────────────────────────────────────────────────────
  let timeseriesChart = null, xyChart = null;

  function renderTimeseries(stats, metric) {
    const ctx = document.getElementById('timeseries-chart').getContext('2d');

    // labels for every day (M-D)
    const labels = stats.map(s => {
      try { const d = new Date(s.date); return `${d.getMonth() + 1}-${d.getDate()}`; } catch (e) { return s.date; }
    });

    // values keep null for missing days so Chart.js will leave gaps
    const rawValues = stats.map(s => {
      const v = s[metric];
      if (metric === 'taskCompletionRate') return v != null ? Math.round(v * 100) : null;
      return v != null ? v : null;
    });

    // compute auto y-axis bounds from actual (non-null) values
    const valid = rawValues.filter(v => v != null && Number.isFinite(v));
    let yMin = 0, yMax = 10;
    if (valid.length) {
      const vmax = Math.max(...valid.map(Number));
      const vmin = Math.min(...valid.map(Number));
      if (metric === 'workScreenTime' || metric === 'casualScreenTime') {
        yMin = 0;
        yMax = Math.max(1, Math.ceil(vmax * 10) / 10 + 0.5);
      } else if (metric === 'taskCompletionRate') {
        yMin = 0;
        yMax = 100;
      } else {
        yMin = 0;
        yMax = Math.max(10, Math.ceil(vmax));
      }
    } else {
      // default bounds
      if (metric === 'workScreenTime' || metric === 'casualScreenTime') { yMin = 0; yMax = 8; }
      else if (metric === 'taskCompletionRate') { yMin = 0; yMax = 100; }
      else { yMin = 0; yMax = 10; }
    }

    // optionally append next day label (keeps previous behavior)
    try {
      if (stats.length) {
        const lastISO = stats[stats.length - 1].date;
        const last = new Date(lastISO);
        const next = new Date(last);
        next.setDate(next.getDate() + 1);
        labels.push(`${next.getMonth() + 1}-${next.getDate()}`);
        rawValues.push(null);
      }
    } catch (e) { /* ignore */ }

    if (timeseriesChart) timeseriesChart.destroy();
    timeseriesChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: metric.replace(/([A-Z])/g, ' $1'),
          data: rawValues,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.12)',
          tension: 0.2,
          fill: true,
          spanGaps: false,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: ctx => {
                const val = ctx.raw;
                if (val == null) return '';
                if (metric === 'taskCompletionRate') return `${val}%`;
                if (metric === 'workScreenTime' || metric === 'casualScreenTime') return `${Number(val).toFixed(1)} h`;
                return String(val);
              }
            }
          }
        },
        scales: {
          y: {
            min: yMin,
            max: yMax,
            beginAtZero: true
          }
        }
      }
    });
  }

  function renderXY(stats, xkey, ykey) {
    const ctx    = document.getElementById('xy-chart').getContext('2d');
    const points = stats
      .filter(s => s[xkey] != null && s[ykey] != null)
      .map(s => ({ x: s[xkey], y: s[ykey], label: s.date }));

    if (xyChart) xyChart.destroy();
    xyChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [{
          label: `${xkey} vs ${ykey}`,
          data: points,
          backgroundColor: '#ef4444',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              title: items => items[0].raw.label,
              label:  ctx  => `x: ${ctx.raw.x}, y: ${ctx.raw.y}`,
            }
          }
        },
        scales: {
          x: { title: { display: true, text: xkey } },
          y: {
            title: { display: true, text: ykey },
            min: 0,
            max: 10
          },
        }
      }
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    // Fetch real screen-time history from main process (if available)
    let screentimeHistory = null;
    if (ipcRenderer) {
      try {
        screentimeHistory = await ipcRenderer.invoke('screentime-get-history', 30);
      } catch (e) {
        console.warn('[stats] IPC screentime-get-history failed:', e.message);
      }
    }

    const stats = buildStats(screentimeHistory);

    await loadConfig();
    updateMeter(stats);
    updateTargetPanel(stats);
    updateScreenTimePanel(stats);
    renderTimeseries(stats, document.getElementById('timeseries-metric').value);
    renderXY(stats, document.getElementById('xy-x').value, document.getElementById('xy-y').value);

    // Allow immediate updates when changing dropdowns (not just via Refresh buttons)
    const timeseriesSelect = document.getElementById('timeseries-metric');
    const xyx = document.getElementById('xy-x');
    const xyy = document.getElementById('xy-y');
    if (timeseriesSelect) {
      timeseriesSelect.addEventListener('change', () => renderTimeseries(stats, timeseriesSelect.value));
    }
    if (xyx && xyy) {
      xyx.addEventListener('change', () => renderXY(stats, xyx.value, xyy.value));
      xyy.addEventListener('change', () => renderXY(stats, xyx.value, xyy.value));
    }

    document.getElementById('refresh-timeseries').addEventListener('click', () => {
      renderTimeseries(stats, document.getElementById('timeseries-metric').value);
    });
    document.getElementById('refresh-xy').addEventListener('click', () => {
      renderXY(stats, document.getElementById('xy-x').value, document.getElementById('xy-y').value);
    });

    // Live refresh of today's screen time every 30 s
    if (ipcRenderer) {
      setInterval(async () => {
        try {
          const today = await ipcRenderer.invoke('screentime-get-today');
          // Patch today's entry and re-render panel
          const last = stats[stats.length - 1];
          last.workScreenTime   = today.work;
          last.casualScreenTime = today.casual;
          last.byApp            = today.byApp;
          updateScreenTimePanel(stats);
          updateMeter(stats);
        } catch (_) { }
      }, 30_000);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();


// // Basic stats logic for the Analysis page
// // Reads `userStats` from localStorage if available, otherwise generates sample data.
// // Computes a burnout score and renders two Chart.js charts.

// (function(){
//   // Helpers to generate sample data for the last 30 days
//   function daysAgo(n){ const d=new Date(); d.setDate(d.getDate()-n); return d; }
//   function formatDate(d){ return d.toISOString().slice(0,10); }

//   function generateSample(days=30){
//     const data=[];
//     for(let i=days-1;i>=0;i--){
//       const date=daysAgo(i);
//       // stress 0-10, happiness 0-10, energy 0-10, social 0-10, confidence 0-10
//       const stress = Math.round(Math.max(0, Math.min(10, 3 + Math.random()*6 + (i<7?1:0))));
//       const happiness = Math.round(Math.max(0, Math.min(10, 7 - Math.random()*4 - (i<7?1:0))));
//       const workScreenTime = +(Math.round((Math.random()*6 + (i<7?1:0))*10)/10); // hours
//       const casualScreenTime = +(Math.round((Math.random()*3 + Math.random()*2)*10)/10);
//       const taskCompletionRate = +(Math.round((0.6 + Math.random()*0.4 - (i<7?0.05:0))*100)/100);
//       const energy = Math.round(Math.max(0, Math.min(10, 5 + Math.random()*4 - (i<7?1:0))));
//       const social = Math.round(Math.max(0, Math.min(10, 4 + Math.random()*4 - (i<7?1:0))));
//       const confidence = Math.round(Math.max(0, Math.min(10, 5 + Math.random()*4 - (i<7?1:0))));
//       const missedPlanned = Math.random() < 0.15 ? 1 : 0; // boolean
//       data.push({ date: formatDate(date), stress, happiness, workScreenTime, casualScreenTime, taskCompletionRate, energy, social, confidence, missedPlanned });
//     }
//     return data;
//   }

//   // Map questionnaire string values to numeric scales 0-10
//   const MAPS = {
//     stress: { 'Very low': 0, 'Low': 2.5, 'Medium': 5, 'High': 7.5, 'Very high': 10 },
//     mood: { 'Very low': 0, 'Low': 2.5, 'Neutral': 5, 'Good': 7.5, 'Very good': 10 },
//     sleep: { 'Poor': 2, 'Fair': 4, 'Okay': 6, 'Good': 8, 'Great': 10 }
//   };

//   function loadStats(){
//     try{
//       const qRaw = localStorage.getItem('dailyQuestionnaireEntries');
//       const scheduleRaw = localStorage.getItem('schedulePatternEntries');
//       const questionnaires = qRaw ? JSON.parse(qRaw) : [];
//       const schedules = scheduleRaw ? JSON.parse(scheduleRaw) : [];

//       // Build date map for last 30 days
//       const days = 30;
//       const result = [];
//       for(let i=days-1;i>=0;i--){
//         const d = new Date(); d.setDate(d.getDate()-i);
//         const date = d.toISOString().slice(0,10);

//         // find latest questionnaire for date
//         const qForDate = questionnaires.filter(q=>q.date===date).slice(-1)[0];

//         // basic defaults
//         const stress = qForDate ? (MAPS.stress[qForDate.stress] ?? 0) : null;
//         const happiness = qForDate ? (MAPS.mood[qForDate.mood] ?? null) : null;
//         const energy = qForDate ? (MAPS.sleep[qForDate.sleepQuality] ?? null) : null;

//         // schedule-derived flags (missed planned tasks not explicitly tracked) - default 0
//         const missedPlanned = 0;

//         // no screen time data available in this app; leave as null so charts can fall back to 0 when rendering
//         const workScreenTime = null;
//         const casualScreenTime = null;

//         const taskCompletionRate = null;

//         result.push({ date, stress, happiness, workScreenTime, casualScreenTime, taskCompletionRate, energy, social: null, confidence: null, missedPlanned });
//       }

//       // if there's no questionnaire data at all, fall back to generated sample data for demo
//       const hasAny = result.some(r=>r.stress !== null || r.happiness !== null);
//       if(!hasAny) return generateSample(30);
//       return result;
//     }catch(e){ return generateSample(30); }
//   }

//   const stats = loadStats();

//   // Compute burn-out risk score 0-100 from weighted factors
//   function computeBurnout(latest, history){
//     // weights
//     const w = {
//       workScreenTime: 14,
//       stress: 18,
//       happiness: 16,
//       energy: 12,
//       social: 10,
//       confidence: 12,
//       missedPlanned: 18
//     };

//     // normalize each metric to 0-1 risk
//     const workScreen = (typeof latest.workScreenTime === 'number') ? latest.workScreenTime : 0;
//     const stressVal = (typeof latest.stress === 'number') ? latest.stress : 5;
//     const happinessVal = (typeof latest.happiness === 'number') ? latest.happiness : 5;
//     const energyVal = (typeof latest.energy === 'number') ? latest.energy : 5;
//     const socialVal = (typeof latest.social === 'number') ? latest.social : 5;
//     const confidenceVal = (typeof latest.confidence === 'number') ? latest.confidence : 5;
//     const normWork = Math.min(1, workScreen/8); // 8+ hours high
//     const normStress = Math.min(1, stressVal/10);
//     const normHappiness = 1 - Math.min(1, happinessVal/10);
//     const normEnergy = 1 - Math.min(1, energyVal/10);
//     const normSocial = 1 - Math.min(1, socialVal/10);
//     const normConfidence = 1 - Math.min(1, confidenceVal/10);
//     const normMissed = latest.missedPlanned ? 1 : 0;

//     // additional trend factors: declining happiness, increasing stress
//     let trend = 0;
//     const last7 = history.slice(-7);
//     if(last7.length>=2){
//       const hStart = (typeof last7[0].happiness === 'number') ? last7[0].happiness : 5;
//       const hEnd = (typeof last7[last7.length-1].happiness === 'number') ? last7[last7.length-1].happiness : 5;
//       const sStart = (typeof last7[0].stress === 'number') ? last7[0].stress : 5;
//       const sEnd = (typeof last7[last7.length-1].stress === 'number') ? last7[last7.length-1].stress : 5;
//       const hDiff = (hEnd - hStart);
//       const sDiff = (sEnd - sStart);
//       // if happiness declined, increase risk; if stress increased, increase risk
//       trend += Math.min(1, Math.max(0, -hDiff/10))*10; // up to 10 points
//       trend += Math.min(1, Math.max(0, sDiff/10))*12; // up to 12 points
//     }

//     // weighted sum
//     const score = Math.round(
//       100 * (
//         (w.workScreenTime*normWork + w.stress*normStress + w.happiness*normHappiness + w.energy*normEnergy + w.social*normSocial + w.confidence*normConfidence + w.missedPlanned*normMissed) / Object.values(w).reduce((a,b)=>a+b,0)
//       ) + trend
//     );

//     return Math.max(0, Math.min(100, score));
//   }

//   function updateMeter(){
//     const latest = stats[stats.length-1];
//     const score = computeBurnout(latest, stats);
//     const fill = document.getElementById('burnout-fill');
//     const text = document.getElementById('burnout-text');
//     const reasons = document.getElementById('burnout-reasons');
//     const stress4 = document.getElementById('stress-4d');

//     // compute simple reason list
//     const reasonsArr = [];
//     if(latest.workScreenTime>=8) reasonsArr.push('High work screentime');
//     if(latest.stress>=7) reasonsArr.push('High stress');
//     if(latest.happiness<=4) reasonsArr.push('Low happiness');
//     if(latest.energy<=4) reasonsArr.push('Low energy');
//     if(latest.social<=3) reasonsArr.push('Low social');
//     if(latest.confidence<=4) reasonsArr.push('Low confidence');
//     if(latest.missedPlanned) reasonsArr.push('Missed planned tasks');

//     fill.style.width = score + '%';
//     text.textContent = score + '%';
//     reasons.textContent = reasonsArr.length ? reasonsArr.join(' • ') : 'No major flags';

//     // 4-day stress sum
//     const last4 = stats.slice(-4).map(s=>s.stress||0);
//     const sum4 = last4.reduce((a,b)=>a+b,0);
//     stress4.textContent = sum4;

//     // if sum surpasses 30, visually emphasize
//     if(sum4>30){
//       fill.style.boxShadow = '0 0 12px rgba(239,68,68,0.35)';
//       reasons.textContent = 'Recent high stress • ' + reasons.textContent;
//     } else {
//       fill.style.boxShadow = 'none';
//     }
//   }

//   // Chart rendering
//   let timeseriesChart=null, xyChart=null;

//   function renderTimeseries(metric){
//     const ctx = document.getElementById('timeseries-chart').getContext('2d');
//     const labels = stats.map(s=>s.date);
//     const data = stats.map(s=>{
//       if(metric==='taskCompletionRate') return Math.round((s.taskCompletionRate||0)*100);
//       if(metric==='workScreenTime' || metric==='casualScreenTime') return s[metric];
//       return s[metric];
//     });

//     const datasetLabel = metric.replace(/([A-Z])/g, ' $1');

//     if(timeseriesChart) timeseriesChart.destroy();
//     timeseriesChart = new Chart(ctx, {
//       type: 'line',
//       data: { labels, datasets: [{ label: datasetLabel, data, borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,0.12)', tension:0.2, fill:true }] },
//       options: { responsive:true, maintainAspectRatio:false, scales:{ y: { beginAtZero:true } } }
//     });
//   }

//   function renderXY(xkey,ykey){
//     const ctx = document.getElementById('xy-chart').getContext('2d');
//     const points = stats.map(s=>({ x: s[xkey], y: s[ykey], label: s.date }));

//     if(xyChart) xyChart.destroy();
//     xyChart = new Chart(ctx, {
//       type: 'scatter',
//       data: { datasets: [{ label: `${xkey} vs ${ykey}`, data: points, backgroundColor:'#ef4444' }] },
//       options: { responsive:true, maintainAspectRatio:false, plugins:{ tooltip:{ callbacks:{ title: (items)=> items[0].raw.label, label: (ctx)=> `x: ${ctx.raw.x}, y: ${ctx.raw.y}` } } }, scales:{ x:{ title:{ display:true, text: xkey } }, y:{ title:{ display:true, text: ykey } } } }
//     });
//   }

//   // wire controls
//   document.addEventListener('DOMContentLoaded', function(){
//     updateMeter();
//     renderTimeseries(document.getElementById('timeseries-metric').value);
//     renderXY(document.getElementById('xy-x').value, document.getElementById('xy-y').value);

//     document.getElementById('refresh-timeseries').addEventListener('click', function(){
//       renderTimeseries(document.getElementById('timeseries-metric').value);
//     });
//     document.getElementById('refresh-xy').addEventListener('click', function(){
//       renderXY(document.getElementById('xy-x').value, document.getElementById('xy-y').value);
//     });
//   });

// })();
