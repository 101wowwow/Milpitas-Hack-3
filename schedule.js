const form = document.getElementById('schedule-form');
const entriesList = document.getElementById('entries-list');
const summaryText = document.getElementById('summary-text');
const clearStorageButton = document.getElementById('clear-storage');
const questionnaireButton = document.getElementById('open-questionnaire');
const avatarQuestionnaireButton = document.getElementById('avatar-questionnaire');
const openScheduleButton = document.getElementById('open-schedule');
const closeScheduleButton = document.getElementById('close-schedule');
const scheduleSection = document.getElementById('schedule-section');
const openNewPageButton = document.getElementById('open-new-page');
const questionnaireModal = document.getElementById('questionnaire-modal');
const questionnaireForm = document.getElementById('questionnaire-form');
const closeQuestionnaire = document.getElementById('close-questionnaire');
const skipQuestionnaireButton = document.getElementById('skip-questionnaire');
const questionnaireStatus = document.getElementById('questionnaire-status');
const questionnaireHistory = document.getElementById('questionnaire-history');
const taskChartList = document.getElementById('task-chart-list');
const addTaskButton = document.getElementById('add-task-button');
const taskModal = document.getElementById('task-modal');
const taskForm = document.getElementById('task-form');
const taskModalClose = document.getElementById('task-modal-close');
const taskModalCancel = document.getElementById('task-modal-cancel');
const noTaskMessage = document.getElementById('no-task-message');
const johnAvatar = document.querySelector('.corner-avatar');

const STORAGE_KEY = 'schedulePatternEntries';
const QUESTIONNAIRE_KEY = 'dailyQuestionnaireEntries';

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function loadEntries() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function loadQuestionnaires() {
  const stored = localStorage.getItem(QUESTIONNAIRE_KEY);
  return stored ? JSON.parse(stored) : [];
}

function saveQuestionnaires(items) {
  localStorage.setItem(QUESTIONNAIRE_KEY, JSON.stringify(items));
}

function hasQuestionnaireForDate(date) {
  return loadQuestionnaires().some(item => item.date === date);
}

function getLastQuestionnaire() {
  const items = loadQuestionnaires();
  return items.length ? items[items.length - 1] : null;
}

function analyzePatterns(entries) {
  if (entries.length === 0) {
    return 'No entries yet.';
  }

  const timeCounts = {};
  const activityCounts = {};
  const purposeCounts = { Work: 0, Fun: 0, Mixed: 0 };

  entries.forEach(entry => {
    timeCounts[entry.time] = (timeCounts[entry.time] || 0) + 1;
    activityCounts[entry.activity] = (activityCounts[entry.activity] || 0) + 1;
    purposeCounts[entry.purpose] = (purposeCounts[entry.purpose] || 0) + 1;
  });

  const busiestTime = Object.entries(timeCounts).sort((a, b) => b[1] - a[1])[0];
  const topActivity = Object.entries(activityCounts).sort((a, b) => b[1] - a[1])[0];
  const mainPurpose = Object.entries(purposeCounts).sort((a, b) => b[1] - a[1])[0];

  let warning = '';
  if (purposeCounts.Work > purposeCounts.Fun + purposeCounts.Mixed && topActivity && topActivity[0] === 'Working') {
    warning = 'You are logging a lot of work-related schedule items. Watch for burnout signals.';
  }

  if (entries.length >= 5 && busiestTime && busiestTime[1] >= 3 && topActivity && topActivity[0] === 'Sleeping') {
    warning = 'Your sleep schedule appears repetitive; this may signal stress or a crisis window.';
  }

  return `Most common time: ${busiestTime ? busiestTime[0] : 'N/A'}. Most frequent activity: ${topActivity ? topActivity[0] : 'N/A'}. Main purpose: ${mainPurpose ? mainPurpose[0] : 'N/A'}. ${warning}`.trim();
}

