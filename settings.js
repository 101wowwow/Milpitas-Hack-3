(function () {
  'use strict';

  let ipcRenderer = null;
  try {
    ipcRenderer = require('electron').ipcRenderer;
  } catch (_) { }

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

  let config = { ...DEFAULT_CONFIG };

  const elements = {
    targetWork: document.getElementById('target-work'),
    targetCasual: document.getElementById('target-casual'),
    goalsForm: document.getElementById('goals-form'),
    ruleForm: document.getElementById('rule-form'),
    ruleKeyword: document.getElementById('rule-keyword'),
    ruleGroup: document.getElementById('rule-group'),
    rulesTable: document.querySelector('#app-rules-table tbody'),
    ruleSummary: document.getElementById('app-rules-summary'),
    resetDefaults: document.getElementById('reset-defaults'),
  };

  function createMessage(text) {
    const msg = document.createElement('div');
    msg.textContent = text;
    msg.style.marginTop = '10px';
    msg.style.color = '#16a34a';
    return msg;
  }

  async function loadConfig() {
    if (ipcRenderer) {
      try {
        const remoteConfig = await ipcRenderer.invoke('screentime-get-config');
        if (remoteConfig) {
          config = {
            ...DEFAULT_CONFIG,
            ...remoteConfig,
            targetHours: {
              ...DEFAULT_CONFIG.targetHours,
              ...(remoteConfig.targetHours || {}),
            },
            appGroups: {
              ...DEFAULT_CONFIG.appGroups,
              ...(remoteConfig.appGroups || {}),
            },
          };
        }
      } catch (e) {
        console.warn('[settings] Could not load config:', e.message);
      }
    }

    elements.targetWork.value = config.targetHours.work;
    elements.targetCasual.value = config.targetHours.casual;
    renderRules();
  }

  async function saveConfig() {
    if (ipcRenderer) {
      try {
        await ipcRenderer.invoke('screentime-save-config', config);
      } catch (e) {
        console.warn('[settings] Could not save config:', e.message);
      }
    }
  }

  function renderRules() {
    const entries = Object.entries(config.appGroups).sort(([a], [b]) => a.localeCompare(b));
    elements.rulesTable.innerHTML = entries.map(([keyword, group]) => {
      return `
        <tr>
          <td>${keyword}</td>
          <td>${group}</td>
          <td><button type="button" class="remove-rule-button" data-keyword="${keyword}">Remove</button></td>
        </tr>
      `;
    }).join('');

    elements.ruleSummary.textContent = `${entries.length} app/site grouping rule${entries.length === 1 ? '' : 's'} loaded.`;
  }

  async function updateRuleList() {
    renderRules();
    await saveConfig();
  }

  elements.goalsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const workValue = parseFloat(elements.targetWork.value);
    const casualValue = parseFloat(elements.targetCasual.value);
    if (Number.isFinite(workValue) && Number.isFinite(casualValue)) {
      config.targetHours.work = Math.max(0, workValue);
      config.targetHours.casual = Math.max(0, casualValue);
      await saveConfig();
      const notice = createMessage('Targets saved successfully.');
      elements.goalsForm.appendChild(notice);
      setTimeout(() => notice.remove(), 2500);
    }
  });

  elements.ruleForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const keyword = elements.ruleKeyword.value.trim();
    const group = elements.ruleGroup.value;
    if (!keyword) return;
    config.appGroups[keyword.toLowerCase()] = group;
    elements.ruleKeyword.value = '';
    elements.ruleGroup.value = 'work';
    await updateRuleList();
    const notice = createMessage('Rule added/updated.');
    elements.ruleForm.appendChild(notice);
    setTimeout(() => notice.remove(), 2500);
  });

  elements.rulesTable.addEventListener('click', async (event) => {
    if (!event.target.matches('.remove-rule-button')) return;
    const keyword = event.target.dataset.keyword;
    if (keyword && config.appGroups[keyword] !== undefined) {
      delete config.appGroups[keyword];
      await updateRuleList();
    }
  });

  elements.resetDefaults.addEventListener('click', async () => {
    config = { ...DEFAULT_CONFIG };
    await saveConfig();
    elements.targetWork.value = config.targetHours.work;
    elements.targetCasual.value = config.targetHours.casual;
    renderRules();
    const notice = createMessage('Default presets restored.');
    elements.resetDefaults.parentElement.appendChild(notice);
    setTimeout(() => notice.remove(), 2500);
  });

  loadConfig();
})();
