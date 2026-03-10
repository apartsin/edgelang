/**
 * EdgeLang Options Script
 */

const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'Arabic' },
  { code: 'bg', label: 'Bulgarian' },
  { code: 'cs', label: 'Cestina' },
  { code: 'da', label: 'Dansk' },
  { code: 'de', label: 'Deutsch' },
  { code: 'el', label: 'Ellinika' },
  { code: 'es', label: 'Espanol' },
  { code: 'fi', label: 'Suomi' },
  { code: 'fr', label: 'Francais' },
  { code: 'he', label: 'Hebrew' },
  { code: 'hi', label: 'Hindi' },
  { code: 'hu', label: 'Magyar' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'it', label: 'Italiano' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'no', label: 'Norsk' },
  { code: 'pl', label: 'Polski' },
  { code: 'pt', label: 'Portugues' },
  { code: 'ro', label: 'Romana' },
  { code: 'ru', label: 'Russian' },
  { code: 'sk', label: 'Slovencina' },
  { code: 'sr', label: 'Srpski' },
  { code: 'sv', label: 'Svenska' },
  { code: 'th', label: 'Thai' },
  { code: 'tr', label: 'Turkce' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'vi', label: 'Tieng Viet' },
  { code: 'zh', label: 'Chinese' }
];

document.addEventListener('DOMContentLoaded', async () => {
  populateLanguageSelects();
  // Load settings
  await loadSettings();
  await loadCalibrationProgress();
  await loadStatistics();
  
  // Event listeners
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  document.getElementById('exportData').addEventListener('click', exportData);
  document.getElementById('exportVocabulary').addEventListener('click', exportVocabulary);
  document.getElementById('clearData').addEventListener('click', clearData);
  document.getElementById('addSite').addEventListener('click', addSite);
  document.getElementById('validateKeys').addEventListener('click', validateKeys);
  document.getElementById('startCalibration').addEventListener('click', startCalibration);
  document.getElementById('stopCalibration').addEventListener('click', stopCalibration);
  document.getElementById('continueCalibration').addEventListener('click', startCalibration);
  
  // Radio groups
  setupRadioGroup('cueStyle', 'visualCueStyle');
  setupRadioGroup('siteMode', 'siteMode');
  
  // Sliders
  document.getElementById('questionIntensity').addEventListener('input', (e) => {
    document.getElementById('intensityValue').textContent = e.target.value + '%';
  });
  
  document.getElementById('recallIntensity').addEventListener('input', (e) => {
    document.getElementById('recallValue').textContent = e.target.value + '%';
  });
  
  // Enter key for adding site
  document.getElementById('newSite').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addSite();
  });
});

let settings = {};
let calibrationSession = null;

function populateLanguageSelects() {
  const native = document.getElementById('nativeLanguage');
  const target = document.getElementById('targetLanguage');
  const optionsMarkup = SUPPORTED_LANGUAGES.map((language) =>
    `<option value="${language.code}">${language.label}</option>`
  ).join('');
  native.innerHTML = optionsMarkup;
  target.innerHTML = optionsMarkup;
}

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(null, (result) => {
      settings = result;
      
      // Languages
      document.getElementById('nativeLanguage').value = settings.nativeLanguage || 'en';
      document.getElementById('targetLanguage').value = settings.targetLanguage || 'es';
      
      // API Keys
      document.getElementById('openaiKey').value = settings.apiKeys?.openai || '';
      document.getElementById('anthropicKey').value = settings.apiKeys?.anthropic || '';
      document.getElementById('googleKey').value = settings.apiKeys?.google || '';
      document.getElementById('groqKey').value = settings.apiKeys?.groq || '';
      document.getElementById('openrouterKey').value = settings.apiKeys?.openrouter || '';
      document.getElementById('model-openai').value = settings.modelSelection?.openai || 'gpt-3.5-turbo';
      document.getElementById('model-anthropic').value = settings.modelSelection?.anthropic || 'claude-3-haiku-20240307';
      document.getElementById('model-google').value = settings.modelSelection?.google || 'gemini-1.5-flash';
      document.getElementById('model-groq').value = settings.modelSelection?.groq || 'llama-3.1-70b-versatile';
      document.getElementById('model-openrouter').value = settings.modelSelection?.openrouter || 'google/gemini-2.0-flash-001';
      
      // Visual
      selectRadio('cueStyle', settings.visualCueStyle || 'underline');
      document.getElementById('highlightColor').value = settings.highlightColor || '#f2a7a7';
      document.getElementById('questionIntensity').value = settings.questionIntensity || 5;
      document.getElementById('intensityValue').textContent = (settings.questionIntensity || 5) + '%';
      document.getElementById('recallIntensity').value = settings.recallIntensity || 10;
      document.getElementById('recallValue').textContent = (settings.recallIntensity || 10) + '%';
      document.getElementById('multipleChoiceCount').value = String(settings.multipleChoiceCount || 5);
      
      // Feedback
      document.getElementById('positiveFeedback').checked = settings.positiveFeedback !== false;
      document.getElementById('negativeFeedback').checked = settings.negativeFeedback !== false;
      document.getElementById('audioEnabled').checked = settings.audioEnabled || false;
      document.getElementById('autoStartCalibration').checked = settings.autoStartCalibration !== false;
      document.getElementById('autoDetectLanguage').checked = settings.autoDetectLanguage !== false;
      
      // Site mode
      selectRadio('siteMode', settings.siteMode || 'blacklist');
      updateSiteList();
      updateCalibrationSummary();
      
      resolve();
    });
  });
}

