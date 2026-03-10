/**
 * EdgeLang Popup Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const enableToggle = document.getElementById('enableToggle');
  const passiveBtn = document.getElementById('passiveBtn');
  const activeBtn = document.getElementById('activeBtn');
  const streakValue = document.getElementById('streakValue');
  const accuracyValue = document.getElementById('accuracyValue');
  const resolvedValue = document.getElementById('resolvedValue');
  const levelValue = document.getElementById('levelValue');
  const siteInfo = document.getElementById('siteInfo');
  
  let settings = {};
  let profile = {};
  
  // Load data
  await loadData();
  
  // Update UI
  updateUI();
  
  // Event listeners
  enableToggle.addEventListener('change', async () => {
    settings.enabled = enableToggle.checked;
    await chrome.storage.sync.set({ enabled: settings.enabled });
    
    // Notify content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'toggleEnabled',
        enabled: settings.enabled
      });
    }
    
    updateUI();
  });
  
  passiveBtn.addEventListener('click', () => {
    settings.currentMode = 'passive';
    passiveBtn.classList.add('active');
    activeBtn.classList.remove('active');
  });
  
  activeBtn.addEventListener('click', () => {
    settings.currentMode = 'active';
    activeBtn.classList.add('active');
    passiveBtn.classList.remove('active');
  });
  
  document.getElementById('runCalibration').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'startCalibration' });
    // Open calibration in new tab or options
    chrome.runtime.sendMessage({ action: 'openCalibration' });
  });
  
  document.getElementById('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  async function loadData() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(null, (syncData) => {
        settings = syncData;
        settings.apiKeysConfigured = Object.keys(syncData.apiKeys || {}).length > 0;
        
        chrome.storage.local.get(['learnerProfile'], (localData) => {
          profile = localData.learnerProfile || {
            level: 'novice',
            resolvedItems: [],
            stats: { totalAnswered: 0, correctAnswers: 0, streak: 0 }
          };
          resolve();
        });
      });
    });
  }
  
  function updateUI() {
    // Status
    if (!settings.apiKeysConfigured) {
      statusIndicator.className = 'status-indicator status-warning';
      statusText.textContent = 'Not configured';
      enableToggle.disabled = true;
    } else if (!settings.enabled) {
      statusIndicator.className = 'status-indicator status-off';
      statusText.textContent = 'Disabled';
      enableToggle.checked = false;
    } else {
      statusIndicator.className = 'status-indicator status-active';
      statusText.textContent = 'Active';
      enableToggle.checked = true;
    }
    
    enableToggle.disabled = !settings.apiKeysConfigured;
    
    // Mode
    if (settings.currentMode === 'active') {
      activeBtn.classList.add('active');
      passiveBtn.classList.remove('active');
    } else {
      passiveBtn.classList.add('active');
      activeBtn.classList.remove('active');
    }
    
    // Stats
    const stats = profile.stats || { streak: 0, totalAnswered: 0, correctAnswers: 0 };
    streakValue.textContent = stats.streak || 0;
    
    const accuracy = stats.totalAnswered > 0 
      ? Math.round((stats.correctAnswers / stats.totalAnswered) * 100) 
      : 0;
    accuracyValue.textContent = accuracy + '%';
    
    resolvedValue.textContent = profile.resolvedItems?.length || 0;
    levelValue.textContent = (profile.level || 'novice').charAt(0).toUpperCase();
    
    // Site info
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const url = new URL(tabs[0].url);
        siteInfo.textContent = url.hostname;
      }
    });
  }
});