function renderEntries() {
  if (!entriesList || !summaryText) return;

  const entries = loadEntries();
  entriesList.innerHTML = '';

  if (entries.length === 0) {
    summaryText.textContent = 'No entries yet. Add your first schedule item to start tracking patterns.';
    return;
  }

  summaryText.textContent = analyzePatterns(entries);

  entries.slice().reverse().forEach(entry => {
    const card = document.createElement('div');
    card.className = 'entry-card';
    card.innerHTML = `
      <div class="entry-header">
        <span>${entry.day} · ${entry.time}</span>
        <span class="purpose-label">${entry.purpose || 'Unknown'}</span>
      </div>
      <div class="entry-detail"><strong>Activity:</strong> ${entry.activity || 'Task'}</div>
      <div class="entry-detail"><strong>Notes:</strong> ${entry.notes || 'No notes'}</div>
    `;
    entriesList.appendChild(card);
  });
}

function renderQuestionnaireHistory() {
  if (!questionnaireHistory) return;

  const questionnaires = loadQuestionnaires();
  questionnaireHistory.innerHTML = '';

  if (questionnaires.length === 0) {
    questionnaireHistory.innerHTML = '<p>No check-ins yet. Complete the morning questionnaire to start tracking.</p>';
    return;
  }

  questionnaires.slice().reverse().slice(0, 5).forEach(entry => {
    const card = document.createElement('div');
    card.className = 'entry-card';
    card.innerHTML = `
      <div class="entry-header">
        <span>${entry.date}</span>
        <span class="purpose-label">Mood: ${entry.mood || 'Unknown'}</span>
      </div>
      <div class="entry-detail"><strong>Stress:</strong> ${entry.stress || 'Unknown'}</div>
      <div class="entry-detail"><strong>Sleep:</strong> ${entry.sleepQuality || 'Unknown'}</div>
      <div class="entry-detail"><strong>Notes:</strong> ${entry.notes || 'No notes'}</div>
    `;
    questionnaireHistory.appendChild(card);
  });
}

function updateQuestionnaireStatus() {
  if (!questionnaireStatus) return;

  const today = getTodayDate();
  const completed = hasQuestionnaireForDate(today);
  const lastEntry = getLastQuestionnaire();
  const now = new Date();
  const hour = now.getHours();

  if (completed) {
    questionnaireStatus.textContent = `Today's check-in is complete. Last completed on ${today}.`;
    return;
  }

  if (hour >= 6 && hour < 12) {
    questionnaireStatus.textContent = 'You have a pending morning check-in. Please complete it.';
  } else {
    questionnaireStatus.textContent = 'Morning check-in is still available. Tap the button when ready.';
  }

  if (lastEntry) {
    questionnaireStatus.textContent += ` Last check-in was on ${lastEntry.date}.`;
  }
}

function showQuestionnaireModal() {
  if (!questionnaireModal) return;
  questionnaireModal.classList.remove('hidden');
  questionnaireModal.setAttribute('aria-hidden', 'false');
}

function hideQuestionnaireModal() {
  if (!questionnaireModal) return;
  questionnaireModal.classList.add('hidden');
  questionnaireModal.setAttribute('aria-hidden', 'true');
}

function showTaskModal() {
  if (!taskModal) return;
  taskModal.classList.remove('hidden');
  taskModal.setAttribute('aria-hidden', 'false');
}

function hideTaskModal() {
  if (!taskModal) return;
  taskModal.classList.add('hidden');
  taskModal.setAttribute('aria-hidden', 'true');
}

function renderTaskChart() {
  if (!taskChartList) return;

  const entries = loadEntries();
  taskChartList.innerHTML = '';

  if (!entries.length) {
    if (noTaskMessage) noTaskMessage.style.display = 'block';
    return;
  }

  if (noTaskMessage) noTaskMessage.style.display = 'none';

  entries.slice().reverse().forEach(entry => {
    const row = document.createElement('div');
    row.className = 'chart-row';
    row.innerHTML = `
      <div class="chart-box chart-time">${entry.time || '—'}</div>
      <div class="chart-box chart-task">${entry.activity || 'Untitled task'}</div>
      <div class="chart-box chart-category">${entry.purpose || 'Category'}</div>
    `;
    taskChartList.appendChild(row);
  });
}

function renderSchedulePage() {
  renderTaskChart();
}

function showScheduleSection() {
  if (!scheduleSection) return;
  scheduleSection.classList.remove('hidden');
}

function hideScheduleSection() {
  if (!scheduleSection) return;
  scheduleSection.classList.add('hidden');
}

