/**
 * EdgeLang Options Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Load settings
  await loadSettings();
  
  // Event listeners
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  document.getElementById('exportData').addEventListener('click', exportData);
  document.getElementById('clearData').addEventListener('click', clearData);
  document.getElementById('addSite').addEventListener('click', addSite);
  
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
      
      // Visual
      selectRadio('cueStyle', settings.visualCueStyle || 'underline');
      document.getElementById('questionIntensity').value = settings.questionIntensity || 5;
      document.getElementById('intensityValue').textContent = (settings.questionIntensity || 5) + '%';
      document.getElementById('recallIntensity').value = settings.recallIntensity || 10;
      document.getElementById('recallValue').textContent = (settings.recallIntensity || 10) + '%';
      
      // Feedback
      document.getElementById('positiveFeedback').checked = settings.positiveFeedback !== false;
      document.getElementById('negativeFeedback').checked = settings.negativeFeedback !== false;
      document.getElementById('audioEnabled').checked = settings.audioEnabled || false;
      
      // Site mode
      selectRadio('siteMode', settings.siteMode || 'blacklist');
      updateSiteList();
      
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
      google: document.getElementById('googleKey').value
    },
    visualCueStyle: getSelectedValue('cueStyle'),
    questionIntensity: parseInt(document.getElementById('questionIntensity').value),
    recallIntensity: parseInt(document.getElementById('recallIntensity').value),
    positiveFeedback: document.getElementById('positiveFeedback').checked,
    negativeFeedback: document.getElementById('negativeFeedback').checked,
    audioEnabled: document.getElementById('audioEnabled').checked,
    siteMode: getSelectedValue('siteMode'),
    siteList: settings.siteList || { blacklist: [], whitelist: [] }
  };
  
  // Remove empty API keys
  Object.keys(newSettings.apiKeys).forEach(key => {
    if (!newSettings.apiKeys[key]) delete newSettings.apiKeys[key];
  });
  
  await chrome.storage.sync.set(newSettings);
  
  showNotification('Settings saved!');
  
  // Notify content scripts
  const tabs = await chrome.tabs.query({});
  tabs.forEach(tab => {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'settingsUpdated' }).catch(() => {});
    }
  });
}

function exportData() {
  chrome.storage.local.get(null, (data) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'edgelang-data-' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Data exported!');
  });
}

function clearData() {
  if (confirm('Are you sure you want to clear all learning data? This cannot be undone.')) {
    chrome.storage.local.clear();
    showNotification('Data cleared!');
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

// Make removeSite available globally
window.removeSite = removeSite;
