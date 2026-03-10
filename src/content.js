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

  // Constants
  const POPUP_CLASS = 'edgelang-popup';
  const CUE_CLASS = 'edgelang-cue';
  const SENSITIVE_INPUT_TYPES = ['password', 'email', 'tel', 'credit-card', 'number'];
  const SENSITIVE_FIELD_NAMES = ['cvv', 'cvc', 'cc', 'card', 'password', 'secret'];

  // Initialize
  async function init() {
    try {
      await loadSettings();
      await loadLearnerProfile();
      
      if (!isEnabled || !settings.apiKeysConfigured) {
        updateIconState();
        return;
      }

      const pageLanguage = await detectPageLanguage();
      const isForeignPage = pageLanguage === settings.targetLanguage;
      
      // Decide mode: passive (foreign) or active (native)
      settings.currentMode = isForeignPage ? 'passive' : 'active';
      
      await processPage();
      updateIconState();
    } catch (error) {
      console.error('EdgeLang init error:', error);
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
        'questionIntensity',
        'recallIntensity',
        'multipleChoiceCount',
        'positiveFeedback',
        'negativeFeedback',
        'siteMode',
        'siteList',
        'autoDetectLanguage'
      ], (result) => {
        settings = {
          enabled: result.enabled !== false,
          nativeLanguage: result.nativeLanguage || 'en',
          targetLanguage: result.targetLanguage || 'es',
          apiKeys: result.apiKeys || {},
          modelSelection: result.modelSelection || {},
          visualCueStyle: result.visualCueStyle || 'underline',
          questionIntensity: result.questionIntensity || 5,
          recallIntensity: result.recallIntensity || 10,
          multipleChoiceCount: result.multipleChoiceCount || 5,
          positiveFeedback: result.positiveFeedback !== false,
          negativeFeedback: result.negativeFeedback !== false,
          siteMode: result.siteMode || 'blacklist',
          siteList: result.siteList || { blacklist: [], whitelist: [] },
          autoDetectLanguage: result.autoDetectLanguage !== false,
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
        
        resolve();
      });
    });
  }

  // Detect page language using simple heuristics
  async function detectPageLanguage() {
    // Use document language as primary indicator
    const docLang = document.documentElement.lang;
    if (docLang && docLang !== '') {
      return docLang.split('-')[0];
    }
    
    // Fall back to content analysis via background
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'detectLanguage',
        text: document.body.innerText.substring(0, 5000)
      }, (response) => {
        resolve(response?.language || settings.nativeLanguage);
      });
    });
  }

  // Process page to find learnable items
  async function processPage() {
    if (isProcessing || !isEnabled) return;
    isProcessing = true;

    try {
      const text = extractPageText();
      if (!text || text.length < 100) {
        isProcessing = false;
        return;
      }

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

      if (response && response.cues) {
        pageCues = response.cues;
        renderCues(pageCues);
      }
    } catch (error) {
      console.error('EdgeLang process error:', error);
    } finally {
      isProcessing = false;
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

    return textParts.join(' ').substring(0, 50000);
  }

  // Render visual cues on page
  function renderCues(cues) {
    // Remove existing cues
    document.querySelectorAll(`.${CUE_CLASS}`).forEach(el => el.remove());
    
    if (!cues || cues.length === 0) return;

    // Calculate how many cues to show based on intensity
    const wordCount = document.body.innerText.split(/\s+/).length;
    const maxCues = Math.floor(wordCount * (settings.questionIntensity / 100));
    const cuesToShow = cues.slice(0, maxCues);

    cuesToShow.forEach((cue, index) => {
      try {
        // Find the text in the page and wrap it
        const textNodes = findTextNodes(cue.text);
        
        textNodes.forEach(node => {
          if (node.parentElement.classList.contains(CUE_CLASS)) return;
          
          const span = document.createElement('span');
          span.className = `${CUE_CLASS} edgelang-cue-${settings.visualCueStyle}`;
          span.dataset.cueIndex = index;
          span.dataset.text = cue.text;
          span.dataset.translation = cue.translation;
          span.dataset.correctAnswer = cue.correctAnswer;
          
          if (cue.distractors) {
            span.dataset.distractors = JSON.stringify(cue.distractors);
          }
          
          // Add event listeners
          span.addEventListener('mouseenter', showPopup);
          span.addEventListener('mouseleave', hidePopup);
          span.addEventListener('click', showPopup);
          
          node.parentNode.replaceChild(span, node);
          span.appendChild(node);
        });
      } catch (e) {
        console.warn('EdgeLang: Could not render cue for:', cue.text);
      }
    });
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
      if (node.textContent.toLowerCase().includes(searchText)) {
        targets.push(node);
      }
    }
    
    return targets.slice(0, 3); // Limit to first 3 occurrences
  }

  // Show popup on hover/click
  function showPopup(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const cueElement = event.target.closest(`.${CUE_CLASS}`);
    if (!cueElement) return;

    hidePopup(); // Hide any existing popup

    const cueData = {
      text: cueElement.dataset.text,
      translation: cueElement.dataset.translation,
      correctAnswer: cueElement.dataset.correctAnswer,
      distractors: cueElement.dataset.distractors ? JSON.parse(cueElement.dataset.distractors) : []
    };

    currentPopup = createPopup(cueData, cueElement);
    document.body.appendChild(currentPopup);

    // Position popup
    const rect = cueElement.getBoundingClientRect();
    currentPopup.style.top = `${rect.bottom + window.scrollY + 10}px`;
    currentPopup.style.left = `${rect.left + window.scrollX}px`;

    // Keep popup positioned correctly on scroll
    const scrollHandler = () => {
      if (currentPopup && currentPopup.parentNode) {
        const newRect = cueElement.getBoundingClientRect();
        currentPopup.style.top = `${newRect.bottom + window.scrollY + 10}px`;
        currentPopup.style.left = `${newRect.left + window.scrollX}px`;
      }
    };
    
    document.addEventListener('scroll', scrollHandler, { passive: true });
    currentPopup.dataset.scrollHandlerId = Date.now();
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
      </div>
    `;

    // Event handlers
    popup.querySelector('.edgelang-close').addEventListener('click', hidePopup);
    
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
        <div class="edgelang-feedback-text">${settings.positiveFeedback ? 'Correct!' : 'Got it!'}</div>
      `;
      
      // Mark as resolved
      resolveItem(cueData.text);
    } else {
      feedback.className = 'edgelang-feedback edgelang-incorrect';
      feedback.innerHTML = `
        <div class="edgelang-feedback-icon">✗</div>
        <div class="edgelang-feedback-text">
          <strong>Not quite!</strong><br>
          The correct answer is: <em>${cueData.correctAnswer}</em>
        </div>
      `;
    }

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
  }

  // Mark item as resolved
  function resolveItem(text) {
    if (!learnerProfile.resolvedItems) {
      learnerProfile.resolvedItems = [];
    }
    
    if (!learnerProfile.resolvedItems.includes(text)) {
      learnerProfile.resolvedItems.push(text);
      chrome.storage.local.set({ learnerProfile });
    }
  }

  // Hide popup
  function hidePopup() {
    if (currentPopup) {
      currentPopup.remove();
      currentPopup = null;
    }
  }

  // Update icon state
  function updateIconState() {
    chrome.runtime.sendMessage({
      action: 'updateIconState',
      enabled: isEnabled,
      configured: settings.apiKeysConfigured,
      siteEnabled: settings.siteEnabled
    });
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
      loadSettings().then(init);
    } else if (message.action === 'toggleEnabled') {
      isEnabled = message.enabled;
      if (isEnabled) {
        init();
      } else {
        document.querySelectorAll(`.${CUE_CLASS}`).forEach(el => el.remove());
        hidePopup();
      }
      updateIconState();
    }
  });

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