async function saveSettings() {
  const newSettings = {
    nativeLanguage: document.getElementById('nativeLanguage').value,
    targetLanguage: document.getElementById('targetLanguage').value,
    apiKeys: {
      openai: document.getElementById('openaiKey').value,
      anthropic: document.getElementById('anthropicKey').value,
      google: document.getElementById('googleKey').value,
      groq: document.getElementById('groqKey').value,
      openrouter: document.getElementById('openrouterKey').value
    },
    modelSelection: {
      openai: document.getElementById('model-openai').value,
      anthropic: document.getElementById('model-anthropic').value,
      google: document.getElementById('model-google').value,
      groq: document.getElementById('model-groq').value,
      openrouter: document.getElementById('model-openrouter').value
    },
    visualCueStyle: getSelectedValue('cueStyle'),
    highlightColor: document.getElementById('highlightColor').value,
    questionIntensity: parseInt(document.getElementById('questionIntensity').value),
    recallIntensity: parseInt(document.getElementById('recallIntensity').value),
    multipleChoiceCount: parseInt(document.getElementById('multipleChoiceCount').value),
    positiveFeedback: document.getElementById('positiveFeedback').checked,
    negativeFeedback: document.getElementById('negativeFeedback').checked,
    audioEnabled: document.getElementById('audioEnabled').checked,
    autoStartCalibration: document.getElementById('autoStartCalibration').checked,
    autoDetectLanguage: document.getElementById('autoDetectLanguage').checked,
    siteMode: getSelectedValue('siteMode'),
    siteList: settings.siteList || { blacklist: [], whitelist: [] }
  };
  
  // Remove empty API keys
  Object.keys(newSettings.apiKeys).forEach(key => {
    if (!newSettings.apiKeys[key]) delete newSettings.apiKeys[key];
  });
  
  await chrome.storage.sync.set(newSettings);
  settings = { ...settings, ...newSettings };
  
  showNotification('Settings saved!');
  
  // Notify content scripts
  const tabs = await chrome.tabs.query({});
  tabs.forEach(tab => {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'settingsUpdated' }).catch(() => {});
    }
  });

  chrome.storage.local.get(['calibrationData'], (result) => {
    const needsCalibration = !result.calibrationData && Object.keys(newSettings.apiKeys).length > 0;
    if (needsCalibration && newSettings.autoStartCalibration !== false) {
      startCalibration();
    }
  });
}

function getApiKeysFromForm() {
  const apiKeys = {
    openai: document.getElementById('openaiKey').value.trim(),
    anthropic: document.getElementById('anthropicKey').value.trim(),
    google: document.getElementById('googleKey').value.trim(),
    groq: document.getElementById('groqKey').value.trim(),
    openrouter: document.getElementById('openrouterKey').value.trim()
  };

  Object.keys(apiKeys).forEach((key) => {
    if (!apiKeys[key]) {
      delete apiKeys[key];
    }
  });

  return apiKeys;
}

function getModelSelectionFromForm() {
  return {
    openai: document.getElementById('model-openai').value,
    anthropic: document.getElementById('model-anthropic').value,
    google: document.getElementById('model-google').value,
    groq: document.getElementById('model-groq').value,
    openrouter: document.getElementById('model-openrouter').value
  };
}

async function validateKeys() {
  const button = document.getElementById('validateKeys');
  const validationResults = document.getElementById('validationResults');
  const apiKeys = getApiKeysFromForm();
  const modelSelection = getModelSelectionFromForm();

  if (Object.keys(apiKeys).length === 0) {
    renderValidationResults([{ provider: 'none', valid: false, message: 'Enter at least one API key first.' }]);
    return;
  }

  button.disabled = true;
  button.textContent = 'Validating...';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'validateApiKeys',
      apiKeys,
      modelSelection
    });

    renderValidationResults(response?.results || [{
      provider: 'unknown',
      valid: false,
      message: response?.error || 'Validation failed'
    }]);

    if (response?.success) {
      validationResults.classList.add('show');
      showNotification('Validation finished');
    }
  } catch (error) {
    renderValidationResults([{
      provider: 'unknown',
      valid: false,
      message: error.message || 'Validation failed'
    }]);
  } finally {
    button.disabled = false;
    button.textContent = 'Validate Keys';
  }
}

