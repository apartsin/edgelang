/**
 * EdgeLang Background Script
 * Handles API communication using a browser-safe multi-provider adapter.
 */

import { ModelMeshAdapter } from './modelmesh-adapter.js';

// State
let settings = {};
let learnerProfile = {};
let modelMeshClient = null;
let iconState = {
  enabled: true,
  configured: false,
  paused: false,
  offline: false,
  processing: false
};
let processingBadgeInterval = null;
let processingBadgeVisible = false;
const DEBUG_LOG_KEY = 'debugLog';
const DEBUG_LOG_LIMIT = 200;
const SUPPORTED_LANGUAGE_CODES = [
  'ar', 'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi',
  'hu', 'id', 'it', 'ja', 'ko', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'sk',
  'sr', 'sv', 'th', 'tr', 'uk', 'vi', 'zh'
];
const CALIBRATION_BANK = {
  es: [
    { prompt: 'Translate "hola" to English.', choices: ['hello', 'goodbye', 'please', 'thanks'], correctAnswer: 'hello', type: 'passive', difficulty: 'novice' },
    { prompt: 'How do you say "thank you" in Spanish?', choices: ['gracias', 'hola', 'adios', 'por favor'], correctAnswer: 'gracias', type: 'active', difficulty: 'novice' },
    { prompt: 'Translate "libro" to English.', choices: ['book', 'pen', 'table', 'window'], correctAnswer: 'book', type: 'passive', difficulty: 'beginner' },
    { prompt: 'How do you say "house" in Spanish?', choices: ['casa', 'calle', 'puerta', 'escuela'], correctAnswer: 'casa', type: 'active', difficulty: 'beginner' },
    { prompt: 'Translate "aprovechar" to English.', choices: ['take advantage of', 'avoid', 'repeat', 'forget'], correctAnswer: 'take advantage of', type: 'passive', difficulty: 'intermediate' },
    { prompt: 'How do you say "to realize / notice" in Spanish?', choices: ['darse cuenta', 'aprovechar', 'echar de menos', 'tener ganas'], correctAnswer: 'darse cuenta', type: 'active', difficulty: 'intermediate' },
    { prompt: 'Translate "echar de menos" to English.', choices: ['miss', 'throw less', 'arrive early', 'make up'], correctAnswer: 'miss', type: 'passive', difficulty: 'intermediate' },
    { prompt: 'How do you say "to put up with" in Spanish?', choices: ['soportar', 'resolver', 'parecer', 'apuntar'], correctAnswer: 'soportar', type: 'active', difficulty: 'upper-intermediate' },
    { prompt: 'Translate "desenlace" to English.', choices: ['outcome', 'beginning', 'warning', 'shortcut'], correctAnswer: 'outcome', type: 'passive', difficulty: 'advanced' },
    { prompt: 'How do you say "constraint" in Spanish?', choices: ['restriccion', 'destino', 'hallazgo', 'vinculo'], correctAnswer: 'restriccion', type: 'active', difficulty: 'advanced' }
  ]
};

// Initialize
async function init() {
  await writeDebugLog('background', 'init:start');
  await loadSettings();
  await loadLearnerProfile();
  initModelMesh();
  updateIconState();
  await writeDebugLog('background', 'init:ready', {
    enabled: settings.enabled,
    paused: settings.isPaused,
    apiKeysConfigured: settings.apiKeysConfigured
  });
}

// Initialize ModelMesh
function initModelMesh() {
  const apiKeys = settings.apiKeys || {};
  
  if (Object.keys(apiKeys).length === 0) {
    console.log('EdgeLang: No API keys configured');
    modelMeshClient = null;
    writeDebugLog('background', 'modelmesh:not-configured');
    return;
  }
  
  try {
    modelMeshClient = ModelMeshAdapter.init(apiKeys);
    const configuredProviders = Object.keys(modelMeshClient.providers || {});
    if (configuredProviders.length === 0) {
      console.log('EdgeLang: No valid providers configured');
      modelMeshClient = null;
      writeDebugLog('background', 'modelmesh:no-valid-providers');
      return;
    }
    console.log('EdgeLang: Adapter initialized with providers:', configuredProviders);
    writeDebugLog('background', 'modelmesh:ready', { providers: configuredProviders });
  } catch (error) {
    console.error('EdgeLang: Adapter initialization error:', error);
    modelMeshClient = null;
    writeDebugLog('background', 'modelmesh:error', { message: error.message });
  }
}

