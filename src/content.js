/**
 * EdgeLang Content Script
 * Handles text extraction, visual cue rendering, and popup interactions
 */

(function() {
  'use strict';

  // State
  let isEnabled = true;
  let settings = {};
  let learnerProfile = null;
  let pageCues = [];
  let currentPopup = null;
  let isProcessing = false;
  let currentScrollHandler = null;
  let hidePopupTimer = null;
  let currentPageLanguage = null;
  let currentCueIndex = -1;
  let mutationObserver = null;
  let processRetryTimer = null;
  let lastProcessedSignature = null;
  let blockerReason = null;

  // Constants
  const POPUP_CLASS = 'edgelang-popup';
  const CUE_CLASS = 'edgelang-cue';
  const SENSITIVE_INPUT_TYPES = ['password', 'email', 'tel', 'credit-card', 'number'];
  const SENSITIVE_FIELD_NAMES = ['cvv', 'cvc', 'cc', 'card', 'password', 'secret'];

  // Initialize
  async function init() {
    try {
      logDebug('init:start', { href: window.location.href });
      await loadSettings();
      await loadLearnerProfile();
      setupPageObserver();
      
      const startupBlocker = getBlockerReason();
      if (startupBlocker) {
        blockerReason = startupBlocker;
        logDebug('init:blocked', { reason: startupBlocker });
        clearCues();
        updateIconState();
        return;
      }

      const pageLanguage = await detectPageLanguage();
      currentPageLanguage = pageLanguage;
      const isForeignPage = pageLanguage === settings.targetLanguage;
      
      if (settings.modePreference === 'passive' || settings.modePreference === 'active') {
        settings.currentMode = settings.modePreference;
      } else {
        settings.currentMode = isForeignPage ? 'passive' : 'active';
      }
      logDebug('init:mode-selected', {
        pageLanguage,
        targetLanguage: settings.targetLanguage,
        nativeLanguage: settings.nativeLanguage,
        currentMode: settings.currentMode
      });
      
      await processPage();
      updateIconState();
    } catch (error) {
      console.error('EdgeLang init error:', error);
      blockerReason = 'init_error';
      logDebug('init:error', { message: error.message });
    }
  }

  // Load settings from storage
  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get([
        'enabled',
        'nativeLanguage',
        'targetLanguage',
        'apiKeys',
        'modelSelection',
        'visualCueStyle',
        'highlightColor',
        'questionIntensity',
        'recallIntensity',
        'multipleChoiceCount',
        'positiveFeedback',
        'negativeFeedback',
        'audioEnabled',
        'siteMode',
        'siteList',
        'autoDetectLanguage',
        'modePreference',
        'isPaused'
      ], (result) => {
        settings = {
          enabled: result.enabled !== false,
          nativeLanguage: result.nativeLanguage || 'en',
          targetLanguage: result.targetLanguage || 'es',
          apiKeys: result.apiKeys || {},
          modelSelection: result.modelSelection || {},
          visualCueStyle: result.visualCueStyle || 'underline',
          highlightColor: result.highlightColor || '#f2a7a7',
          questionIntensity: result.questionIntensity || 5,
          recallIntensity: result.recallIntensity || 10,
          multipleChoiceCount: result.multipleChoiceCount || 5,
          positiveFeedback: result.positiveFeedback !== false,
          negativeFeedback: result.negativeFeedback !== false,
          audioEnabled: result.audioEnabled || false,
          siteMode: result.siteMode || 'blacklist',
          siteList: result.siteList || { blacklist: [], whitelist: [] },
          autoDetectLanguage: result.autoDetectLanguage !== false,
          modePreference: result.modePreference || 'auto',
          isPaused: result.isPaused || false,
          currentMode: 'passive'
        };
        
        settings.apiKeysConfigured = Object.keys(settings.apiKeys).length > 0;
        
        // Check if current site is allowed
        const currentHost = window.location.hostname;
        if (settings.siteMode === 'whitelist' && !settings.siteList.whitelist.includes(currentHost)) {
          settings.siteEnabled = false;
        } else if (settings.siteMode === 'blacklist' && settings.siteList.blacklist.includes(currentHost)) {
          settings.siteEnabled = false;
        } else {
          settings.siteEnabled = true;
        }
        
        isEnabled = settings.enabled && settings.apiKeysConfigured && settings.siteEnabled;
        logDebug('settings:loaded', {
          enabled: settings.enabled,
          apiKeysConfigured: settings.apiKeysConfigured,
          siteEnabled: settings.siteEnabled,
          siteMode: settings.siteMode,
          host: currentHost,
          paused: settings.isPaused
        });
        
        resolve();
      });
    });
  }

  // Load learner profile
  async function loadLearnerProfile() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['learnerProfile', 'calibrationData'], (result) => {
        learnerProfile = result.learnerProfile || {
          level: 'intermediate',
          vocabulary: {},
          resolvedItems: [],
          confusionPatterns: [],
          stats: {
            totalAnswered: 0,
            correctAnswers: 0,
            streak: 0,
            lastActive: null
          }
        };
        
        if (result.calibrationData) {
          learnerProfile.level = result.calibrationData.level || 'intermediate';
        }
        logDebug('profile:loaded', {
          level: learnerProfile.level,
          resolvedCount: learnerProfile.resolvedItems?.length || 0
        });
        
        resolve();
      });
    });
  }

  // Detect page language using simple heuristics
  async function detectPageLanguage() {
    if (settings.autoDetectLanguage === false) {
      const language = settings.currentMode === 'active'
        ? settings.nativeLanguage
        : settings.targetLanguage;
      logDebug('detect-page-language:manual', { language });
      return language;
    }

    // Use document language as primary indicator
    const docLang = document.documentElement.lang;
    if (docLang && docLang !== '') {
      const language = docLang.split('-')[0];
      logDebug('detect-page-language:document', { language });
      return language;
    }
    
    // Fall back to content analysis via background
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'detectLanguage',
        text: document.body.innerText.substring(0, 5000)
      }, (response) => {
        const language = response?.language || settings.nativeLanguage;
        logDebug('detect-page-language:background', { language });
        resolve(language);
      });
    });
  }

  // Process page to find learnable items
  async function processPage(force = false, reason = 'manual') {
    const currentBlocker = getBlockerReason();
    if (currentBlocker) {
      blockerReason = currentBlocker;
      logDebug('process:blocked', { reason: currentBlocker, trigger: reason });
      return;
    }
    if (isProcessing) {
      logDebug('process:skipped', { reason: 'already_processing', trigger: reason });
      return;
    }
    isProcessing = true;
    blockerReason = null;
    updateIconState(true);
    logDebug('process:start', { trigger: reason });

    try {
      const text = extractPageText();
      if (!text || text.length < 100) {
        blockerReason = 'insufficient_text';
        logDebug('process:blocked', { reason: blockerReason, textLength: text?.length || 0, trigger: reason });
        return;
      }

      const signature = `${settings.currentMode}:${text.length}:${text.substring(0, 300)}`;
      if (!force && signature === lastProcessedSignature) {
        blockerReason = 'already_processed_same_content';
        logDebug('process:skipped', { reason: blockerReason, trigger: reason });
        return;
      }
      lastProcessedSignature = signature;

      // Send to background for LLM analysis
      const response = await chrome.runtime.sendMessage({
        action: 'analyzePage',
        text: text,
        language: settings.currentMode === 'passive' ? settings.targetLanguage : settings.nativeLanguage,
        learnerLevel: learnerProfile.level,
        intensity: settings.questionIntensity,
        resolvedItems: learnerProfile.resolvedItems,
        mode: settings.currentMode
      });

      if (response?.error) {
        blockerReason = response.error;
        logDebug('process:error-response', { error: response.error, trigger: reason });
        clearCues();
        return;
      }

      if (response && response.cues) {
        const resolvedItems = new Set(learnerProfile.resolvedItems || []);
        pageCues = response.cues.filter(cue => !resolvedItems.has(cue.text));
        renderCues(pageCues);
        blockerReason = pageCues.length ? null : 'no_cues_after_filtering';
        logDebug('process:complete', {
          trigger: reason,
          receivedCueCount: response.cues.length,
          renderedCueCandidates: pageCues.length
        });
      }
    } catch (error) {
      console.error('EdgeLang process error:', error);
      blockerReason = 'process_error';
      logDebug('process:error', { message: error.message, trigger: reason });
    } finally {
      isProcessing = false;
      updateIconState(false);
    }
  }

  // Extract visible text from page, excluding sensitive content
  function extractPageText() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // Skip hidden elements
          if (node.parentElement.offsetParent === null) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip sensitive inputs
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          const tagName = parent.tagName.toLowerCase();
          const inputType = parent.type?.toLowerCase();
          const fieldName = parent.name?.toLowerCase();
          
          // Skip form inputs
          if (tagName === 'input' || tagName === 'textarea' || parent.isContentEditable) {
            if (SENSITIVE_INPUT_TYPES.includes(inputType) || 
                SENSITIVE_FIELD_NAMES.some(f => fieldName?.includes(f))) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip script and style tags
          if (tagName === 'script' || tagName === 'style' || tagName === 'noscript') {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip empty or whitespace-only nodes
          if (!node.textContent.trim()) {
            return NodeFilter.FILTER_REJECT;
          }
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textParts = [];
    let node;
    while (node = walker.nextNode()) {
      textParts.push(node.textContent.trim());
    }

    const text = textParts.join(' ').substring(0, 50000);
    logDebug('extract:text', { textLength: text.length, nodeCount: textParts.length });
    return text;
  }

  // Render visual cues on page
  function renderCues(cues) {
    clearCues();
    
    if (!cues || cues.length === 0) {
      blockerReason = 'no_cues_from_analysis';
      logDebug('render:empty');
      return;
    }

    // Calculate how many cues to show based on intensity
    const wordCount = document.body.innerText.split(/\s+/).length;
    const maxCues = Math.max(1, Math.floor(wordCount * (settings.questionIntensity / 100)));
    const cuesToShow = cues.slice(0, maxCues);
    let renderedCount = 0;
    logDebug('render:start', { cueCount: cues.length, maxCues, wordCount });

    cuesToShow.forEach((cue, index) => {
      try {
        // Find the text in the page and wrap it
        const textNodes = findTextNodes(cue.text);
        
        textNodes.forEach(node => {
          if (!node.parentElement || node.parentElement.classList.contains(CUE_CLASS)) return;
          
          const span = document.createElement('span');
          span.className = `${CUE_CLASS} edgelang-cue-${settings.visualCueStyle}`;
          applyCueColor(span, settings.highlightColor);
          span.dataset.cueIndex = index;
          span.dataset.text = cue.text;
          span.dataset.translation = cue.translation;
          span.dataset.correctAnswer = cue.correctAnswer;
          
          if (cue.distractors) {
            span.dataset.distractors = JSON.stringify(cue.distractors);
          }

          // Add event listeners
          span.addEventListener('mouseenter', showPopup);
          span.addEventListener('click', showPopup);

          if (wrapTextMatchInNode(node, cue.text, span)) {
            renderedCount += 1;
          }
        });
      } catch (e) {
        console.warn('EdgeLang: Could not render cue for:', cue.text);
        logDebug('render:warning', { cue: cue.text, message: e.message });
      }
    });
    blockerReason = renderedCount > 0 ? null : 'no_dom_matches_for_cues';
    logDebug('render:complete', { renderedCount, blockerReason });
  }

  // Find text nodes containing target text
  function findTextNodes(targetText) {
    const targets = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    let node;
    const searchText = targetText.toLowerCase();
    
    while (node = walker.nextNode()) {
      if (!node.parentElement) continue;
      const parentTag = node.parentElement.tagName?.toLowerCase();
      if (['script', 'style', 'textarea'].includes(parentTag) || node.parentElement.isContentEditable) {
        continue;
      }

      if (node.textContent.toLowerCase().includes(searchText)) {
        targets.push(node);
      }
    }
    
    logDebug('render:find-text-nodes', { targetText, matchCount: targets.length });
    return targets.slice(0, 3); // Limit to first 3 occurrences
  }

  function wrapTextMatchInNode(node, targetText, wrapper) {
    const originalText = node.textContent;
    const searchText = targetText.toLowerCase();
    const index = originalText.toLowerCase().indexOf(searchText);

    if (index === -1 || !node.parentNode) return false;

    const beforeNode = index > 0 ? node.splitText(index) : node;
    const afterNode = beforeNode.splitText(targetText.length);
    beforeNode.parentNode.replaceChild(wrapper, beforeNode);
    wrapper.textContent = beforeNode.textContent;
    logDebug('render:wrapped', { targetText });
    return !!afterNode;
  }

  function applyCueColor(element, color) {
    const safeColor = normalizeHexColor(color);
    element.style.setProperty('--edgelang-cue-color', safeColor);
    element.style.setProperty('--edgelang-cue-soft', hexToRgba(safeColor, 0.18));
    element.style.setProperty('--edgelang-cue-hover', hexToRgba(safeColor, 0.28));
  }

  function normalizeHexColor(color) {
    if (typeof color !== 'string') return '#f2a7a7';
    const value = color.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
    if (/^#[0-9a-fA-F]{3}$/.test(value)) {
      return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
    }
    return '#f2a7a7';
  }

  function hexToRgba(color, alpha) {
    const normalized = normalizeHexColor(color);
    const r = parseInt(normalized.slice(1, 3), 16);
    const g = parseInt(normalized.slice(3, 5), 16);
    const b = parseInt(normalized.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Show popup on hover/click
  function showPopup(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const cueElement = event.target.closest(`.${CUE_CLASS}`);
    if (!cueElement) return;

    hidePopup(); // Hide any existing popup
    clearHidePopupTimer();

    const cueData = {
      text: cueElement.dataset.text,
      translation: cueElement.dataset.translation,
      correctAnswer: cueElement.dataset.correctAnswer,
      distractors: cueElement.dataset.distractors ? JSON.parse(cueElement.dataset.distractors) : []
    };

    currentPopup = createPopup(cueData, cueElement);
    document.body.appendChild(currentPopup);
    logDebug('popup:show', { text: cueData.text });

    // Position popup
    const rect = cueElement.getBoundingClientRect();
    currentPopup.style.top = `${rect.bottom + window.scrollY + 10}px`;
    currentPopup.style.left = `${rect.left + window.scrollX}px`;

    // Keep popup positioned correctly on scroll
    currentScrollHandler = () => {
      if (currentPopup && currentPopup.parentNode) {
        const newRect = cueElement.getBoundingClientRect();
        currentPopup.style.top = `${newRect.bottom + window.scrollY + 10}px`;
        currentPopup.style.left = `${newRect.left + window.scrollX}px`;
      }
    };
    
    document.addEventListener('scroll', currentScrollHandler, { passive: true });
  }

  // Create popup element
  function createPopup(cueData, sourceElement) {
    const popup = document.createElement('div');
    popup.className = POPUP_CLASS;
    
    // Build options
    const options = [cueData.correctAnswer, ...cueData.distractors].slice(0, settings.multipleChoiceCount);
    shuffleArray(options);

    let optionsHtml = options.map((opt, i) => `
      <button class="edgelang-option" data-answer="${opt}" data-index="${i}">
        <span class="edgelang-option-number">${i + 1}</span>
        <span class="edgelang-option-text">${opt}</span>
      </button>
    `).join('');

    popup.innerHTML = `
      <div class="edgelang-popup-header">
        <span class="edgelang-word">${cueData.text}</span>
        <button class="edgelang-close">&times;</button>
      </div>
      <div class="edgelang-popup-body">
        <div class="edgelang-options">${optionsHtml}</div>
        <div class="edgelang-feedback" style="display: none;"></div>
        <button class="edgelang-audio-btn" style="display: ${settings.audioEnabled ? 'block' : 'none'};">Play pronunciation</button>
        <button class="edgelang-examples-btn" style="display: none;">Show example</button>
        <div class="edgelang-example" style="display: none;"></div>
      </div>
    `;

    // Event handlers
    popup.querySelector('.edgelang-close').addEventListener('click', hidePopup);
    popup.addEventListener('mouseenter', clearHidePopupTimer);
    popup.addEventListener('mouseleave', scheduleHidePopup);
    popup.querySelector('.edgelang-audio-btn')?.addEventListener('click', () => {
      playPronunciation(cueData);
    });
    
    popup.querySelectorAll('.edgelang-option').forEach(btn => {
      btn.addEventListener('click', (e) => handleAnswer(e, cueData, popup));
    });

    return popup;
  }

  // Handle answer selection
  function handleAnswer(event, cueData, popup) {
    const selectedAnswer = event.currentTarget.dataset.answer;
    const isCorrect = selectedAnswer === cueData.correctAnswer;
    
    // Record interaction
    recordInteraction(cueData.text, isCorrect);

    // Show feedback
    const feedback = popup.querySelector('.edgelang-feedback');
    feedback.style.display = 'block';
    
    if (isCorrect) {
      feedback.className = 'edgelang-feedback edgelang-correct';
      feedback.innerHTML = `
        <div class="edgelang-feedback-icon">✓</div>
        <div class="edgelang-feedback-text">${settings.positiveFeedback ? 'Correct! Nice work.' : 'Got it!'}</div>
      `;
      
      // Mark as resolved
      resolveItem(cueData.text);
    } else {
      feedback.className = 'edgelang-feedback edgelang-incorrect';
      feedback.innerHTML = `
        <div class="edgelang-feedback-icon">✗</div>
        <div class="edgelang-feedback-text">
          <strong>Not quite!</strong><br>
          <span>You picked <em>${selectedAnswer}</em>, but in this context the best answer is <em>${cueData.correctAnswer}</em>.</span>
        </div>
      `;
    }
    logDebug('popup:answer', { text: cueData.text, isCorrect, selectedAnswer });

    const exampleButton = popup.querySelector('.edgelang-examples-btn');
    const examplePanel = popup.querySelector('.edgelang-example');
    exampleButton.style.display = 'block';
    exampleButton.onclick = () => {
      examplePanel.style.display = 'block';
      examplePanel.textContent = `Example: "${cueData.text}" is being practiced as "${cueData.correctAnswer}" on this page.`;
      exampleButton.style.display = 'none';
    };

    // Re-enable after delay
    popup.querySelectorAll('.edgelang-option').forEach(btn => {
      btn.disabled = true;
      if (btn.dataset.answer === cueData.correctAnswer) {
        btn.classList.add('edgelang-correct-answer');
      }
    });
  }

  // Record interaction in storage
  function recordInteraction(text, isCorrect) {
    const now = Date.now();
    
    if (!learnerProfile.stats) {
      learnerProfile.stats = { totalAnswered: 0, correctAnswers: 0, streak: 0 };
    }
    
    learnerProfile.stats.totalAnswered++;
    if (isCorrect) {
      learnerProfile.stats.correctAnswers++;
      learnerProfile.stats.streak++;
    } else {
      learnerProfile.stats.streak = 0;
    }
    learnerProfile.stats.lastActive = now;

    // Update vocabulary entry
    if (!learnerProfile.vocabulary[text]) {
      learnerProfile.vocabulary[text] = { attempts: 0, correct: 0 };
    }
    learnerProfile.vocabulary[text].attempts++;
    if (isCorrect) {
      learnerProfile.vocabulary[text].correct++;
    }

    // Save
    chrome.storage.local.set({ learnerProfile });
    
    // Notify background to update stats
    chrome.runtime.sendMessage({
      action: 'updateStats',
      isCorrect: isCorrect
    });
    logDebug('stats:recorded', { text, isCorrect });
  }

  // Mark item as resolved
  function resolveItem(text) {
    if (!learnerProfile.resolvedItems) {
      learnerProfile.resolvedItems = [];
    }
    
    if (!learnerProfile.resolvedItems.includes(text)) {
      learnerProfile.resolvedItems.push(text);
      chrome.storage.local.set({ learnerProfile });
      pageCues = pageCues.filter(cue => cue.text !== text);
      logDebug('item:resolved', { text });
    }
  }

  // Hide popup
  function hidePopup() {
    clearHidePopupTimer();
    if (currentScrollHandler) {
      document.removeEventListener('scroll', currentScrollHandler);
      currentScrollHandler = null;
    }
    if (currentPopup) {
      currentPopup.remove();
      currentPopup = null;
      logDebug('popup:hide');
    }
  }

  function scheduleHidePopup() {
    clearHidePopupTimer();
    hidePopupTimer = window.setTimeout(() => {
      hidePopup();
    }, 120);
  }

  function clearHidePopupTimer() {
    if (hidePopupTimer) {
      clearTimeout(hidePopupTimer);
      hidePopupTimer = null;
    }
  }

  function playPronunciation(cueData) {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(cueData.text);
    utterance.lang = settings.currentMode === 'passive'
      ? settings.targetLanguage
      : settings.nativeLanguage;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    logDebug('audio:play', { text: cueData.text, lang: utterance.lang });
  }

  function focusNextCue() {
    const cues = Array.from(document.querySelectorAll(`.${CUE_CLASS}`));
    if (!cues.length) return;
    currentCueIndex = (currentCueIndex + 1) % cues.length;
    const cue = cues[currentCueIndex];
    cue.scrollIntoView({ behavior: 'smooth', block: 'center' });
    cue.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    logDebug('focus:next-cue', { index: currentCueIndex, total: cues.length });
  }

  function clearCues() {
    document.querySelectorAll(`.${CUE_CLASS}`).forEach(el => {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      parent.removeChild(el);
    });
    hidePopup();
    logDebug('render:clear');
  }

  // Update icon state
  function updateIconState(processing = isProcessing) {
    chrome.runtime.sendMessage({
      action: 'updateIconState',
      enabled: isEnabled,
      configured: settings.apiKeysConfigured,
      siteEnabled: settings.siteEnabled,
      paused: settings.isPaused,
      offline: !navigator.onLine,
      processing
    });
    logDebug('icon:update', {
      enabled: isEnabled,
      configured: settings.apiKeysConfigured,
      siteEnabled: settings.siteEnabled,
      paused: settings.isPaused,
      offline: !navigator.onLine,
      processing
    });
  }

  function getBlockerReason() {
    if (!settings.enabled) return 'extension_disabled';
    if (!settings.apiKeysConfigured) return 'api_keys_not_configured';
    if (!settings.siteEnabled) return 'site_disabled';
    if (settings.isPaused) return 'paused';
    if (!navigator.onLine) return 'offline';
    return null;
  }

  function setupPageObserver() {
    if (mutationObserver || !document.body) return;
    mutationObserver = new MutationObserver(() => {
      if (!pageCues.length && !getBlockerReason()) {
        scheduleProcessPage('dom_mutation');
      }
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('load', () => scheduleProcessPage('window_load'));
  }

  function scheduleProcessPage(trigger) {
    clearTimeout(processRetryTimer);
    processRetryTimer = window.setTimeout(() => {
      processPage(false, trigger);
    }, 1200);
    logDebug('process:scheduled', { trigger });
  }

  function logDebug(event, details = {}) {
    const entry = {
      source: 'content',
      event,
      details: sanitizeForLog(details)
    };
    console.log('EdgeLang trace:', entry);
    try {
      window.__edgelangDebug = window.__edgelangDebug || [];
      window.__edgelangDebug.push({ ...entry, timestamp: Date.now() });
      window.__edgelangDebug = window.__edgelangDebug.slice(-100);
      chrome.runtime.sendMessage({ action: 'debugLog', entry }).catch(() => {});
    } catch {}
  }

  function sanitizeForLog(value) {
    if (value == null) return value;
    if (typeof value === 'string') {
      return value.length > 200 ? `${value.slice(0, 200)}...` : value;
    }
    if (Array.isArray(value)) {
      return value.slice(0, 10).map((item) => sanitizeForLog(item));
    }
    if (typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, sanitizeForLog(val)]));
    }
    return value;
  }

  // Utility: Shuffle array
  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'settingsUpdated') {
      logDebug('message:settings-updated');
      loadSettings().then(init);
    } else if (message.action === 'toggleEnabled') {
      isEnabled = message.enabled;
      logDebug('message:toggle-enabled', { enabled: message.enabled });
      if (isEnabled) {
        init();
      } else {
        clearCues();
      }
      updateIconState();
    } else if (message.action === 'pauseChanged') {
      settings.isPaused = message.isPaused;
      logDebug('message:pause-changed', { isPaused: message.isPaused });
      if (settings.isPaused) {
        clearCues();
      } else {
        init();
      }
      updateIconState();
    } else if (message.action === 'getPageState') {
      sendResponse({
        currentMode: settings.currentMode,
        pageLanguage: currentPageLanguage,
        cueCount: pageCues.length,
        processing: isProcessing,
        blockerReason,
        debugTail: (window.__edgelangDebug || []).slice(-10)
      });
      return true;
    } else if (message.action === 'focusNextCue') {
      focusNextCue();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (currentPopup) {
      const optionIndex = Number(event.key) - 1;
      if (optionIndex >= 0 && optionIndex <= 5) {
        const option = currentPopup.querySelectorAll('.edgelang-option')[optionIndex];
        option?.click();
      }
      if (event.key === 'Escape') {
        hidePopup();
      }
    }
  });

  window.addEventListener('online', () => {
    logDebug('network:online');
    init();
  });

  window.addEventListener('offline', () => {
    blockerReason = 'offline';
    logDebug('network:offline');
    clearCues();
    updateIconState();
  });

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
