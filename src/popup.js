/**
 * EdgeLang Popup Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const enableToggle = document.getElementById('enableToggle');
  const autoBtn = document.getElementById('autoBtn');
  const passiveBtn = document.getElementById('passiveBtn');
  const activeBtn = document.getElementById('activeBtn');
  const pauseToggle = document.getElementById('pauseToggle');
  const streakValue = document.getElementById('streakValue');
  const accuracyValue = document.getElementById('accuracyValue');
  const resolvedValue = document.getElementById('resolvedValue');
  const levelValue = document.getElementById('levelValue');
  const siteInfo = document.getElementById('siteInfo');
  const pageMeta = document.getElementById('pageMeta');
  const toggleSiteButton = document.getElementById('toggleSite');
  
  let settings = {};
  let profile = {};
  let currentTab = null;
  let currentPageState = null;
  
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
  
  autoBtn.addEventListener('click', async () => {
    settings.modePreference = 'auto';
    await chrome.runtime.sendMessage({ action: 'setModePreference', modePreference: 'auto' });
    if (currentTab?.id) {
      chrome.tabs.sendMessage(currentTab.id, { action: 'settingsUpdated' }).catch(() => {});
    }
    updateUI();
  });

  passiveBtn.addEventListener('click', async () => {
    settings.modePreference = 'passive';
    await chrome.runtime.sendMessage({ action: 'setModePreference', modePreference: 'passive' });
    if (currentTab?.id) {
      chrome.tabs.sendMessage(currentTab.id, { action: 'settingsUpdated' }).catch(() => {});
    }
    updateUI();
  });
  
  activeBtn.addEventListener('click', async () => {
    settings.modePreference = 'active';
    await chrome.runtime.sendMessage({ action: 'setModePreference', modePreference: 'active' });
    if (currentTab?.id) {
      chrome.tabs.sendMessage(currentTab.id, { action: 'settingsUpdated' }).catch(() => {});
    }
    updateUI();
  });

  pauseToggle.addEventListener('change', async () => {
    settings.isPaused = pauseToggle.checked;
    await chrome.runtime.sendMessage({ action: 'setPaused', isPaused: settings.isPaused });
    if (currentTab?.id) {
      chrome.tabs.sendMessage(currentTab.id, {
        action: 'pauseChanged',
        isPaused: settings.isPaused
      }).catch(() => {});
    }
    updateUI();
  });

  toggleSiteButton.addEventListener('click', async () => {
    const hostname = getCurrentHostname();
    if (!hostname) return;
    const response = await chrome.runtime.sendMessage({
      action: 'toggleCurrentSite',
      hostname
    });
    if (response?.success) {
      settings.siteList = response.siteList;
      updateUI();
      if (currentTab?.id) {
        chrome.tabs.sendMessage(currentTab.id, { action: 'settingsUpdated' }).catch(() => {});
      }
    }
  });
  
  document.getElementById('runCalibration').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openCalibration' });
  });
  
  document.getElementById('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('viewStats').addEventListener('click', async () => {
    await chrome.runtime.openOptionsPage();
  });
  
  async function loadData() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(null, (syncData) => {
        settings = syncData;
        settings.apiKeysConfigured = Object.keys(syncData.apiKeys || {}).length > 0;
        settings.modePreference = syncData.modePreference || 'auto';
        settings.isPaused = syncData.isPaused || false;
        
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
    updateStatusUI();
    enableToggle.disabled = !settings.apiKeysConfigured;
    
    // Mode
    pauseToggle.checked = settings.isPaused;

    autoBtn.classList.toggle('active', settings.modePreference === 'auto');
    if (settings.modePreference === 'active') {
      activeBtn.classList.add('active');
      passiveBtn.classList.remove('active');
      autoBtn.classList.remove('active');
    } else if (settings.modePreference === 'passive') {
      passiveBtn.classList.add('active');
      activeBtn.classList.remove('active');
      autoBtn.classList.remove('active');
    } else {
      passiveBtn.classList.remove('active');
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
      currentTab = tabs[0] || null;
      const hostname = getCurrentHostname();
      siteInfo.textContent = hostname || 'No active site';
      const siteMode = settings.siteMode || 'blacklist';
      const listedSites = settings.siteList?.[siteMode] || [];
      const isListed = hostname ? listedSites.includes(hostname) : false;
      toggleSiteButton.textContent = hostname
        ? (isListed ? `Remove from ${siteMode}` : `Add to ${siteMode}`)
        : 'Site controls unavailable';
      toggleSiteButton.disabled = !hostname;
      if (currentTab?.id) {
        chrome.tabs.sendMessage(currentTab.id, { action: 'getPageState' }).then((pageState) => {
          currentPageState = pageState || null;
          if (!pageState) return;
          const blocker = pageState.blockerReason ? ` • Reason: ${pageState.blockerReason}` : '';
          const processing = pageState.processing ? ' • Processing...' : '';
          pageMeta.textContent = `Page: ${pageState.pageLanguage || 'unknown'} • Mode: ${pageState.currentMode || settings.modePreference}${processing}${blocker}`;
          updateStatusUI();
        }).catch(() => {
          currentPageState = null;
          pageMeta.textContent = `Mode: ${settings.modePreference}`;
        });
      } else {
        pageMeta.textContent = `Mode: ${settings.modePreference}`;
      }
    });
  }

  function getCurrentHostname() {
    try {
      return currentTab?.url ? new URL(currentTab.url).hostname : '';
    } catch {
      return '';
    }
  }

  function updateStatusUI() {
    if (!settings.apiKeysConfigured) {
      statusIndicator.className = 'status-indicator status-warning';
      statusText.textContent = 'Not configured';
      enableToggle.disabled = true;
    } else if (currentPageState?.processing) {
      statusIndicator.className = 'status-indicator status-processing';
      statusText.textContent = 'Processing...';
      enableToggle.checked = true;
    } else if (!settings.enabled) {
      statusIndicator.className = 'status-indicator status-off';
      statusText.textContent = 'Disabled';
      enableToggle.checked = false;
    } else if (settings.isPaused) {
      statusIndicator.className = 'status-indicator status-warning';
      statusText.textContent = 'Paused';
      enableToggle.checked = true;
    } else if (!navigator.onLine) {
      statusIndicator.className = 'status-indicator status-off';
      statusText.textContent = 'Offline';
      enableToggle.checked = true;
    } else {
      statusIndicator.className = 'status-indicator status-active';
      statusText.textContent = 'Active';
      enableToggle.checked = true;
    }
  }
});