if (form) {
  form.addEventListener('submit', event => {
    event.preventDefault();

    const formData = new FormData(form);
    const newEntry = {
      day: formData.get('day'),
      time: formData.get('time'),
      activity: formData.get('activity'),
      purpose: formData.get('purpose'),
      notes: formData.get('notes').trim(),
      createdAt: new Date().toISOString(),
    };

    const entries = loadEntries();
    entries.push(newEntry);
    saveEntries(entries);
    form.reset();
    renderEntries();
    renderTaskChart();
  });
}

if (questionnaireForm) {
  questionnaireForm.addEventListener('submit', event => {
    event.preventDefault();

    const formData = new FormData(questionnaireForm);
    const questionnaireEntry = {
      date: getTodayDate(),
      mood: formData.get('mood'),
      stress: formData.get('stress'),
      sleepQuality: formData.get('sleepQuality'),
      notes: formData.get('questionNotes').trim(),
      createdAt: new Date().toISOString(),
    };

    const questionnaires = loadQuestionnaires();
    questionnaires.push(questionnaireEntry);
    saveQuestionnaires(questionnaires);
    questionnaireForm.reset();
    hideQuestionnaireModal();
    updateQuestionnaireStatus();
    renderQuestionnaireHistory();
  });
}

if (addTaskButton) {
  addTaskButton.addEventListener('click', showTaskModal);
}

if (taskForm) {
  taskForm.addEventListener('submit', event => {
    event.preventDefault();

    const formData = new FormData(taskForm);
    const newEntry = {
      day: getTodayDate(),
      time: formData.get('task-time'),
      activity: formData.get('task-name'),
      purpose: formData.get('task-category'),
      notes: '',
      createdAt: new Date().toISOString(),
    };

    const entries = loadEntries();
    entries.push(newEntry);
    saveEntries(entries);
    taskForm.reset();
    hideTaskModal();
    renderTaskChart();
  });
}

if (taskModalClose) {
  taskModalClose.addEventListener('click', hideTaskModal);
}

if (taskModalCancel) {
  taskModalCancel.addEventListener('click', hideTaskModal);
}

if (taskModal) {
  taskModal.addEventListener('click', event => {
    if (event.target === taskModal) {
      hideTaskModal();
    }
  });
}

if (questionnaireButton) {
  questionnaireButton.addEventListener('click', showQuestionnaireModal);
}

if (johnAvatar) {
  johnAvatar.addEventListener('click', showQuestionnaireModal);
}

if (openScheduleButton) {
  openScheduleButton.addEventListener('click', showScheduleSection);
}

if (closeScheduleButton) {
  closeScheduleButton.addEventListener('click', hideScheduleSection);
}

if (openNewPageButton) {
  openNewPageButton.addEventListener('click', () => {
    if (typeof require === 'function') {
      const {ipcRenderer} = require('electron');
      ipcRenderer.send('open-new-page');
    } else {
      window.open('new-page.html', '_blank');
    }
  });
}

if (closeQuestionnaire) {
  closeQuestionnaire.addEventListener('click', hideQuestionnaireModal);
}

if (skipQuestionnaireButton) {
  skipQuestionnaireButton.addEventListener('click', hideQuestionnaireModal);
}

if (clearStorageButton) {
  clearStorageButton.addEventListener('click', () => {
    if (!confirm('Clear all saved schedule entries?')) {
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
    renderEntries();
    renderTaskChart();
  });
}

if (questionnaireStatus) {
  updateQuestionnaireStatus();
}

if (questionnaireHistory) {
  renderQuestionnaireHistory();
}

renderEntries();
renderSchedulePage();
renderQuestionnaireHistory();
updateQuestionnaireStatus();
promptQuestionnaireIfNeeded();

// Back-to-top behavior for the scrollable .app-shell
(function () {
  const appShell = document.querySelector('.app-shell');
  const backToTop = document.getElementById('back-to-top');
  if (!appShell || !backToTop) return;

  appShell.style.scrollBehavior = 'smooth';

  const updateVisibility = () => {
    backToTop.classList.toggle('hidden', appShell.scrollTop <= 200);
  };

  appShell.addEventListener('scroll', updateVisibility);
  updateVisibility(); // initial state

  backToTop.addEventListener('click', () => {
    appShell.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
