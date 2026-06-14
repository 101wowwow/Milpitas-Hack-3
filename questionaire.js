const form = document.getElementById('schedule-form');
const entriesList = document.getElementById('entries-list');
const summaryText = document.getElementById('summary-text');
const clearStorageButton = document.getElementById('clear-storage');
const questionnaireButton = document.getElementById('open-questionnaire');
const openScheduleButton = document.getElementById('open-schedule');
const closeScheduleButton = document.getElementById('close-schedule');
const scheduleSection = document.getElementById('schedule-section');
const questionnaireModal = document.getElementById('questionnaire-modal');
const questionnaireForm = document.getElementById('questionnaire-form');
const skipQuestionnaireButton = document.getElementById('skip-questionnaire');
const exitButton = document.querySelector('.back-button');
const questionnaireStatus = document.getElementById('questionnaire-status');
const questionnaireHistory = document.getElementById('questionnaire-history');
const stressSuggestion = document.getElementById('stress-suggestion');

// Make entire form-row clickable
function enableFormRowClickability() {
  const questionnaireForm = document.getElementById('questionnaire-form');
  if (questionnaireForm) {
    const formRows = questionnaireForm.querySelectorAll('.form-row, .textarea-row');
    formRows.forEach(row => {
      // Only add listener if not already added
      if (!row.dataset.clickListenerAdded) {
        row.addEventListener('click', (e) => {
          const input = row.querySelector('select, textarea, input');
          if (input && e.target !== input) {
            input.focus();
            if (input.tagName === 'SELECT') {
              input.click();
            }
          }
        });
        row.dataset.clickListenerAdded = 'true';
      }
    });
  }
}

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

function getStressSuggestionText(stress) {
  const value = Number(stress);
  if (!Number.isFinite(value)) {
    return null;
  }

  if (value >= 9) {
    return 'Stress is very high right now. Try talking with a trusted person about how you are feeling.';
  }

  if (value >= 8) {
    return 'Your stress is high. Consider writing a brief journal entry or taking a calming walk.';
  }

  if (value > 4) {
    return 'Stress is above 40%. Take three deep breaths slowly, focusing on steady inhales and exhales.';
  }

  return null;
}

function renderStressSuggestion(stress) {
  if (!stressSuggestion) return;
  const message = getStressSuggestionText(stress);

  if (!message) {
    stressSuggestion.classList.add('hidden');
    stressSuggestion.textContent = '';
    return;
  }

  stressSuggestion.textContent = message;
  stressSuggestion.classList.remove('hidden');
}

function renderLatestStressSuggestion() {
  const last = getLastQuestionnaire();
  renderStressSuggestion(last ? last.stress : null);
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
  if (purposeCounts.Work > purposeCounts.Fun + purposeCounts.Mixed && topActivity[0] === 'Working') {
    warning = 'You are logging a lot of work-related schedule items. Watch for burnout signals.';
  }

  if (entries.length >= 5 && busiestTime[1] >= 3 && topActivity[0] === 'Sleeping') {
    warning = 'Your sleep schedule appears repetitive; this may signal stress or a crisis window.';
  }

  return `Most common time: ${busiestTime[0]}. Most frequent activity: ${topActivity[0]}. Main purpose: ${mainPurpose[0]}. ${warning}`.trim();
}

function renderEntries() {
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
        <span class="purpose-label">${entry.purpose}</span>
      </div>
      <div class="entry-detail"><strong>Activity:</strong> ${entry.activity}</div>
      <div class="entry-detail"><strong>Notes:</strong> ${entry.notes || 'No notes'}</div>
    `;
    entriesList.appendChild(card);
  });
}

function renderQuestionnaireHistory() {
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
        <span class="purpose-label">Mood: ${entry.mood}</span>
      </div>
      <div class="entry-detail"><strong>Stress:</strong> ${entry.stress}</div>
      <div class="entry-detail"><strong>Sleep:</strong> ${entry.sleepQuality}</div>
      <div class="entry-detail"><strong>Confidence:</strong> ${entry.confidence}</div>
      <div class="entry-detail"><strong>Notes:</strong> ${entry.notes || 'No notes'}</div>
    `;
    questionnaireHistory.appendChild(card);
  });
}

function updateQuestionnaireStatus() {
  if (!questionnaireStatus) return;
  const today = getTodayDate();
  const lastEntry = getLastQuestionnaire();
  const now = new Date();
  const hour = now.getHours();

  questionnaireStatus.textContent = hour >= 6 && hour < 12
    ? 'You can complete the morning check-in anytime.'
    : 'The questionnaire is always available. Tap the button when ready.';

  if (lastEntry) {
    questionnaireStatus.textContent += ` Last check-in was on ${lastEntry.date}.`;
  }
}

function setQuestionnaireButtonState() {
  if (!questionnaireButton) return;
  questionnaireButton.disabled = false;
  questionnaireButton.textContent = 'Daily Morning Check-in';
  questionnaireButton.style.opacity = '';
  questionnaireButton.style.cursor = '';
}

function showQuestionnaireModal() {
  if (!questionnaireModal) return;
  questionnaireModal.classList.remove('hidden');
  questionnaireModal.setAttribute('aria-hidden', 'false');
  enableFormRowClickability();
}

function hideQuestionnaireModal() {
  if (!questionnaireModal) return;
  questionnaireModal.classList.add('hidden');
  questionnaireModal.setAttribute('aria-hidden', 'true');
}

function promptQuestionnaireIfNeeded() {
  // Always allow the questionnaire, do not auto-open or block access.
}

function showScheduleSection() {
  scheduleSection.classList.remove('hidden');
}

function hideScheduleSection() {
  scheduleSection.classList.add('hidden');
}

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
});

questionnaireForm.addEventListener('submit', event => {
  event.preventDefault();

  const formData = new FormData(questionnaireForm);
  const questionnaireEntry = {
    date: getTodayDate(),
    mood: formData.get('mood'),
    stress: formData.get('stress'),
    sleepQuality: formData.get('sleepQuality'),
    confidence: formData.get('confidence'),
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
  renderStressSuggestion(questionnaireEntry.stress);
});

questionnaireButton.addEventListener('click', showQuestionnaireModal);
openScheduleButton.addEventListener('click', showScheduleSection);
closeScheduleButton.addEventListener('click', hideScheduleSection);

skipQuestionnaireButton.addEventListener('click', hideQuestionnaireModal);

clearStorageButton.addEventListener('click', () => {
  if (!confirm('Clear all saved schedule entries?')) {
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
  renderEntries();
});

renderEntries();
renderQuestionnaireHistory();
updateQuestionnaireStatus();
renderLatestStressSuggestion();
promptQuestionnaireIfNeeded();