function renderValidationResults(results) {
  const validationResults = document.getElementById('validationResults');
  validationResults.innerHTML = results.map((result) => `
    <div class="status-item ${result.valid ? 'valid' : 'invalid'}">
      <span>${capitalize(result.provider)}</span>
      <span>${result.model ? `${result.model} - ` : ''}${result.message}</span>
    </div>
  `).join('');
  validationResults.classList.add('show');
}

function exportData() {
  chrome.storage.sync.get(null, (syncData) => {
    chrome.storage.local.get(null, (localData) => {
      const payload = {
        sync: syncData,
        local: localData
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'edgelang-data-' + Date.now() + '.json';
      a.click();
      URL.revokeObjectURL(url);
      showNotification('Data exported!');
    });
  });
}

function exportVocabulary() {
  chrome.storage.local.get(['learnerProfile'], (data) => {
    const vocabulary = data.learnerProfile?.vocabulary || {};
    const rows = Object.entries(vocabulary).map(([term, stats]) => ({
      term,
      attempts: stats.attempts || 0,
      correct: stats.correct || 0
    }));
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'edgelang-vocabulary-' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Vocabulary exported!');
  });
}

function clearData() {
  if (confirm('Are you sure you want to clear all learning data? This cannot be undone.')) {
    chrome.storage.local.clear(() => {
      chrome.storage.sync.clear(() => {
        settings = {};
        showNotification('Data cleared!');
        loadSettings().then(loadStatistics);
      });
    });
  }
}

function addSite() {
  const input = document.getElementById('newSite');
  const site = input.value.trim().toLowerCase();
  
  if (!site) return;
  
  const mode = getSelectedValue('siteMode');
  settings.siteList = settings.siteList || { blacklist: [], whitelist: [] };
  
  if (!settings.siteList[mode].includes(site)) {
    settings.siteList[mode].push(site);
    chrome.storage.sync.set({ siteList: settings.siteList });
  }
  
  input.value = '';
  updateSiteList();
}

function removeSite(site, mode) {
  settings.siteList = settings.siteList || { blacklist: [], whitelist: [] };
  settings.siteList[mode] = settings.siteList[mode].filter(s => s !== site);
  chrome.storage.sync.set({ siteList: settings.siteList });
  updateSiteList();
}

function updateSiteList() {
  const mode = getSelectedValue('siteMode');
  const sites = settings.siteList?.[mode] || [];
  const hint = document.getElementById('siteListHint');
  
  if (sites.length === 0) {
    hint.innerHTML = 'No sites in ' + mode;
    return;
  }
  
  hint.innerHTML = sites.map(s => 
    `<span class="site-tag">${s} <button onclick="removeSite('${s}', '${mode}')">&times;</button></span>`
  ).join(' ');
}

function setupRadioGroup(groupId, settingKey) {
  const container = document.getElementById(groupId);
  container.querySelectorAll('.radio-option').forEach(opt => {
    opt.addEventListener('click', () => {
      selectRadio(groupId, opt.dataset.value);
    });
  });
}

function selectRadio(groupId, value) {
  const container = document.getElementById(groupId);
  container.querySelectorAll('.radio-option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.value === value);
  });
}

function getSelectedValue(groupId) {
  const container = document.getElementById(groupId);
  const selected = container.querySelector('.radio-option.selected');
  return selected?.dataset.value;
}

function showNotification(message) {
  const notif = document.getElementById('notification');
  notif.textContent = message;
  notif.classList.add('show');
  setTimeout(() => notif.classList.remove('show'), 2000);
}

async function startCalibration() {
  if (calibrationSession) {
    document.getElementById('calibrationIntro').style.display = 'none';
    document.getElementById('calibrationResult').style.display = 'none';
    document.getElementById('calibrationWizard').style.display = 'block';
    renderCalibrationQuestion();
    return;
  }

  const selfAssessedLevel = document.getElementById('selfAssessedLevel').value;
  const response = await chrome.runtime.sendMessage({
    action: 'getCalibrationQuestions',
    selfAssessedLevel
  });
  const questions = response?.questions || [];
  if (!questions.length) {
    showNotification('No calibration questions available.');
    return;
  }

  calibrationSession = {
    targetLanguage: response.targetLanguage,
    selfAssessedLevel: document.getElementById('selfAssessedLevel').value,
    questions,
    answers: [],
    currentIndex: 0
  };
  persistCalibrationProgress();

  document.getElementById('calibrationIntro').style.display = 'none';
  document.getElementById('calibrationResult').style.display = 'none';
  document.getElementById('calibrationWizard').style.display = 'block';
  renderCalibrationQuestion();
}