// Load settings
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(null, (result) => {
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
        modePreference: result.modePreference || 'auto',
        isPaused: result.isPaused || false,
        calibrationState: result.calibrationState || null,
        quotaExhausted: result.quotaExhausted || false
      };
      settings.apiKeysConfigured = Object.keys(result.apiKeys || {}).length > 0;
      iconState.enabled = settings.enabled !== false;
      iconState.configured = settings.apiKeysConfigured;
      iconState.paused = settings.isPaused || false;
      writeDebugLog('background', 'settings:loaded', {
        enabled: settings.enabled,
        paused: settings.isPaused,
        targetLanguage: settings.targetLanguage,
        siteMode: settings.siteMode,
        configuredProviders: Object.keys(settings.apiKeys || {}).filter((key) => settings.apiKeys[key])
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
        stats: { totalAnswered: 0, correctAnswers: 0, streak: 0 }
      };
      resolve();
    });
  });
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true;
});

async function handleMessage(message) {
  await writeDebugLog('background', `message:${message.action}`, sanitizeForLog(message));
  switch (message.action) {
    case 'analyzePage':
      return await analyzePage(message);
      
    case 'detectLanguage':
      return await detectLanguage(message.text);
      
    case 'updateStats':
      return await updateStats(message.isCorrect);
      
    case 'updateIconState':
      updateIconState(message);
      return { success: true };
      
    case 'getSettings':
      return settings;
      
    case 'getProfile':
      return learnerProfile;
      
    case 'runCalibration':
      return await runCalibration(message.answers);

    case 'getCalibrationQuestions':
      return await getCalibrationQuestions(message.selfAssessedLevel);

    case 'setModePreference':
      await chrome.storage.sync.set({ modePreference: message.modePreference });
      settings.modePreference = message.modePreference;
      updateIconState();
      return { success: true, modePreference: settings.modePreference };

    case 'setPaused':
      await chrome.storage.sync.set({ isPaused: !!message.isPaused });
      settings.isPaused = !!message.isPaused;
      updateIconState();
      return { success: true, isPaused: settings.isPaused };

    case 'toggleCurrentSite':
      return await toggleCurrentSite(message.hostname);

    case 'openCalibration':
      await chrome.runtime.openOptionsPage();
      return { success: true };
      
    case 'reinitModelMesh':
      initModelMesh();
      return { success: true };
      
    case 'getModelMeshStatus':
      return { 
        configured: !!modelMeshClient,
        providers: modelMeshClient ? Object.keys(settings.apiKeys || {}).filter(k => settings.apiKeys[k]) : []
      };

    case 'validateApiKeys':
      return await validateApiKeys(message.apiKeys || {}, message.modelSelection || {});

    case 'debugLog':
      await writeDebugLog(message.entry?.source || 'content', message.entry?.event || 'unknown', message.entry?.details || {});
      return { success: true };

    case 'getDebugLog':
      return await getDebugLog();
      
    default:
      return { error: 'Unknown action' };
  }
}

// Analyze page for learnable items
async function analyzePage(message) {
  await writeDebugLog('background', 'analyze:start', {
    mode: message.mode,
    learnerLevel: message.learnerLevel,
    intensity: message.intensity,
    textLength: message.text?.length || 0
  });
  if (!settings.apiKeysConfigured) {
    await writeDebugLog('background', 'analyze:blocked', { reason: 'api_keys_not_configured' });
    return { error: 'API keys not configured' };
  }
  if (settings.quotaExhausted) {
    await writeDebugLog('background', 'analyze:blocked', { reason: 'quota_exhausted' });
    return { error: 'All configured provider quotas are currently exhausted.' };
  }

  try {
    updateIconState({ processing: true });
    const prompt = buildAnalysisPrompt(message);
    
    let response;
    
    if (modelMeshClient) {
      const provider = selectProvider('edge-detection');
      const model = getSelectedModel('edge-detection', provider);
      await writeDebugLog('background', 'analyze:provider', { provider, model, path: 'adapter' });
      const result = await modelMeshClient.chatCompletionsCreate({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 4000,
        provider,
        model
      });
      response = result.choices?.[0]?.message?.content || '';
    } else {
      // Fallback to manual implementation
      await writeDebugLog('background', 'analyze:provider', { path: 'manual-fallback' });
      response = await callManualAPI(prompt);
    }

    const cues = parseCuesFromResponse(response, message.mode);
    await writeDebugLog('background', 'analyze:complete', { cueCount: cues.length });
    return { cues: cues };
    
  } catch (error) {
    console.error('EdgeLang: Analysis error:', error);
    await writeDebugLog('background', 'analyze:error', { message: error.message });
    if (String(error.message || '').includes('429')) {
      settings.quotaExhausted = true;
      await chrome.storage.sync.set({ quotaExhausted: true });
    }
    return { error: error.message };
  } finally {
    updateIconState({ processing: false });
  }
}

