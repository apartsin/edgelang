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
  let popupPinned = false;
  let pageBlocks = [];
  let pendingReprocessTrigger = null;
  let hasRenderedCues = false;
  let insufficientTextAttempts = 0;
  let lastQuickSignature = null;
  let lastScrollProcessY = 0;
  let lastExtractionSummary = null;

  // Constants
  const POPUP_CLASS = 'edgelang-popup';
  const CUE_CLASS = 'edgelang-cue';
  const SENSITIVE_INPUT_TYPES = ['password', 'email', 'tel', 'credit-card', 'number'];
  const SENSITIVE_FIELD_NAMES = ['cvv', 'cvc', 'cc', 'card', 'password', 'secret'];
  const NON_CONTENT_SELECTOR = 'nav, header, footer, aside, menu, [role="navigation"], [role="menu"], [aria-label*="menu" i], [data-testid*="nav" i], [data-testid*="menu" i]';
  const BLOCK_SELECTOR = 'article p, main p, section p, p, li, blockquote, figcaption, dd, dt, h2, h3, h4, article, section, [role="article"], [data-testid*="article" i], [data-component-name*="article" i]';
  const LOW_SIGNAL_TEXT_PATTERNS = [
    /drm system not supported/i,
    /digital rights management/i,
    /visit the help center/i,
    /sign in\b/i,
    /\bad feedback\b/i,
    /\bwatch live\b/i,
    /\bcookie(s)?\b/i,
    /\bprivacy policy\b/i,
    /\bterms of (use|service)\b/i,
    /\bsubscribe\b/i,
    /\bnewsletter\b/i,
    /\bcreate account\b/i,
    /\blog in\b/i,
    /\baccept all\b/i
  ];
  const CODE_LIKE_TEXT_PATTERNS = [
    /^\s*function\s+[a-z0-9_]+\s*\(/i,
    /\b(previousElementSibling|removeAttribute|srcset|appendChild|getBoundingClientRect)\b/,
    /=>\s*{/,
    /[{};].*[{};]/,
    /\bconst\s+[a-z0-9_]+\s*=/i
  ];

  // Initialize
  async function init(options = {}) {
    const { forceProcess = false, trigger = 'init' } = options;
    try {
      logDebug('init:start', { href: window.location.href, forceProcess, trigger });
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
      
      await processPage(forceProcess, trigger);
      updateIconState();
    } catch (error) {
      console.error('EdgeLang init error:', error);
      blockerReason = 'init_error';
      logDebug('init:error', { message: error.message });
    }
  }

  function isExtensionContextAvailable() {
    try {
      return Boolean(
        chrome &&
        chrome.runtime &&
        typeof chrome.runtime.sendMessage === 'function' &&
        chrome.storage &&
        chrome.storage.local &&
        chrome.storage.sync
      );
    } catch {
      return false;
    }
  }

  function isContextInvalidatedError(error) {
    return /Extension context invalidated/i.test(String(error?.message || error || ''));
  }

  function safeStorageSet(area, values) {
    if (!isExtensionContextAvailable()) {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      try {
        chrome.storage[area].set(values, () => {
          if (chrome.runtime?.lastError && isContextInvalidatedError(chrome.runtime.lastError.message)) {
            resolve(false);
            return;
          }
          resolve(!chrome.runtime?.lastError);
        });
      } catch (error) {
        if (isContextInvalidatedError(error)) {
          resolve(false);
          return;
        }
        throw error;
      }
    });
  }

  function safeStorageGet(area, keys, fallbackValue) {
    if (!isExtensionContextAvailable()) {
      return Promise.resolve(fallbackValue);
    }
    return new Promise((resolve) => {
      try {
        chrome.storage[area].get(keys, (result) => {
          if (chrome.runtime?.lastError && isContextInvalidatedError(chrome.runtime.lastError.message)) {
            resolve(fallbackValue);
            return;
          }
          resolve(result);
        });
      } catch (error) {
        if (isContextInvalidatedError(error)) {
          resolve(fallbackValue);
          return;
        }
        throw error;
      }
    });
  }

  function safeSendRuntimeMessage(message, fallbackValue = null) {
    if (!isExtensionContextAvailable()) {
      return Promise.resolve(fallbackValue);
    }
    try {
      return Promise.resolve(chrome.runtime.sendMessage(message))
        .catch((error) => isContextInvalidatedError(error) ? fallbackValue : Promise.reject(error));
    } catch (error) {
      if (isContextInvalidatedError(error)) {
        return Promise.resolve(fallbackValue);
      }
      throw error;
    }
  }

  // Load settings from storage
  async function loadSettings() {
    const result = await safeStorageGet('sync', [
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
        'ttsEngine',
        'ttsProvider',
        'ttsVoice',
        'siteMode',
        'siteList',
        'autoDetectLanguage',
        'modePreference',
        'isPaused'
      ], {});
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
      ttsEngine: result.ttsEngine || 'modelmesh',
      ttsProvider: result.ttsProvider || 'auto',
      ttsVoice: result.ttsVoice || 'auto',
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
  }

  // Load learner profile
  async function loadLearnerProfile() {
    const result = await safeStorageGet('local', ['learnerProfile', 'calibrationData'], {});
    learnerProfile = result.learnerProfile || {
      level: 'intermediate',
      vocabulary: {},
      resolvedItems: [],
      confusionPatterns: [],
      recentInteractions: [],
      conceptPerformance: {},
      stats: {
        totalAnswered: 0,
        correctAnswers: 0,
        streak: 0,
        lastActive: null,
        averageLatencyMs: 0
      }
    };
    
    if (result.calibrationData) {
      learnerProfile.level = result.calibrationData.level || 'intermediate';
    }
    logDebug('profile:loaded', {
      level: learnerProfile.level,
      resolvedCount: learnerProfile.resolvedItems?.length || 0
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
      safeSendRuntimeMessage({
        action: 'detectLanguage',
        text: document.body.innerText.substring(0, 5000)
      }, null).then((response) => {
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
    updateIconState(true, 'loading');
    logDebug('process:start', { trigger: reason });

    try {
      const extraction = extractPageBlocks();
      hasRenderedCues = false;
      pageBlocks = extraction.blocks;
      const text = extraction.text;
      if (!text || text.length < 100) {
        insufficientTextAttempts += 1;
        const shouldRetryForContent = document.readyState !== 'complete' || insufficientTextAttempts < 3;
        blockerReason = shouldRetryForContent ? 'waiting_for_content' : 'insufficient_text';
        logDebug('process:blocked', {
          reason: blockerReason,
          observedReason: 'insufficient_text',
          textLength: text?.length || 0,
          blockCount: extraction.blockCount || 0,
          attempts: insufficientTextAttempts,
          trigger: reason
        });
        if (shouldRetryForContent) {
          scheduleProcessPage('content_retry');
        }
        return;
      }
      insufficientTextAttempts = 0;

      const signature = [
        settings.currentMode,
        settings.nativeLanguage,
        settings.targetLanguage,
        learnerProfile.level,
        settings.questionIntensity,
        settings.multipleChoiceCount,
        extraction.signature
      ].join('::');
      if (!force && signature === lastProcessedSignature) {
        blockerReason = 'already_processed_same_content';
        logDebug('process:skipped', { reason: blockerReason, trigger: reason });
        return;
      }
      lastProcessedSignature = signature;

      const quickExtraction = buildQuickAnalysisInput(extraction);
      if (quickExtraction) {
        const quickSignature = `${signature}::quick::${quickExtraction.signature}`;
        if (quickSignature !== lastQuickSignature) {
          lastQuickSignature = quickSignature;
          const quickResponse = await analyzeExtraction(quickExtraction, {
            stage: 'quick',
            intensity: Math.max(3, Math.min(settings.questionIntensity, 8))
          });
          if (quickResponse?.cues?.length) {
            const resolvedItems = new Set(learnerProfile.resolvedItems || []);
            const quickCues = quickResponse.cues.filter((cue) => !resolvedItems.has(cue.text));
            renderCues(quickCues, { replace: true, stage: 'quick' });
            blockerReason = quickCues.length ? null : blockerReason;
            logDebug('process:quick-complete', {
              trigger: reason,
              receivedCueCount: quickResponse.cues.length,
              renderedCueCandidates: quickCues.length
            });
          }
        }
      }

      const response = await analyzeExtraction(extraction, {
        stage: 'full',
        intensity: settings.questionIntensity
      });

      if (response?.error) {
        blockerReason = response.error;
        logDebug('process:error-response', { error: response.error, trigger: reason });
        if (!pageCues.length) {
          clearCues();
        }
        return;
      }

      if (response && response.cues) {
        const resolvedItems = new Set(learnerProfile.resolvedItems || []);
        const fullCues = response.cues.filter(cue => !resolvedItems.has(cue.text));
        renderCues(fullCues, { replace: !pageCues.length, stage: 'full' });
        blockerReason = pageCues.length ? null : 'no_cues_after_filtering';
        logDebug('process:complete', {
          trigger: reason,
          receivedCueCount: response.cues.length,
          renderedCueCandidates: fullCues.length,
          activeCueCount: pageCues.length
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

  // Extract visible text blocks from across the page.
  function extractPageBlocks() {
    const candidates = collectPrimaryCandidateElements();
    const seenTexts = new Set();
    const blocks = [];

    for (const element of candidates) {
      if (!isEligibleBlockElement(element)) {
        continue;
      }

      const text = getReadableElementText(element);
      if (!text || seenTexts.has(text) || isLowSignalBlockText(text)) {
        continue;
      }

      seenTexts.add(text);
      const rect = element.getBoundingClientRect();
      const absoluteTop = rect.top + window.scrollY;
      const score = scoreBlockElement(element, text, absoluteTop);
      blocks.push({
        index: blocks.length,
        text,
        element,
        top: absoluteTop,
        wordCount: text.split(/\s+/).length,
        score
      });
    }

    const primaryTextLength = blocks.reduce((sum, block) => sum + block.text.length, 0);
    if (!blocks.length || blocks.length < 8 || primaryTextLength < 1800) {
      const fallbackBlocks = extractFallbackBlocks();
      fallbackBlocks.forEach((block) => {
        if (!seenTexts.has(block.text) && !isLowSignalBlockText(block.text)) {
          seenTexts.add(block.text);
          blocks.push({
            ...block,
            index: blocks.length
          });
        }
      });
    }

    const rankedBlocks = [...blocks]
      .sort((left, right) => (right.score || 0) - (left.score || 0))
      .slice(0, 200)
      .sort((left, right) => left.top - right.top);
    const normalizedBlocks = rankedBlocks.map((block, index) => ({
      ...block,
      index
    }));
    const text = normalizedBlocks.map((block) => block.text).join('\n\n').substring(0, 120000);
    const promptBlocks = buildPromptBlocks(normalizedBlocks, 24, 12000);
    const promptSample = promptBlocks.map((block) => `[Block ${block.index}] ${block.text}`).join('\n');
    const signature = promptBlocks.map((block) => block.text).join('\n').slice(0, 1800);
    lastExtractionSummary = {
      textLength: text.length,
      blockCount: normalizedBlocks.length,
      primaryBlockCount: candidates.length,
      primaryEligibleCount: blocks.length,
      promptSampleLength: promptSample.length,
      promptPreview: promptSample.slice(0, 320)
    };
    logDebug('extract:text', {
      textLength: text.length,
      blockCount: normalizedBlocks.length,
      primaryBlockCount: candidates.length,
      primaryEligibleCount: blocks.length,
      promptSampleLength: promptSample.length
    });
    return {
      text,
      promptSample,
      signature,
      blockCount: normalizedBlocks.length,
      blocks: normalizedBlocks,
      promptBlocks: promptBlocks.map((block) => ({
        index: block.index,
        text: block.text
      }))
    };
  }

  function extractFallbackBlocks() {
    const fallbackRoots = Array.from(document.querySelectorAll('main, article, section, [role="main"], .content, .article, .markdown-body, .Box-body, div[class*="content" i], div[class*="article" i], div[class*="body" i], div[data-component-name]'))
      .filter((element) => isFallbackRootElement(element));

    if (!fallbackRoots.length && isFallbackRootElement(document.body)) {
      fallbackRoots.push(document.body);
    }

    const fallbackBlocks = [];
    const seenTexts = new Set();

    fallbackRoots.forEach((element) => {
      const descendantBlocks = Array.from(
        element.querySelectorAll('p, li, blockquote, figcaption, dd, dt, h1, h2, h3, h4, h5, div')
      )
        .filter((candidate) => isFallbackTextElement(candidate))
        .map((candidate) => {
          const text = getReadableElementText(candidate);
          const top = candidate.getBoundingClientRect().top + window.scrollY;
          return {
            text,
            element: candidate,
            top,
            wordCount: text.split(/\s+/).length,
            score: scoreBlockElement(candidate, text, top)
          };
        });

      if (descendantBlocks.length) {
        descendantBlocks.forEach((block) => {
          if (!seenTexts.has(block.text)) {
            seenTexts.add(block.text);
            fallbackBlocks.push({
              ...block,
              index: fallbackBlocks.length
            });
          }
        });
        return;
      }

      const rawText = getReadableElementText(element);
      splitFallbackText(rawText).forEach((text, index) => {
        if (seenTexts.has(text)) {
          return;
        }
        seenTexts.add(text);
        const top = element.getBoundingClientRect().top + window.scrollY + index;
        fallbackBlocks.push({
          index: fallbackBlocks.length,
          text,
          element,
          top,
          wordCount: text.split(/\s+/).length,
          score: scoreBlockElement(element, text, top)
        });
      });
    });

    if (!fallbackBlocks.length) {
      const bodyText = getReadableElementText(document.body);
      splitFallbackText(bodyText).forEach((text, index) => {
        if (seenTexts.has(text)) {
          return;
        }
        seenTexts.add(text);
        fallbackBlocks.push({
          index: fallbackBlocks.length,
          text,
          element: document.body,
          top: window.scrollY + index,
          wordCount: text.split(/\s+/).length,
          score: scoreBlockElement(document.body, text, window.scrollY + index)
        });
      });
    }

    return fallbackBlocks;
  }

  function collectPrimaryCandidateElements() {
    const candidates = [];
    const seen = new Set();

    Array.from(document.querySelectorAll(BLOCK_SELECTOR)).forEach((element) => {
      if (!seen.has(element)) {
        seen.add(element);
        candidates.push(element);
      }
    });

    const genericContainers = Array.from(
      document.querySelectorAll('main, article, section, [role="main"], [role="article"], .content, .article, .story, .post, .entry, .markdown-body, .prose, .Box-body, div, section')
    ).filter((element) => isGenericReadableContainer(element));

    genericContainers.forEach((element) => {
      if (!seen.has(element)) {
        seen.add(element);
        candidates.push(element);
      }
    });

    return candidates;
  }

  function splitFallbackText(text) {
    if (!text) return [];
    const paragraphs = text
      .split(/\n{2,}|(?<=[.!?])\s+/)
      .map((part) => normalizeBlockText(part))
      .filter((part) =>
        part.split(/\s+/).length >= 8 &&
        part.length >= 60 &&
        !isLowSignalBlockText(part) &&
        !isCodeLikeBlockText(part)
      );

    if (paragraphs.length) {
      return paragraphs.slice(0, 24);
    }

    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((part) => normalizeBlockText(part))
      .filter(Boolean);
    const chunks = [];

    if (sentences.length) {
      let currentChunk = '';
      for (const sentence of sentences) {
        const nextChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
        const nextWords = nextChunk.split(/\s+/).length;
        if (currentChunk && nextWords > 55) {
          if (currentChunk.length >= 60 && !isLowSignalBlockText(currentChunk) && !isCodeLikeBlockText(currentChunk)) {
            chunks.push(currentChunk);
          }
          currentChunk = sentence;
        } else {
          currentChunk = nextChunk;
        }
        if (chunks.length >= 24) {
          break;
        }
      }
      if (currentChunk && chunks.length < 24 && currentChunk.length >= 60 && !isLowSignalBlockText(currentChunk) && !isCodeLikeBlockText(currentChunk)) {
        chunks.push(currentChunk);
      }
    }

    if (chunks.length) {
      return chunks;
    }

    const words = text.split(/\s+/);
    for (let index = 0; index < words.length; index += 45) {
      const chunk = words.slice(index, index + 45).join(' ').trim();
      if (chunk.length >= 60 && !isLowSignalBlockText(chunk) && !isCodeLikeBlockText(chunk)) {
        chunks.push(chunk);
      }
      if (chunks.length >= 24) {
        break;
      }
    }
    return chunks;
  }

  function isLowSignalBlockText(text) {
    const normalized = normalizeBlockText(text);
    if (!normalized) {
      return true;
    }
    return LOW_SIGNAL_TEXT_PATTERNS.some((pattern) => pattern.test(normalized));
  }

  function isCodeLikeBlockText(text) {
    const normalized = normalizeBlockText(text);
    if (!normalized) {
      return false;
    }
    return CODE_LIKE_TEXT_PATTERNS.some((pattern) => pattern.test(normalized));
  }

  function isFallbackRootElement(element) {
    if (!element || !isVisibleTextContainer(element) || element.closest(`${NON_CONTENT_SELECTOR}, pre, code, script, style, noscript`)) {
      return false;
    }

    const text = getReadableElementText(element);
    if (!text || text.length < 180) {
      return false;
    }

    return true;
  }

  function isFallbackTextElement(element) {
    if (!element || !isVisibleTextContainer(element) || element.closest(`${NON_CONTENT_SELECTOR}, pre, code, script, style, noscript`)) {
      return false;
    }

    const text = getReadableElementText(element);
    if (!text || text.length < 60 || text.split(/\s+/).length < 8) {
      return false;
    }
    if (isLowSignalBlockText(text) || isCodeLikeBlockText(text)) {
      return false;
    }
    if (calculateLinkDensity(element, text.length) > 0.6) {
      return false;
    }

    if (element.tagName.toLowerCase() === 'div' && hasMeaningfulFallbackChildren(element)) {
      return false;
    }

    return true;
  }

  function hasMeaningfulFallbackChildren(element) {
    const directChildren = Array.from(element.children || []);
    let meaningfulChildren = 0;

    for (const child of directChildren) {
      if (!isVisibleTextContainer(child) || child.closest(NON_CONTENT_SELECTOR)) {
        continue;
      }
      const text = getReadableElementText(child);
      if (text.length >= 40 && text.split(/\s+/).length >= 6 && !isLowSignalBlockText(text) && !isCodeLikeBlockText(text)) {
        meaningfulChildren += 1;
      }
      if (meaningfulChildren >= 2) {
        return true;
      }
    }

    return false;
  }

  function isGenericReadableContainer(element) {
    if (!element || !isVisibleTextContainer(element) || element.closest(`${NON_CONTENT_SELECTOR}, pre, code, script, style, noscript`)) {
      return false;
    }

    const tagName = element.tagName?.toLowerCase() || '';
    if (!['div', 'section', 'article', 'main'].includes(tagName)) {
      return false;
    }

    const text = getReadableElementText(element);
    if (!text || text.length < 90 || text.split(/\s+/).length < 14) {
      return false;
    }
    if (isLowSignalBlockText(text) || isCodeLikeBlockText(text)) {
      return false;
    }

    const directText = getDirectReadableText(element);
    const directWordCount = directText ? directText.split(/\s+/).length : 0;
    const linkDensity = calculateLinkDensity(element, text.length);
    const meaningfulChildren = countMeaningfulChildBlocks(element);
    const contentHint = getContentHintScore(element);
    const chromePenalty = getChromePenaltyScore(element);

    if (linkDensity > 0.5 || chromePenalty >= 2) {
      return false;
    }

    return directWordCount >= 8 || meaningfulChildren >= 2 || contentHint >= 1;
  }

  function isEligibleBlockElement(element) {
    if (!element || !isVisibleTextContainer(element) || element.closest(`${NON_CONTENT_SELECTOR}, pre, code, script, style, noscript`)) {
      return false;
    }

    const tagName = element.tagName.toLowerCase();
    const inputType = element.type?.toLowerCase();
    const fieldName = element.name?.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || element.isContentEditable) {
      if (
        SENSITIVE_INPUT_TYPES.includes(inputType) ||
        SENSITIVE_FIELD_NAMES.some((field) => fieldName?.includes(field))
      ) {
        return false;
      }
      return false;
    }

    const text = normalizeBlockText(element.innerText || element.textContent || '');
    if (!text) {
      return false;
    }
    if (isLowSignalBlockText(text) || isCodeLikeBlockText(text)) {
      return false;
    }

    const words = text.split(/\s+/);
    if (words.length < 5 || text.length < 30) {
      return false;
    }

    const linkDensity = calculateLinkDensity(element, text.length);
    if (linkDensity > 0.55) {
      return false;
    }

    if (getChromePenaltyScore(element) >= 2) {
      return false;
    }

    return true;
  }

  function normalizeBlockText(value) {
    return value.replace(/\s+/g, ' ').trim();
  }

  function getReadableElementText(element) {
    if (!element) return '';
    const parts = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.closest(`${NON_CONTENT_SELECTOR}, pre, code, script, style, noscript`)) {
          return NodeFilter.FILTER_REJECT;
        }
        const value = normalizeBlockText(node.textContent || '');
        return value ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    let currentNode;
    while (currentNode = walker.nextNode()) {
      const value = normalizeBlockText(currentNode.textContent || '');
      if (value) {
        parts.push(value);
      }
    }

    return normalizeBlockText(parts.join(' '));
  }

  function calculateLinkDensity(element, textLength) {
    const linkTextLength = Array.from(element.querySelectorAll('a'))
      .map((link) => normalizeBlockText(link.innerText || link.textContent || '').length)
      .reduce((sum, length) => sum + length, 0);
    return textLength > 0 ? linkTextLength / textLength : 0;
  }

  function getDirectReadableText(element) {
    if (!element) return '';
    const parts = [];
    Array.from(element.childNodes || []).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = normalizeBlockText(node.textContent || '');
        if (value) {
          parts.push(value);
        }
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }
      const child = node;
      const childTag = child.tagName?.toLowerCase() || '';
      if (['span', 'strong', 'em', 'b', 'i', 'mark', 'small', 'a'].includes(childTag)) {
        const value = getReadableElementText(child);
        if (value) {
          parts.push(value);
        }
      }
    });
    return normalizeBlockText(parts.join(' '));
  }

  function countMeaningfulChildBlocks(element) {
    let count = 0;
    for (const child of Array.from(element.children || [])) {
      if (!isVisibleTextContainer(child) || child.closest(NON_CONTENT_SELECTOR)) {
        continue;
      }
      const text = normalizeBlockText(child.innerText || child.textContent || '');
      if (text.length >= 60 && text.split(/\s+/).length >= 10 && !isLowSignalBlockText(text) && !isCodeLikeBlockText(text)) {
        count += 1;
      }
      if (count >= 3) {
        return count;
      }
    }
    return count;
  }

  function getContentHintScore(element) {
    const descriptor = [
      element.className || '',
      element.id || '',
      element.getAttribute?.('role') || '',
      element.getAttribute?.('data-testid') || '',
      element.getAttribute?.('data-component-name') || ''
    ].join(' ');
    let score = 0;
    if (/\b(article|story|content|body|copy|entry|post|prose|markdown|text|main)\b/i.test(descriptor)) {
      score += 1.5;
    }
    if (/\b(hero|summary|deck|description|section)\b/i.test(descriptor)) {
      score += 0.5;
    }
    return score;
  }

  function getChromePenaltyScore(element) {
    const descriptor = [
      element.className || '',
      element.id || '',
      element.getAttribute?.('role') || '',
      element.getAttribute?.('aria-label') || '',
      element.getAttribute?.('data-testid') || ''
    ].join(' ');
    let penalty = 0;
    if (/\b(nav|menu|toolbar|header|footer|sidebar|drawer|cookie|consent|banner|modal|dialog|auth|login|signup|promo|share|social|breadcrumb|rail|ticker)\b/i.test(descriptor)) {
      penalty += 2;
    }
    if (element.querySelector('input, button, select, textarea, form')) {
      penalty += 1;
    }
    return penalty;
  }

  function scoreBlockElement(element, text, absoluteTop) {
    const tagName = element.tagName?.toLowerCase() || 'div';
    const wordCount = text.split(/\s+/).length;
    const linkDensity = calculateLinkDensity(element, text.length);
    const inArticle = element.closest('article, main, [role="main"]') ? 1 : 0;
    const headingBonus = ['h2', 'h3', 'h4', 'blockquote', 'figcaption'].includes(tagName) ? 0.4 : 0;
    const paragraphBonus = ['p', 'li', 'dd', 'dt'].includes(tagName) ? 0.7 : 0;
    const contentHint = getContentHintScore(element);
    const directTextBonus = Math.min(1.5, getDirectReadableText(element).length / 120);
    const childBlockBonus = Math.min(1.5, countMeaningfulChildBlocks(element) * 0.5);
    const chromePenalty = getChromePenaltyScore(element);
    const depthPenalty = Math.min(1.2, Math.max(0, absoluteTop / 12000));
    return (wordCount * 0.08) + (text.length * 0.01) + (inArticle * 2.5) + headingBonus + paragraphBonus + contentHint + directTextBonus + childBlockBonus - (linkDensity * 3.5) - (chromePenalty * 1.5) - depthPenalty;
  }

  function isVisibleTextContainer(element) {
    if (!element || !document.documentElement.contains(element)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      style.opacity === '0'
    ) {
      return false;
    }

    if (element.closest('[hidden],[aria-hidden="true"]')) {
      return false;
    }

    return element.getClientRects().length > 0;
  }

  function buildPromptBlocks(blocks, maxBlocks, maxChars) {
    if (!blocks.length) return [];

    const selected = [];
    const seen = new Set();
    const targetCount = Math.min(blocks.length, maxBlocks);
    let currentChars = 0;

    for (let index = 0; index < targetCount; index += 1) {
      const sourceIndex = Math.min(
        blocks.length - 1,
        Math.floor((index * blocks.length) / targetCount)
      );
      const block = blocks[sourceIndex];
      if (block && !seen.has(block.text)) {
        const additionLength = block.text.length + 16;
        if (currentChars + additionLength > maxChars && selected.length >= Math.min(10, targetCount)) {
          break;
        }
        selected.push(block);
        seen.add(block.text);
        currentChars += additionLength;
      }
    }

    return selected;
  }

  function buildQuickAnalysisInput(extraction) {
    const quickBlocks = selectQuickPromptBlocks(extraction.blocks);
    if (!quickBlocks.length) {
      return null;
    }

    const text = quickBlocks.map((block) => block.text).join('\n\n').slice(0, 5000);
    if (text.length < 100) {
      return null;
    }

    const promptBlocks = quickBlocks.map((block) => ({
      index: block.index,
      text: block.text
    }));
    const promptSample = promptBlocks.map((block) => `[Block ${block.index}] ${block.text}`).join('\n');

    return {
      text,
      promptSample,
      promptBlocks,
      blockCount: quickBlocks.length,
      signature: quickBlocks.map((block) => `${block.index}:${block.text}`).join('\n').slice(0, 900)
    };
  }

  function selectQuickPromptBlocks(blocks) {
    if (!Array.isArray(blocks) || !blocks.length) {
      return [];
    }

    const viewportBottom = window.scrollY + Math.max(window.innerHeight || 0, 900);
    const nearbyBlocks = blocks.filter((block) => block.top <= viewportBottom * 1.6);
    const pool = nearbyBlocks.length >= 3 ? nearbyBlocks : blocks.slice(0, Math.min(blocks.length, 8));
    return buildPromptBlocks(pool, Math.min(pool.length, 6), 2600);
  }

  async function analyzeExtraction(extraction, options = {}) {
    const { stage = 'full', intensity = settings.questionIntensity } = options;
    updateIconState(true, 'analyzing');
    logDebug('analyze:request', {
      stage,
      textLength: extraction.text?.length || 0,
      blockCount: extraction.blockCount || extraction.promptBlocks?.length || 0,
      intensity
    });

    return safeSendRuntimeMessage({
      action: 'analyzePage',
      stage,
      text: extraction.text,
      textSample: extraction.promptSample,
      textBlockCount: extraction.blockCount,
      textBlocks: extraction.promptBlocks,
      language: settings.currentMode === 'passive' ? settings.targetLanguage : settings.nativeLanguage,
      nativeLanguage: settings.nativeLanguage,
      targetLanguage: settings.targetLanguage,
      learnerLevel: learnerProfile.level,
      intensity,
      resolvedItems: learnerProfile.resolvedItems,
      mode: settings.currentMode
    }, { error: 'extension_context_unavailable' });
  }

  // Render visual cues on page
  function renderCues(cues, options = {}) {
    const { replace = true, stage = 'full' } = options;
    updateIconState(true, 'rendering');
    if (replace) {
      clearCues();
    }

    if (!cues || cues.length === 0) {
      if (!pageCues.length) {
        blockerReason = 'no_cues_from_analysis';
      }
      logDebug('render:empty', { stage, replace, activeCueCount: pageCues.length });
      return;
    }

    // Calculate how many cues to show based on intensity
    const wordCount = document.body.innerText.split(/\s+/).length;
    const maxCues = Math.max(1, Math.floor(wordCount * (settings.questionIntensity / 100)));
    const existingCueTexts = new Set(pageCues.map((cue) => cue.text));
    const selectedCues = replace
      ? distributeCuesAcrossBlocks(cues, maxCues)
      : mergeCueSets(pageCues, cues, maxCues);
    const cuesToShow = replace
      ? selectedCues
      : selectedCues.filter((cue) => !existingCueTexts.has(cue.text));

    pageCues = replace ? selectedCues.slice() : selectedCues;
    let renderedCount = 0;
    logDebug('render:start', {
      cueCount: cues.length,
      selectedCueCount: pageCues.length,
      maxCues,
      wordCount,
      replace,
      stage
    });

    cuesToShow.forEach((cue, index) => {
      try {
        // Find the text in the page and wrap it
          const textNodes = findTextNodes(cue.text, cue.blockIndex);
        
        textNodes.forEach(node => {
          if (!node.parentElement || node.parentElement.classList.contains(CUE_CLASS)) return;
          
          const span = document.createElement('span');
          span.className = `${CUE_CLASS} edgelang-cue-${settings.visualCueStyle}`;
          applyCueColor(span, settings.highlightColor);
          span.dataset.cueIndex = pageCues.findIndex((pageCue) => pageCue.text === cue.text);
          span.dataset.cueCategory = classifyCueCategory(cue);
          span.dataset.text = cue.text;
          span.dataset.displayText = cue.displayText || (settings.currentMode === 'passive' ? (cue.text || '') : cue.text);
          span.dataset.translation = cue.translation;
          span.dataset.correctAnswer = cue.correctAnswer;
          span.dataset.nativeMeaning = cue.nativeMeaning || cue.translation || '';
          span.dataset.mode = settings.currentMode;
          if (cue.contextExcerpt) {
            span.dataset.contextExcerpt = cue.contextExcerpt;
          }
          
          if (cue.distractors) {
            span.dataset.distractors = JSON.stringify(cue.distractors);
          }

          // Add event listeners
          span.addEventListener('mouseenter', showPopup);
          span.addEventListener('click', showPopup);

          if (wrapTextMatchInNode(node, cue.text, span, span.dataset.displayText || cue.text)) {
            renderedCount += 1;
          }
        });
      } catch (e) {
        console.warn('EdgeLang: Could not render cue for:', cue.text);
        logDebug('render:warning', { cue: cue.text, message: e.message });
      }
    });
    blockerReason = document.querySelectorAll(`.${CUE_CLASS}`).length > 0 ? null : 'no_dom_matches_for_cues';
    hasRenderedCues = document.querySelectorAll(`.${CUE_CLASS}`).length > 0;
    logDebug('render:complete', {
      renderedCount,
      blockerReason,
      stage,
      activeCueCount: pageCues.length
    });
    updateIconState(false);
  }

  // Find text nodes containing target text
  function findTextNodes(targetText, preferredBlockIndex = null) {
    const targets = [];
    const searchText = targetText.toLowerCase();

    const collectFromRoot = (root) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      let node;
      while (node = walker.nextNode()) {
        if (!node.parentElement) continue;
        const parentTag = node.parentElement.tagName?.toLowerCase();
        if (['script', 'style', 'textarea'].includes(parentTag) || node.parentElement.isContentEditable) {
          continue;
        }
        if (node.parentElement.closest(NON_CONTENT_SELECTOR)) {
          continue;
        }
        if (node.textContent.toLowerCase().includes(searchText)) {
          targets.push(node);
        }
      }
    };

    const preferredBlock = Number.isInteger(preferredBlockIndex) ? pageBlocks[preferredBlockIndex] : null;
    if (preferredBlock?.element) {
      collectFromRoot(preferredBlock.element);
    }

    if (!targets.length) {
      collectFromRoot(document.body);
    }
    
    logDebug('render:find-text-nodes', { targetText, preferredBlockIndex, matchCount: targets.length });
    return targets.slice(0, 3); // Limit to first 3 occurrences
  }

  function wrapTextMatchInNode(node, targetText, wrapper, replacementText = targetText) {
    const originalText = node.textContent;
    const searchText = targetText.toLowerCase();
    const index = originalText.toLowerCase().indexOf(searchText);

    if (index === -1 || !node.parentNode) return false;

    const beforeNode = index > 0 ? node.splitText(index) : node;
    const afterNode = beforeNode.splitText(targetText.length);
    wrapper.dataset.originalText = beforeNode.textContent;
    beforeNode.parentNode.replaceChild(wrapper, beforeNode);
    wrapper.textContent = replacementText || beforeNode.textContent;
    logDebug('render:wrapped', { targetText, replacementText });
    return !!afterNode;
  }

  function applyCueColor(element, color) {
    const safeColor = normalizeHexColor(color);
    element.style.setProperty('--edgelang-cue-color', safeColor);
    element.style.setProperty('--edgelang-cue-soft', hexToRgba(safeColor, 0.18));
    element.style.setProperty('--edgelang-cue-hover', hexToRgba(safeColor, 0.28));
    element.style.setProperty('--edgelang-cue-strong', hexToRgba(safeColor, 0.92));
    element.style.setProperty('--edgelang-cue-border-strong', hexToRgba(safeColor, 0.55));
    element.style.setProperty('--edgelang-cue-panel', hexToRgba(safeColor, 0.08));
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
    popupPinned = true;

    const cueData = normalizeCueData({
      text: cueElement.dataset.text,
      displayText: cueElement.dataset.displayText,
      translation: cueElement.dataset.translation,
      correctAnswer: cueElement.dataset.correctAnswer,
      nativeMeaning: cueElement.dataset.nativeMeaning,
      mode: cueElement.dataset.mode,
      contextExcerpt: cueElement.dataset.contextExcerpt,
      distractors: cueElement.dataset.distractors ? JSON.parse(cueElement.dataset.distractors) : []
    });

    if (!cueData.correctAnswer) {
      logDebug('popup:blocked', { reason: 'missing_correct_answer', text: cueData.text });
      return;
    }

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
    const usageExamples = collectUsageExamples(cueData.text, sourceElement);
    const inlineContext = cueData.contextExcerpt || usageExamples[0] || '';
    const promptLabel = cueData.mode === 'active'
      ? `Choose the best ${getLanguageDisplayName(settings.targetLanguage)} equivalent`
      : `Choose the best ${getLanguageDisplayName(settings.nativeLanguage)} meaning`;
    
    // Build options
    const options = Array.from(new Set([cueData.correctAnswer, ...cueData.distractors]))
      .filter((option) => typeof option === 'string' && option.trim())
      .slice(0, settings.multipleChoiceCount);
    shuffleArray(options);

    if (!options.length) {
      logDebug('popup:blocked', { reason: 'no_valid_options', text: cueData.text });
      return popup;
    }

    let optionsHtml = options.map((opt, i) => `
      <button class="edgelang-option" data-answer="${opt}" data-index="${i}">
        <span class="edgelang-option-number">${i + 1}</span>
        <span class="edgelang-option-text">${opt}</span>
      </button>
    `).join('');

    popup.innerHTML = `
      <div class="edgelang-popup-header">
        <div class="edgelang-word-wrap">
          <span class="edgelang-word">${cueData.displayText || cueData.text}</span>
          <span class="edgelang-popup-subtitle">${promptLabel}</span>
        </div>
        <button class="edgelang-close">&times;</button>
      </div>
      <div class="edgelang-popup-body">
        <div class="edgelang-context-preview" style="display: ${inlineContext ? 'block' : 'none'};">${inlineContext ? highlightTargetInSnippet(escapeHtml(inlineContext), cueData.mode === 'active' ? cueData.text : cueData.text) : ''}</div>
        <div class="edgelang-options">${optionsHtml}</div>
        <div class="edgelang-feedback" style="display: none;"></div>
        <button class="edgelang-audio-btn" style="display: ${settings.audioEnabled ? 'block' : 'none'};">Play pronunciation</button>
        <button class="edgelang-examples-btn" style="display: none;">Show usage examples</button>
        <div class="edgelang-example" style="display: none;"></div>
      </div>
    `;

    // Event handlers
    popup.querySelector('.edgelang-close').addEventListener('click', hidePopup);
    popup.addEventListener('mouseenter', clearHidePopupTimer);
    popup.querySelector('.edgelang-audio-btn')?.addEventListener('click', () => {
      playPronunciation(cueData);
    });
    popup.dataset.usageExamples = JSON.stringify(usageExamples);
    popup.dataset.openedAt = String(Date.now());
    
    popup.querySelectorAll('.edgelang-option').forEach(btn => {
      btn.style.setProperty('color', '#1f2328', 'important');
      btn.style.setProperty('-webkit-text-fill-color', '#1f2328', 'important');
      btn.addEventListener('click', (e) => handleAnswer(e, cueData, popup));
    });
    popup.querySelectorAll('.edgelang-option-text').forEach((label) => {
      label.style.setProperty('color', '#1f2328', 'important');
      label.style.setProperty('-webkit-text-fill-color', '#1f2328', 'important');
    });

    return popup;
  }

  // Handle answer selection
  function handleAnswer(event, cueData, popup) {
    const selectedAnswer = event.currentTarget.dataset.answer;
    const isCorrect = selectedAnswer === cueData.correctAnswer;
    popupPinned = true;
    clearHidePopupTimer();
    const responseTimeMs = Math.max(0, Date.now() - Number(popup.dataset.openedAt || Date.now()));
    
    // Record interaction
    recordInteraction(cueData, selectedAnswer, isCorrect, responseTimeMs);

    // Show feedback
    const feedback = popup.querySelector('.edgelang-feedback');
    feedback.style.display = 'block';
    
    if (isCorrect) {
      feedback.className = 'edgelang-feedback edgelang-correct';
      feedback.innerHTML = `
        <div class="edgelang-feedback-icon">✓</div>
        <div class="edgelang-feedback-text">${settings.positiveFeedback ? (cueData.mode === 'active' ? 'Correct foreign equivalent.' : 'Correct! Nice work.') : 'Got it!'}</div>
      `;
      
      // Mark as resolved
      resolveItem(cueData.text);
    } else {
      feedback.className = 'edgelang-feedback edgelang-incorrect';
      feedback.innerHTML = `
        <div class="edgelang-feedback-icon">✗</div>
        <div class="edgelang-feedback-text">
          <strong>Not quite!</strong><br>
          <span>${cueData.mode === 'active'
            ? `You picked <em>${selectedAnswer}</em>, but the best ${getLanguageDisplayName(settings.targetLanguage)} equivalent here is <em>${cueData.correctAnswer}</em>.`
            : `You picked <em>${selectedAnswer}</em>, but in this context the best answer is <em>${cueData.correctAnswer}</em>.`}</span>
        </div>
      `;
    }
    logDebug('popup:answer', { text: cueData.text, isCorrect, selectedAnswer });

    const exampleButton = popup.querySelector('.edgelang-examples-btn');
    const examplePanel = popup.querySelector('.edgelang-example');
    const usageExamples = parseUsageExamples(popup.dataset.usageExamples);
    if (usageExamples.length) {
      exampleButton.style.display = 'block';
      exampleButton.addEventListener('click', () => {
        examplePanel.style.display = 'block';
        examplePanel.innerHTML = renderUsageExamplesHtml(cueData, usageExamples);
        exampleButton.style.display = 'none';
        logDebug('popup:examples-shown', { text: cueData.text, count: usageExamples.length });
      }, { once: true });
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
  function recordInteraction(cueData, selectedAnswer, isCorrect, responseTimeMs) {
    const text = cueData.text;
    const now = Date.now();
    
    if (!learnerProfile.stats) {
      learnerProfile.stats = { totalAnswered: 0, correctAnswers: 0, streak: 0, averageLatencyMs: 0 };
    }
    
    learnerProfile.stats.totalAnswered++;
    if (isCorrect) {
      learnerProfile.stats.correctAnswers++;
      learnerProfile.stats.streak++;
    } else {
      learnerProfile.stats.streak = 0;
    }
    learnerProfile.stats.lastActive = now;
    const previousAverageLatency = learnerProfile.stats.averageLatencyMs || 0;
    learnerProfile.stats.averageLatencyMs = Math.round(((previousAverageLatency * (learnerProfile.stats.totalAnswered - 1)) + responseTimeMs) / learnerProfile.stats.totalAnswered);

    // Update vocabulary entry
    if (!learnerProfile.vocabulary[text]) {
      learnerProfile.vocabulary[text] = { attempts: 0, correct: 0, incorrect: 0, averageLatencyMs: 0, contexts: [] };
    }
    learnerProfile.vocabulary[text].attempts++;
    if (isCorrect) {
      learnerProfile.vocabulary[text].correct++;
    } else {
      learnerProfile.vocabulary[text].incorrect = (learnerProfile.vocabulary[text].incorrect || 0) + 1;
    }
    const wordStats = learnerProfile.vocabulary[text];
    const attempts = wordStats.attempts || 1;
    const priorLatency = wordStats.averageLatencyMs || 0;
    wordStats.averageLatencyMs = Math.round(((priorLatency * (attempts - 1)) + responseTimeMs) / attempts);
    if (cueData.contextExcerpt) {
      wordStats.contexts = Array.from(new Set([...(wordStats.contexts || []), cueData.contextExcerpt])).slice(-3);
    }

    if (!Array.isArray(learnerProfile.recentInteractions)) {
      learnerProfile.recentInteractions = [];
    }
    learnerProfile.recentInteractions.push({
      text,
      selectedAnswer,
      correctAnswer: cueData.correctAnswer,
      category: classifyCueCategory(cueData),
      responseTimeMs,
      contextExcerpt: cueData.contextExcerpt || '',
      outcome: isCorrect ? 'correct' : 'incorrect',
      timestamp: now
    });
    learnerProfile.recentInteractions = learnerProfile.recentInteractions.slice(-20);

    if (!Array.isArray(learnerProfile.confusionPatterns)) {
      learnerProfile.confusionPatterns = [];
    }
    if (!isCorrect) {
      learnerProfile.confusionPatterns.push({
        text,
        selectedAnswer,
        correctAnswer: cueData.correctAnswer,
        category: classifyCueCategory(cueData),
        timestamp: now
      });
      learnerProfile.confusionPatterns = learnerProfile.confusionPatterns.slice(-20);
    }

    if (!learnerProfile.conceptPerformance) {
      learnerProfile.conceptPerformance = {};
    }
    const conceptKey = classifyCueCategory(cueData);
    const conceptStats = learnerProfile.conceptPerformance[conceptKey] || { attempts: 0, correct: 0 };
    conceptStats.attempts += 1;
    if (isCorrect) {
      conceptStats.correct += 1;
    }
    learnerProfile.conceptPerformance[conceptKey] = conceptStats;

    // Save
    safeStorageSet('local', { learnerProfile }).then((saved) => {
      if (!saved) {
        logDebug('storage:skipped', { reason: 'context_unavailable', target: 'learnerProfile' });
      }
    });
    
    // Notify background to update stats
    safeSendRuntimeMessage({
      action: 'updateStats',
      isCorrect: isCorrect
    }, null);
    logDebug('stats:recorded', { text, isCorrect, responseTimeMs, category: conceptKey });
  }

  // Mark item as resolved
  function resolveItem(text) {
    if (!learnerProfile.resolvedItems) {
      learnerProfile.resolvedItems = [];
    }
    
    if (!learnerProfile.resolvedItems.includes(text)) {
      learnerProfile.resolvedItems.push(text);
      safeStorageSet('local', { learnerProfile }).then((saved) => {
        if (!saved) {
          logDebug('storage:skipped', { reason: 'context_unavailable', target: 'resolvedItems' });
        }
      });
      pageCues = pageCues.filter(cue => cue.text !== text);
      unwrapCueElementsByText(text);
      logDebug('item:resolved', { text });
      updateIconState(false);
    }
  }

  function unwrapCueElementsByText(text) {
    if (!text) return;
    const matchingCues = Array.from(document.querySelectorAll(`.${CUE_CLASS}`))
      .filter((element) => element.dataset.text === text);

    matchingCues.forEach((element) => {
      const parent = element.parentNode;
      if (!parent) return;
      const originalText = element.dataset.originalText || element.dataset.text || '';
      if (originalText) {
        parent.insertBefore(document.createTextNode(originalText), element);
      } else {
        while (element.firstChild) {
          parent.insertBefore(element.firstChild, element);
        }
      }
      parent.removeChild(element);
    });
    logDebug('render:unwrapped-resolved', { text, count: matchingCues.length });
  }

  // Hide popup
  function hidePopup() {
    clearHidePopupTimer();
    popupPinned = false;
    if (currentScrollHandler) {
      document.removeEventListener('scroll', currentScrollHandler);
      currentScrollHandler = null;
    }
    if (currentPopup) {
      currentPopup.remove();
      currentPopup = null;
      logDebug('popup:hide');
    }
    flushPendingReprocess();
  }

  function scheduleHidePopup() {
    if (popupPinned) {
      return;
    }
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

  async function playPronunciation(cueData) {
    const language = settings.currentMode === 'passive'
      ? settings.targetLanguage
      : settings.nativeLanguage;

    if (settings.ttsEngine !== 'browser') {
    try {
      const response = await safeSendRuntimeMessage({
        action: 'synthesizeSpeech',
        text: cueData.text,
        language,
        voice: settings.ttsVoice || 'auto',
        format: 'mp3'
      }, null);
      if (response?.success && response.audioBase64) {
        const objectUrl = playBase64Audio(response.audioBase64, response.mimeType || 'audio/mpeg');
        logDebug('audio:play-modelmesh', {
          text: cueData.text,
          lang: language,
          provider: response.provider,
          model: response.model
        });
        return objectUrl;
      }
      logDebug('audio:modelmesh-unavailable', {
        text: cueData.text,
        lang: language,
        reason: response?.error || 'unknown'
      });
    } catch (error) {
      logDebug('audio:modelmesh-error', {
        text: cueData.text,
        lang: language,
        message: error.message
      });
    }
    }

    if (!('speechSynthesis' in window)) {
      logDebug('audio:blocked', { reason: 'no_browser_tts', text: cueData.text, lang: language });
      return null;
    }

    const utterance = new SpeechSynthesisUtterance(cueData.text);
    utterance.lang = language;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    logDebug('audio:play-browser', { text: cueData.text, lang: utterance.lang });
    return null;
  }

  function playBase64Audio(audioBase64, mimeType) {
    const binary = window.atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const blob = new Blob([bytes], { type: mimeType || 'audio/mpeg' });
    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    audio.addEventListener('ended', () => URL.revokeObjectURL(objectUrl), { once: true });
    audio.addEventListener('error', () => URL.revokeObjectURL(objectUrl), { once: true });
    audio.play().catch((error) => {
      logDebug('audio:playback-error', { message: error.message });
      URL.revokeObjectURL(objectUrl);
    });
    return objectUrl;
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
    pageCues = [];
    hasRenderedCues = false;
    document.querySelectorAll(`.${CUE_CLASS}`).forEach(el => {
      const parent = el.parentNode;
      if (!parent) return;
      const originalText = el.dataset.originalText || el.dataset.text || '';
      if (originalText) {
        parent.insertBefore(document.createTextNode(originalText), el);
      } else {
        while (el.firstChild) {
          parent.insertBefore(el.firstChild, el);
        }
      }
      parent.removeChild(el);
    });
    if (currentPopup && popupPinned) {
      logDebug('popup:preserved-during-clear');
    } else {
      hidePopup();
    }
    logDebug('render:clear');
  }

  // Update icon state
  function updateIconState(processing = isProcessing, stage = null) {
    const cueCount = Math.max(0, pageCues.length);
    const completed = hasRenderedCues && cueCount === 0 && !processing && !blockerReason;
    safeSendRuntimeMessage({
      action: 'updateIconState',
      enabled: isEnabled,
      configured: settings.apiKeysConfigured,
      siteEnabled: settings.siteEnabled,
      paused: settings.isPaused,
      offline: !navigator.onLine,
      processing,
      stage,
      cueCount,
      completed
    }, null);
    logDebug('icon:update', {
      enabled: isEnabled,
      configured: settings.apiKeysConfigured,
      siteEnabled: settings.siteEnabled,
      paused: settings.isPaused,
      offline: !navigator.onLine,
      processing,
      stage,
      cueCount,
      completed
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
      if (!getBlockerReason()) {
        scheduleProcessPage('dom_mutation');
      }
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('load', () => scheduleProcessPage('window_load'));
    window.addEventListener('scroll', () => {
      const currentY = window.scrollY || 0;
      if (Math.abs(currentY - lastScrollProcessY) >= Math.max(600, window.innerHeight * 0.75)) {
        lastScrollProcessY = currentY;
        scheduleProcessPage('scroll_progress');
      }
    }, { passive: true });
  }

  function scheduleProcessPage(trigger) {
    if (currentPopup) {
      pendingReprocessTrigger = trigger;
      logDebug('process:deferred', { trigger, reason: 'popup_open' });
      return;
    }
    clearTimeout(processRetryTimer);
    processRetryTimer = window.setTimeout(() => {
      processPage(false, trigger);
    }, 1200);
    logDebug('process:scheduled', { trigger });
  }

  function flushPendingReprocess() {
    if (!pendingReprocessTrigger || isProcessing || getBlockerReason()) {
      return;
    }
    const trigger = pendingReprocessTrigger;
    pendingReprocessTrigger = null;
    logDebug('process:resume-deferred', { trigger });
    scheduleProcessPage(trigger);
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
      safeSendRuntimeMessage({ action: 'debugLog', entry }, null).catch(() => {});
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

  window.__edgelangGetState = function() {
    return {
      currentMode: settings.currentMode,
      pageLanguage: currentPageLanguage,
      cueCount: pageCues.length,
      processing: isProcessing,
      blockerReason,
      lastExtraction: lastExtractionSummary,
      debugTail: (window.__edgelangDebug || []).slice(-20)
    };
  };

  // Utility: Shuffle array
  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function sampleEvenly(items, count) {
    if (items.length <= count) {
      return items.slice();
    }

    const sampled = [];
    for (let index = 0; index < count; index += 1) {
      const sourceIndex = Math.min(
        items.length - 1,
        Math.floor((index * items.length) / count)
      );
      sampled.push(items[sourceIndex]);
    }
    return sampled;
  }

  function distributeCuesAcrossBlocks(cues, count) {
    if (cues.length <= count) {
      return cues.slice();
    }

    const groups = new Map();
    cues.forEach((cue) => {
      const category = classifyCueCategory(cue);
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category).push(cue);
    });

    const distributed = [];
    const categoryEntries = Array.from(groups.values()).map((group) =>
      [...group].sort((left, right) => (left.blockIndex ?? 999) - (right.blockIndex ?? 999))
    );
    let pointer = 0;
    while (distributed.length < count && categoryEntries.some((group) => group.length)) {
      const group = categoryEntries[pointer % categoryEntries.length];
      if (group.length) {
        distributed.push(group.shift());
      }
      pointer += 1;
    }

    if (distributed.length < count) {
      return sampleEvenly(cues, count);
    }

    return distributed.slice(0, count);
  }

  function classifyCueCategory(cue) {
    const text = cue?.text || '';
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount >= 3) return 'multiword';
    if (wordCount === 2) return 'collocation';
    if (/\b(to|be|is|are|was|were|have|has|had)\b/i.test(text)) return 'verb';
    return 'single';
  }

  function mergeCueSets(existingCues, incomingCues, maxCues) {
    const merged = [];
    const seen = new Set();

    [...existingCues, ...incomingCues].forEach((cue) => {
      if (!cue?.text || seen.has(cue.text)) {
        return;
      }
      seen.add(cue.text);
      merged.push(cue);
    });

    if (merged.length <= maxCues) {
      return merged;
    }

    const existingTexts = new Set(existingCues.map((cue) => cue.text));
    const preserved = merged.filter((cue) => existingTexts.has(cue.text));
    if (preserved.length >= maxCues) {
      return preserved.slice(0, maxCues);
    }

    const remainder = distributeCuesAcrossBlocks(
      merged.filter((cue) => !existingTexts.has(cue.text)),
      maxCues - preserved.length
    );
    return [...preserved, ...remainder];
  }

  function normalizeCueData(cueData) {
    const text = typeof cueData.text === 'string' ? cueData.text.trim() : '';
    const translation = typeof cueData.translation === 'string' ? cueData.translation.trim() : '';
    const correctAnswer = typeof cueData.correctAnswer === 'string' && cueData.correctAnswer.trim()
      ? cueData.correctAnswer.trim()
      : translation;
    const nativeMeaning = typeof cueData.nativeMeaning === 'string' && cueData.nativeMeaning.trim()
      ? cueData.nativeMeaning.trim()
      : translation;
    const displayText = typeof cueData.displayText === 'string' && cueData.displayText.trim()
      ? cueData.displayText.trim()
      : text;
    const mode = cueData.mode === 'active' ? 'active' : 'passive';
    const contextExcerpt = typeof cueData.contextExcerpt === 'string' ? cueData.contextExcerpt.trim() : '';
    const distractors = Array.isArray(cueData.distractors)
      ? cueData.distractors
        .map((option) => typeof option === 'string' ? option.trim() : '')
        .filter((option) => option && option !== correctAnswer)
      : [];

    return {
      text,
      translation,
      correctAnswer,
      nativeMeaning,
      displayText,
      mode,
      contextExcerpt,
      distractors
    };
  }

  function collectUsageExamples(targetText, sourceElement) {
    const snippets = [];
    const seen = new Set();
    const candidateElements = [];

    if (sourceElement?.closest) {
      const localContainer = sourceElement.closest('p, li, blockquote, figcaption, dd, dt, h2, h3, h4, article, section, div');
      if (localContainer) {
        candidateElements.push(localContainer);
      }
    }

    if (Array.isArray(pageBlocks)) {
      pageBlocks
        .filter((block) => typeof block.text === 'string' && block.text.toLowerCase().includes(targetText.toLowerCase()))
        .slice(0, 4)
        .forEach((block) => {
          if (block.element) {
            candidateElements.push(block.element);
          }
        });
    }

    candidateElements.forEach((element) => {
      extractSnippetsFromText(element.innerText || element.textContent || '', targetText).forEach((snippet) => {
        const key = snippet.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          snippets.push(snippet);
        }
      });
    });

    if (!snippets.length) {
      extractSnippetsFromText(document.body?.innerText || '', targetText).forEach((snippet) => {
        const key = snippet.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          snippets.push(snippet);
        }
      });
    }

    return snippets.slice(0, 3);
  }

  function extractSnippetsFromText(text, targetText) {
    const normalizedText = normalizeBlockText(text || '');
    const normalizedTarget = normalizeBlockText(targetText || '');
    if (!normalizedText || !normalizedTarget) {
      return [];
    }

    const sentences = normalizedText
      .split(/(?<=[.!?])\s+/)
      .map((segment) => segment.trim())
      .filter(Boolean);

    const directMatches = sentences
      .filter((segment) => segment.toLowerCase().includes(normalizedTarget.toLowerCase()))
      .map((segment) => trimSnippet(segment, normalizedTarget));

    if (directMatches.length) {
      return directMatches;
    }

    const index = normalizedText.toLowerCase().indexOf(normalizedTarget.toLowerCase());
    if (index === -1) {
      return [];
    }

    const start = Math.max(0, index - 90);
    const end = Math.min(normalizedText.length, index + normalizedTarget.length + 110);
    return [trimSnippet(normalizedText.slice(start, end), normalizedTarget)];
  }

  function trimSnippet(text, targetText) {
    const normalized = normalizeBlockText(text);
    if (normalized.length <= 220) {
      return normalized;
    }

    const index = normalized.toLowerCase().indexOf(targetText.toLowerCase());
    if (index === -1) {
      return `${normalized.slice(0, 217).trim()}...`;
    }

    const start = Math.max(0, index - 80);
    const end = Math.min(normalized.length, index + targetText.length + 100);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < normalized.length ? '...' : '';
    return `${prefix}${normalized.slice(start, end).trim()}${suffix}`;
  }

  function parseUsageExamples(serializedExamples) {
    if (!serializedExamples) {
      return [];
    }
    try {
      const parsed = JSON.parse(serializedExamples);
      return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string' && value.trim()) : [];
    } catch {
      return [];
    }
  }

  function renderUsageExamplesHtml(cueData, examples) {
    const targetText = cueData?.text || '';
    const meaning = typeof cueData?.nativeMeaning === 'string' && cueData.nativeMeaning.trim()
      ? cueData.nativeMeaning.trim()
      : '';
    const items = examples
      .map((example) => `<li>${highlightTargetInSnippet(escapeHtml(example), targetText)}</li>`)
      .join('');
    const meaningHtml = meaning
      ? `<div class="edgelang-example-meaning"><strong>Meaning in ${escapeHtml(getLanguageDisplayName(settings.nativeLanguage))}:</strong> ${escapeHtml(meaning)}</div>`
      : '';
    return `${meaningHtml}<div class="edgelang-example-title">Usage on this page</div><ul class="edgelang-example-list">${items}</ul>`;
  }

  function getLanguageDisplayName(languageCode) {
    try {
      const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
      return displayNames.of(languageCode || 'en') || languageCode || 'native language';
    } catch {
      return languageCode || 'native language';
    }
  }

  function highlightTargetInSnippet(snippetHtml, targetText) {
    const escapedTarget = escapeRegExp(escapeHtml(targetText));
    if (!escapedTarget) {
      return snippetHtml;
    }
    return snippetHtml.replace(new RegExp(escapedTarget, 'ig'), (match) => `<mark>${match}</mark>`);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'settingsUpdated') {
      logDebug('message:settings-updated');
      lastProcessedSignature = null;
      clearCues();
      init({ forceProcess: true, trigger: 'settings_updated' });
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