function stopCalibration() {
  document.getElementById('calibrationWizard').style.display = 'none';
  document.getElementById('calibrationIntro').style.display = 'block';
  document.getElementById('calibrationResult').style.display = 'none';
  if (calibrationSession) {
    showNotification('Calibration paused. You can resume later.');
  }
}

function renderCalibrationQuestion() {
  if (!calibrationSession) return;

  const question = calibrationSession.questions[calibrationSession.currentIndex];
  if (!question) {
    finishCalibration();
    return;
  }

  document.getElementById('calibrationProgress').textContent =
    `Question ${calibrationSession.currentIndex + 1} of ${calibrationSession.questions.length}`;
  document.getElementById('calibrationType').textContent =
    `${question.type === 'passive' ? 'Passive recognition' : 'Active recall'} • ${question.difficulty}`;
  document.getElementById('calibrationPrompt').textContent = question.prompt;

  const choices = document.getElementById('calibrationChoices');
  choices.innerHTML = question.choices.map((choice, index) => `
    <button class="btn btn-secondary calibration-choice" data-index="${index}" data-choice="${choice}">
      ${choice}
    </button>
  `).join('');

  choices.querySelectorAll('.calibration-choice').forEach(button => {
    button.addEventListener('click', () => submitCalibrationAnswer(button.dataset.choice));
  });
}

function submitCalibrationAnswer(choice) {
  const question = calibrationSession.questions[calibrationSession.currentIndex];
  calibrationSession.answers.push({
    questionId: question.id,
    type: question.type,
    difficulty: question.difficulty,
    selectedAnswer: choice,
    correctAnswer: question.correctAnswer,
    correct: choice === question.correctAnswer
  });
  calibrationSession.currentIndex += 1;
  persistCalibrationProgress();
  renderCalibrationQuestion();
}

async function finishCalibration() {
  const result = await chrome.runtime.sendMessage({
    action: 'runCalibration',
    answers: calibrationSession.answers
  });

  document.getElementById('calibrationWizard').style.display = 'none';
  document.getElementById('calibrationResult').style.display = 'block';
  document.getElementById('calibrationLevel').textContent =
    `Estimated level: ${capitalize(result.level)}`;
  document.getElementById('calibrationSummary').textContent =
    `${Math.round(result.accuracy * 100)}% accuracy across ${result.totalQuestions} questions.`;
  calibrationSession = null;
  chrome.storage.local.remove(['calibrationProgress']);
  updateCalibrationSummary();
}

function updateCalibrationSummary() {
  chrome.storage.local.get(['calibrationData'], (result) => {
    if (!result.calibrationData) return;
    document.getElementById('calibrationLevel').textContent =
      `Estimated level: ${capitalize(result.calibrationData.level)}`;
    document.getElementById('calibrationSummary').textContent =
      `${Math.round((result.calibrationData.accuracy || 0) * 100)}% accuracy in the last round.`;
  });
}

async function loadStatistics() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['learnerProfile'], (result) => {
      const profile = result.learnerProfile || {};
      const stats = profile.stats || {};
      const vocabulary = profile.vocabulary || {};

      document.getElementById('statsMastered').textContent = String(profile.resolvedItems?.length || 0);
      document.getElementById('statsStreak').textContent = String(stats.streak || 0);
      const accuracy = stats.totalAnswered > 0
        ? Math.round((stats.correctAnswers / stats.totalAnswered) * 100)
        : 0;
      document.getElementById('statsAccuracy').textContent = `${accuracy}%`;
      document.getElementById('statsAttempts').textContent = String(stats.totalAnswered || 0);
      document.getElementById('statsWords').textContent = String(Object.keys(vocabulary).length);
      document.getElementById('statsLastActive').textContent = stats.lastActive
        ? new Date(stats.lastActive).toLocaleDateString()
        : 'Never';
      resolve();
    });
  });
}

async function loadCalibrationProgress() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['calibrationProgress'], (result) => {
      calibrationSession = result.calibrationProgress || null;
      if (calibrationSession) {
        document.getElementById('startCalibration').textContent = 'Resume Calibration';
        document.getElementById('calibrationIntro').querySelector('.input-hint').textContent =
          `Resume your saved round at question ${calibrationSession.currentIndex + 1} of ${calibrationSession.questions.length}.`;
      }
      resolve();
    });
  });
}

function persistCalibrationProgress() {
  chrome.storage.local.set({ calibrationProgress: calibrationSession });
  document.getElementById('startCalibration').textContent = 'Resume Calibration';
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

// Make removeSite available globally
window.removeSite = removeSite;