// Manual API fallback
async function callManualAPI(prompt) {
  const provider = selectProvider('edge-detection');
  const apiKey = settings.apiKeys?.[provider];
  
  if (!apiKey) {
    throw new Error(`No API key for ${provider}`);
  }

  const model = settings.modelSelection?.['edge-detection'] || getDefaultModel(provider);
  await writeDebugLog('background', 'manual-api:start', { provider, model });
  const requestBody = buildProviderRequest(provider, model, prompt, 4000);

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(getProviderEndpoint(provider, apiKey), {
      method: 'POST',
      headers: buildProviderHeaders(provider, apiKey),
      body: JSON.stringify(requestBody)
    });

    if (response.ok) {
      const data = await response.json();
      await writeDebugLog('background', 'manual-api:success', { provider, model });
      return parseProviderResponse(provider, data);
    }

    if (response.status === 429) {
      await writeDebugLog('background', 'manual-api:error', { provider, model, status: 429 });
      throw new Error(`API error: ${response.status}`);
    }

    if (attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw new Error('API error: retries exhausted');
}

// Build prompt for LLM analysis
function buildAnalysisPrompt(message) {
  const { text, language, learnerLevel, intensity, mode } = message;
  
  const instructions = mode === 'passive' 
    ? `Analyze this ${language} text and identify ${intensity}% of words/phrases that would be appropriate for a ${learnerLevel} level English learner studying ${language}.`
    : `Analyze this English text and identify ${intensity}% of common English words/phrases that a ${learnerLevel} ${language} speaker would find useful to learn.`;

  return `${instructions}

For each identified item, provide:
1. The word/phrase in the original language
2. A natural translation
3. 4 plausible distractors (wrong but educational answers)

Return as JSON array:
[{"text": "word", "translation": "translation", "correctAnswer": "translation", "distractors": ["wrong1", "wrong2", "wrong3", "wrong4"]}]

Text to analyze:
${text.substring(0, 8000)}

Respond only with valid JSON array, no other text.`;
}

// Parse cues from LLM response
function parseCuesFromResponse(response, mode) {
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('EdgeLang: No JSON found in response');
      writeDebugLog('background', 'parse:no-json', { mode });
      return [];
    }
    
    const cues = JSON.parse(jsonMatch[0]);
    
    return cues.filter(cue => 
      cue.text && 
      cue.translation && 
      cue.correctAnswer && 
      cue.distractors?.length >= 3
    ).slice(0, 50);
    
  } catch (error) {
    console.error('EdgeLang: Parse error:', error);
    writeDebugLog('background', 'parse:error', { message: error.message });
    return [];
  }
}

// Detect language
async function detectLanguage(text) {
  await writeDebugLog('background', 'detect-language:start', { textLength: text?.length || 0 });
  const langPatterns = {
    'ar': /[\u0600-\u06ff]/,
    'he': /[\u0590-\u05ff]/,
    'hi': /[\u0900-\u097f]/,
    'ru': /[ёыэъ]/i,
    'es': /[áéíóúñ¿¡]/i,
    'fr': /[àâçéèêëîïôûùüÿœæ]/i,
    'de': /[äöüß]/i,
    'it': /[àèéìíîòóùú]/i,
    'pt': /[ãõç]/i,
    'th': /[\u0e00-\u0e7f]/,
    'uk': /[іїєґ]/i,
    'zh': /[\u4e00-\u9fff]/,
    'ja': /[\u3040-\u309f\u30a0-\u30ff]/,
    'ko': /[\uac00-\ud7af]/
  };

  for (const [lang, pattern] of Object.entries(langPatterns)) {
    if (pattern.test(text.substring(0, 500))) {
      await writeDebugLog('background', 'detect-language:heuristic', { language: lang });
      return { language: lang };
    }
  }

    if (settings.apiKeysConfigured && modelMeshClient) {
      try {
      const prompt = `What language is this? Just answer with one language code from this list: ${SUPPORTED_LANGUAGE_CODES.join(', ')}.\n\n${text.substring(0, 500)}`;
      const provider = selectProvider('classification');
      const model = getSelectedModel('classification', provider);
      
      const result = await modelMeshClient.chatCompletionsCreate({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 10,
        provider,
        model
      });

      const langMatch = result.choices?.[0]?.message?.content?.match(new RegExp(`\\b(${SUPPORTED_LANGUAGE_CODES.join('|')})\\b`, 'i'));
      if (langMatch) {
        await writeDebugLog('background', 'detect-language:model', { language: langMatch[1].toLowerCase() });
        return { language: langMatch[1].toLowerCase() };
      }
    } catch (e) {
      console.warn('EdgeLang: Language detection failed:', e);
      await writeDebugLog('background', 'detect-language:error', { message: e.message });
    }
  }

  await writeDebugLog('background', 'detect-language:fallback', { language: 'en' });
  return { language: 'en' };
}

function selectProvider(task) {
  const taskProviderMap = {
    'edge-detection': 'openai',
    'distractor-generation': 'openai',
    'explanation': 'anthropic',
    'classification': 'openai',
    'calibration': 'openai'
  };
  
  const preferred = taskProviderMap[task] || 'openai';
  
  if (settings.apiKeys?.[preferred]) {
    return preferred;
  }
  
  return Object.keys(settings.apiKeys || {})[0] || 'openai';
}

function getDefaultModel(provider) {
  const defaults = {
    'openai': 'gpt-3.5-turbo',
    'anthropic': 'claude-3-haiku-20240307',
    'google': 'gemini-1.5-flash',
    'groq': 'llama-3.1-70b-versatile',
    'openrouter': 'google/gemini-2.0-flash-001'
  };
  return defaults[provider] || 'gpt-3.5-turbo';
}

function getSelectedModel(task, provider) {
  const selection = settings.modelSelection || {};
  return selection[provider] || selection[task] || getDefaultModel(provider);
}

function buildProviderRequest(provider, model, prompt, maxTokens) {
  switch (provider) {
    case 'openai':
    case 'groq':
    case 'openrouter':
      return { model, messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: maxTokens };
    case 'anthropic':
      return { model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens };
    case 'google':
      return {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: maxTokens
        }
      };
    default:
      return { model, prompt, max_tokens: maxTokens };
  }
}

function getProviderEndpoint(provider, apiKey) {
  const endpoints = {
    'openai': 'https://api.openai.com/v1/chat/completions',
    'anthropic': 'https://api.anthropic.com/v1/messages',
    'google': `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    'groq': 'https://api.groq.com/openai/v1/chat/completions',
    'openrouter': 'https://openrouter.ai/api/v1/chat/completions'
  };
  return endpoints[provider];
}

function buildProviderHeaders(provider, apiKey) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (provider === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else if (provider === 'google') {
    return headers;
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://edgelang.dev';
    headers['X-Title'] = 'EdgeLang';
  }

  return headers;
}

function parseProviderResponse(provider, data) {
  switch (provider) {
    case 'openai':
    case 'groq':
    case 'openrouter':
      return data.choices?.[0]?.message?.content || '';
    case 'anthropic':
      return data.content?.[0]?.text || '';
    case 'google':
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    default:
      return '';
  }
}

async function validateApiKeys(apiKeys, modelSelection = {}) {
  const trimmedKeys = Object.fromEntries(
    Object.entries(apiKeys).filter(([, value]) => typeof value === 'string' && value.trim())
      .map(([key, value]) => [key, value.trim()])
  );

  const providers = Object.keys(trimmedKeys);
  if (!providers.length) {
    await writeDebugLog('background', 'validate-keys:empty');
    return { success: false, error: 'No API keys provided', results: [] };
  }

  const originalSelection = settings.modelSelection;
  settings.modelSelection = { ...originalSelection, ...modelSelection };

  try {
    const results = await Promise.all(providers.map(async (provider) => {
      const apiKey = trimmedKeys[provider];
      const model = modelSelection[provider] || getDefaultModel(provider);

      try {
        const response = await fetch(getProviderEndpoint(provider, apiKey), {
          method: 'POST',
          headers: buildProviderHeaders(provider, apiKey),
          body: JSON.stringify(buildProviderRequest(provider, model, 'Reply with OK.', 8))
        });

        if (!response.ok) {
          await writeDebugLog('background', 'validate-keys:result', { provider, model, valid: false, status: response.status });
          return {
            provider,
            model,
            valid: false,
            status: response.status,
            message: `HTTP ${response.status}`
          };
        }

        await writeDebugLog('background', 'validate-keys:result', { provider, model, valid: true, status: response.status });
        return {
          provider,
          model,
          valid: true,
          status: response.status,
          message: 'Validated'
        };
      } catch (error) {
        await writeDebugLog('background', 'validate-keys:result', { provider, model, valid: false, message: error.message });
        return {
          provider,
          model,
          valid: false,
          message: error.message || 'Validation failed'
        };
      }
    }));

    return {
      success: results.some(result => result.valid),
      results
    };
  } finally {
    settings.modelSelection = originalSelection;
  }
}

async function writeDebugLog(source, event, details = {}) {
  const entry = {
    timestamp: Date.now(),
    source,
    event,
    details: sanitizeForLog(details)
  };

  try {
    const current = await new Promise((resolve) => {
      chrome.storage.local.get([DEBUG_LOG_KEY], (result) => resolve(result[DEBUG_LOG_KEY] || []));
    });
    const next = [...current, entry].slice(-DEBUG_LOG_LIMIT);
    await chrome.storage.local.set({ [DEBUG_LOG_KEY]: next });
  } catch (error) {
    console.warn('EdgeLang: Failed to persist debug log', error);
  }
}

async function getDebugLog() {
  return new Promise((resolve) => {
    chrome.storage.local.get([DEBUG_LOG_KEY], (result) => {
      resolve({ entries: result[DEBUG_LOG_KEY] || [] });
    });
  });
}

function sanitizeForLog(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value.length > 300 ? `${value.slice(0, 300)}...` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeForLog(item));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/key|authorization|token/i.test(key))
        .map(([key, val]) => [key, sanitizeForLog(val)])
    );
  }
  return value;
}

async function updateStats(isCorrect) {
  learnerProfile.stats = learnerProfile.stats || { totalAnswered: 0, correctAnswers: 0, streak: 0 };
  learnerProfile.stats.totalAnswered++;
  if (isCorrect) {
    learnerProfile.stats.correctAnswers++;
    learnerProfile.stats.streak++;
  } else {
    learnerProfile.stats.streak = 0;
  }
  learnerProfile.stats.lastActive = Date.now();
  
  await chrome.storage.local.set({ learnerProfile });
  return { success: true };
}

async function getCalibrationQuestions(selfAssessedLevel) {
  const targetLanguage = settings.targetLanguage || 'es';
  const bank = CALIBRATION_BANK[targetLanguage] || CALIBRATION_BANK.es;
  const difficultyOrder = ['novice', 'beginner', 'intermediate', 'upper-intermediate', 'advanced'];
  const anchorIndex = Math.max(0, difficultyOrder.indexOf(selfAssessedLevel || learnerProfile.level || 'intermediate'));
  const sortedBank = [...bank].sort((left, right) => {
    const leftIndex = difficultyOrder.indexOf(left.difficulty);
    const rightIndex = difficultyOrder.indexOf(right.difficulty);
    return Math.abs(leftIndex - anchorIndex) - Math.abs(rightIndex - anchorIndex);
  });
  const questions = sortedBank.slice(0, 10).map((question, index) => ({
    ...question,
    id: `${targetLanguage}-${index + 1}`
  }));
  return {
    questions,
    targetLanguage,
    roundSize: questions.length
  };
}

async function runCalibration(answers) {
  const correctCount = answers.filter(a => a.correct).length;
  const accuracy = correctCount / answers.length;
  
  let level;
  if (accuracy >= 0.9) level = 'advanced';
  else if (accuracy >= 0.7) level = 'intermediate';
  else if (accuracy >= 0.5) level = 'beginner';
  else level = 'novice';
  
  learnerProfile.level = level;
  
  const roundsCompleted = Math.max(1, Math.ceil((answers.length || 0) / 10));
  await chrome.storage.local.set({ 
    learnerProfile,
    calibrationData: { level, accuracy, roundsCompleted, totalQuestions: answers.length, lastCalibrated: Date.now() }
  });
  
  await chrome.storage.sync.set({ calibrationState: null });
  settings.calibrationState = null;
  
  return { level, accuracy, roundsCompleted, totalQuestions: answers.length };
}

async function toggleCurrentSite(hostname) {
  if (!hostname) {
    return { success: false, error: 'Hostname is required' };
  }

  const siteMode = settings.siteMode || 'blacklist';
  const siteList = settings.siteList || { blacklist: [], whitelist: [] };
  const currentList = siteList[siteMode] || [];
  const exists = currentList.includes(hostname);
  siteList[siteMode] = exists
    ? currentList.filter(site => site !== hostname)
    : [...currentList, hostname];

  settings.siteList = siteList;
  await chrome.storage.sync.set({ siteList });
  return {
    success: true,
    siteMode,
    hostname,
    listed: !exists,
    siteList
  };
}

function updateIconState(override = {}) {
  iconState = {
    ...iconState,
    enabled: settings.enabled !== false,
    configured: settings.apiKeysConfigured,
    paused: settings.isPaused,
    ...override
  };

  const configured = iconState.configured;
  const enabled = iconState.enabled;
  const paused = iconState.paused;
  const offline = iconState.offline ?? false;
  const processing = iconState.processing ?? false;
  
  let status = 'active';
  if (!configured) status = 'notconfigured';
  else if (processing) status = 'processing';
  else if (offline) status = 'offline';
  else if (paused) status = 'paused';
  else if (!enabled) status = 'disabled';
  
  chrome.action.setTitle({
    title: `EdgeLang - ${status}`
  });
  
  if (processing) {
    startProcessingBadgeAnimation();
    return;
  }

  stopProcessingBadgeAnimation();
  if (!configured) {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#FFA500' });
  } else if (!enabled) {
    chrome.action.setBadgeText({ text: 'off' });
    chrome.action.setBadgeBackgroundColor({ color: '#888' });
  } else if (offline) {
    chrome.action.setBadgeText({ text: '...' });
    chrome.action.setBadgeBackgroundColor({ color: '#666' });
  } else if (paused) {
    chrome.action.setBadgeText({ text: '||' });
    chrome.action.setBadgeBackgroundColor({ color: '#E6A700' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

function startProcessingBadgeAnimation() {
  if (processingBadgeInterval) return;
  processingBadgeVisible = false;
  processingBadgeInterval = setInterval(() => {
    processingBadgeVisible = !processingBadgeVisible;
    chrome.action.setBadgeText({ text: processingBadgeVisible ? '•' : '' });
    chrome.action.setBadgeBackgroundColor({ color: processingBadgeVisible ? '#2BCB7A' : '#A7F3D0' });
  }, 350);
}

function stopProcessingBadgeAnimation() {
  if (!processingBadgeInterval) return;
  clearInterval(processingBadgeInterval);
  processingBadgeInterval = null;
  processingBadgeVisible = false;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    loadSettings().then(() => {
      const newKeys = changes.apiKeys?.newValue;
      const oldKeys = changes.apiKeys?.oldValue;
      if (JSON.stringify(newKeys) !== JSON.stringify(oldKeys)) {
        initModelMesh();
      }
    });
  }
  if (area === 'local') {
    loadLearnerProfile();
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      enabled: true,
      modePreference: 'auto',
      isPaused: false,
      siteMode: 'blacklist',
      siteList: { blacklist: [], whitelist: [] }
    });
    chrome.runtime.openOptionsPage();
  }
  init();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.sync.set({ quotaExhausted: false });
  init();
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === 'toggle-extension') {
    const enabled = settings.enabled === false;
    settings.enabled = enabled;
    await chrome.storage.sync.set({ enabled });
    chrome.tabs.sendMessage(tab.id, { action: 'toggleEnabled', enabled }).catch(() => {});
    updateIconState();
  } else if (command === 'next-cue') {
    chrome.tabs.sendMessage(tab.id, { action: 'focusNextCue' }).catch(() => {});
  }
});

init();
