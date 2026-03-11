/**
 * EdgeLang Background Script
 * Handles API communication using a browser-safe multi-provider adapter.
 */

import { ModelMeshAdapter } from './modelmesh-adapter.js';
import { parseJSONArrayWithRepair } from './json-repair.js';

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
const tabBadgeState = new Map();
const DEBUG_LOG_KEY = 'debugLog';
const DEBUG_LOG_LIMIT = 200;
const SUPPORTED_LANGUAGE_CODES = [
  'ar', 'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi',
  'hu', 'id', 'it', 'ja', 'ko', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'sk',
  'sr', 'sv', 'th', 'tr', 'uk', 'vi', 'zh'
];
const LANGUAGE_LABELS = {
  ar: 'Arabic',
  bg: 'Bulgarian',
  cs: 'Czech',
  da: 'Danish',
  de: 'German',
  el: 'Greek',
  en: 'English',
  es: 'Spanish',
  fi: 'Finnish',
  fr: 'French',
  he: 'Hebrew',
  hi: 'Hindi',
  hu: 'Hungarian',
  id: 'Indonesian',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  nl: 'Dutch',
  no: 'Norwegian',
  pl: 'Polish',
  pt: 'Portuguese',
  ro: 'Romanian',
  ru: 'Russian',
  sk: 'Slovak',
  sr: 'Serbian',
  sv: 'Swedish',
  th: 'Thai',
  tr: 'Turkish',
  uk: 'Ukrainian',
  vi: 'Vietnamese',
  zh: 'Chinese'
};
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
const CALIBRATION_DIFFICULTIES = ['novice', 'beginner', 'intermediate', 'upper-intermediate', 'advanced'];

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
        audioEnabled: result.audioEnabled || false,
        ttsEngine: result.ttsEngine || 'modelmesh',
        ttsProvider: result.ttsProvider || 'auto',
        ttsVoice: result.ttsVoice || 'auto',
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
        confusionPatterns: [],
        recentInteractions: [],
        stats: { totalAnswered: 0, correctAnswers: 0, streak: 0 }
      };
      resolve();
    });
  });
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true;
});

async function handleMessage(message, sender) {
  await writeDebugLog('background', `message:${message.action}`, sanitizeForLog(message));
  switch (message.action) {
    case 'analyzePage':
      return await analyzePage(message);
      
    case 'detectLanguage':
      return await detectLanguage(message.text);
      
    case 'updateStats':
      return await updateStats(message.isCorrect);
      
    case 'updateIconState':
      updateIconState({ ...message, tabId: sender?.tab?.id });
      return { success: true };
      
    case 'getSettings':
      return settings;
      
    case 'getProfile':
      return learnerProfile;
      
    case 'runCalibration':
      return await runCalibration(message.answers);

    case 'getCalibrationQuestions':
      return await getCalibrationQuestions(message.selfAssessedLevel, message.targetLanguage, message.nativeLanguage);

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

    case 'synthesizeSpeech':
      return await synthesizeSpeech(message);

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
  const {
    text,
    textSample,
    textBlocks,
    language,
    nativeLanguage = settings.nativeLanguage || 'en',
    targetLanguage = settings.targetLanguage || 'es',
    learnerLevel,
    intensity,
    mode
  } = message;

  const nativeLabel = getLanguageLabel(nativeLanguage);
  const targetLabel = getLanguageLabel(targetLanguage);
  const sourceLabel = getLanguageLabel(mode === 'passive'
    ? (language || targetLanguage)
    : (language || nativeLanguage));
  const sampledText = Array.isArray(textBlocks) && textBlocks.length
    ? textBlocks.map((block) => `[Block ${block.index}] ${block.text}`).join('\n')
    : (textSample || text || '').substring(0, 12000);

  const instructions = mode === 'passive'
    ? `Analyze these excerpts from a ${sourceLabel} web page for a ${learnerLevel} ${nativeLabel} speaker studying ${targetLabel}. Select approximately ${intensity}% of words, idiomatic expressions, collocations, or multi-word phrases worth practicing.`
    : `Analyze these excerpts from a ${sourceLabel} web page for a ${learnerLevel} ${nativeLabel} speaker studying ${targetLabel}. Select approximately ${intensity}% of common words, idiomatic expressions, collocations, or multi-word phrases worth recalling in ${targetLabel}.`;
  const answerLanguageInstruction = mode === 'passive'
    ? `Return "displayText" in ${targetLabel}, return "translation" and "correctAnswer" in ${nativeLabel}, and return "nativeMeaning" in ${nativeLabel}.`
    : `Return "translation", "correctAnswer", and all distractors in ${targetLabel}, and return "nativeMeaning" in ${nativeLabel}.`;
  const learnerExamples = buildLearnerExamples(mode, nativeLabel, targetLabel);

  return `${instructions}

The excerpts were sampled from across the full page, not just the top section.
${answerLanguageInstruction}
Use the excerpt context, not a generic dictionary meaning.
Translate the item according to the meaning it has inside the entire fragment or sentence where it appears, not the isolated word by itself.
The translation, correctAnswer, and nativeMeaning must all match the same fragment-level sense.
If a word or expression is polysemous, choose the translation that best matches the exact excerpt where it appears.
Generate answer alternatives from the in-context meaning of the item.
Distractors must be plausible in that same context, with a similar part of speech and usage pattern, but still be clearly wrong there.
Do not use unrelated words, opposites, or generic vocabulary-list distractors that would never fit the excerpt.
If the full fragment does not make the intended meaning clear, skip that item.
Return only high-quality entries with non-empty answer choices.
Whenever possible, assign each entry to the best matching excerpt using its numeric "blockIndex".
${learnerExamples}

For each identified item, provide:
1. The word, idiomatic expression, collocation, or phrase in the original page language
2. A displayText string for what should appear on the page during practice
3. A natural in-context translation based on the full excerpt fragment where the item appears
4. The correct answer for the learner, matching the same fragment-level in-context meaning
5. A short nativeMeaning in ${nativeLabel} that explains what the item means in this exact fragment
6. Exactly 4 plausible in-context distractors with non-empty strings
7. A numeric blockIndex that points to the most relevant page excerpt
8. A short contextExcerpt copied or lightly trimmed from the matching excerpt so the meaning is anchored to the page usage

${mode === 'active'
  ? `In active mode, the page will continue showing the original page wording from "text".
Set "correctAnswer" to the best foreign-language equivalent in ${targetLabel}, and make every distractor another plausible but wrong foreign-language alternative in ${targetLabel}.`
  : `In passive mode, set "displayText" to the foreign-language equivalent that should appear on the page in ${targetLabel}.
If the original page wording is already in ${targetLabel}, "displayText" may match "text".
Set "correctAnswer" to the best answer in ${nativeLabel}, and make every distractor another plausible but wrong answer in ${nativeLabel}.`}

Return as JSON array:
[{"text":"word","displayText":"word shown on page","translation":"translation","correctAnswer":"translation","nativeMeaning":"meaning in ${nativeLabel}","distractors":["wrong1","wrong2","wrong3","wrong4"],"blockIndex":3,"contextExcerpt":"excerpt showing the usage"}]

Page excerpts:
${sampledText}

Respond only with valid JSON array, no other text.`;
  }

function buildLearnerExamples(mode, nativeLabel, targetLabel) {
  const recentInteractions = Array.isArray(learnerProfile.recentInteractions)
    ? learnerProfile.recentInteractions.slice(-20)
    : [];
  const positiveExamples = recentInteractions
    .filter((entry) => entry.outcome === 'correct' && typeof entry.text === 'string' && entry.text.trim())
    .slice(-3)
    .map((entry) => `- ${entry.text.trim()}`);
  const negativeExamples = recentInteractions
    .filter((entry) => entry.outcome === 'incorrect' && typeof entry.text === 'string' && entry.text.trim())
    .slice(-3)
    .map((entry) => `- ${entry.text.trim()}`);
  const resolvedExamples = Array.isArray(learnerProfile.resolvedItems)
    ? learnerProfile.resolvedItems.slice(-2).map((entry) => `- ${entry}`)
    : [];

  const sections = [];
  if (positiveExamples.length || resolvedExamples.length) {
    sections.push(`Positive few-shot examples from this learner (already handled well, use as a floor for difficulty, style, or topic similarity):
${[...positiveExamples, ...resolvedExamples].join('\n')}`);
  }
  if (negativeExamples.length) {
    sections.push(`Negative few-shot examples from this learner (recent misses; prioritize items similar in topic or construction, with comparable or slightly higher difficulty):
${negativeExamples.join('\n')}`);
    sections.push(`Training guidance: include several candidates that resemble the negative examples in difficulty, idiomaticity, or usage pattern so the learner gets targeted practice above their current weak spots.`);
  }

  if (!sections.length) {
    return `Few-shot guidance: no personalized examples yet, so choose broadly useful ${mode === 'passive' ? targetLabel : nativeLabel}-to-${mode === 'passive' ? nativeLabel : targetLabel} practice items around the learner's ${learnerProfile.level || 'intermediate'} level.`;
  }

  return sections.join('\n\n');
}

// Parse cues from LLM response
function parseCuesFromResponse(response, mode) {
  try {
    const cues = parseJSONArrayWithRepair(response);
    if (!cues) {
      console.warn('EdgeLang: No JSON found in response');
      writeDebugLog('background', 'parse:no-json', { mode });
      return [];
    }

    return cues
      .map((cue) => normalizeCue(cue))
      .filter((cue) =>
        cue.text &&
        cue.translation &&
        cue.correctAnswer &&
        cue.distractors.length >= 3
      )
      .slice(0, 50);
    
  } catch (error) {
    console.error('EdgeLang: Parse error:', error);
    writeDebugLog('background', 'parse:error', { message: error.message });
    return [];
  }
}

function normalizeCue(cue) {
  const text = typeof cue?.text === 'string' ? cue.text.trim() : '';
  const displayText = typeof cue?.displayText === 'string' && cue.displayText.trim()
    ? cue.displayText.trim()
    : text;
  const translation = typeof cue?.translation === 'string' ? cue.translation.trim() : '';
  const correctAnswer = typeof cue?.correctAnswer === 'string' && cue.correctAnswer.trim()
    ? cue.correctAnswer.trim()
    : translation;
  const nativeMeaning = typeof cue?.nativeMeaning === 'string' && cue.nativeMeaning.trim()
    ? cue.nativeMeaning.trim()
    : translation;
  const contextExcerpt = typeof cue?.contextExcerpt === 'string' ? cue.contextExcerpt.trim() : '';
  const distractors = Array.isArray(cue?.distractors)
    ? cue.distractors
      .map((value) => typeof value === 'string' ? value.trim() : '')
      .filter((value, index, array) =>
        value &&
        value !== correctAnswer &&
        value !== translation &&
        array.indexOf(value) === index
      )
    : [];
  const blockIndex = Number.isInteger(cue?.blockIndex)
    ? cue.blockIndex
    : Number.isFinite(Number(cue?.blockIndex))
      ? Number(cue.blockIndex)
      : null;

  return {
    text,
    displayText,
    translation,
    correctAnswer,
    nativeMeaning,
    distractors,
    blockIndex,
    contextExcerpt
  };
}

function getLanguageLabel(code) {
  return LANGUAGE_LABELS[code] || code || 'Unknown';
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
    'calibration': 'openai',
    'tts': 'openai'
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

function getDefaultTtsModel(provider) {
  const defaults = {
    'openai': 'gpt-4o-mini-tts',
    'openrouter': 'openai/gpt-4o-mini-tts'
  };
  return defaults[provider] || getDefaultModel(provider);
}

function getSelectedModel(task, provider) {
  const selection = settings.modelSelection || {};
  return selection[provider] || selection[task] || getDefaultModel(provider);
}

function getSelectedTtsModel(provider) {
  const selection = settings.modelSelection || {};
  return selection[`${provider}-tts`] || selection.tts || selection[provider] || getDefaultTtsModel(provider);
}

function selectTtsProvider() {
  if (settings.ttsProvider && settings.ttsProvider !== 'auto' && settings.apiKeys?.[settings.ttsProvider]) {
    return settings.ttsProvider;
  }
  const candidates = ['openai', 'openrouter'];
  const configured = Object.keys(settings.apiKeys || {}).filter((provider) => settings.apiKeys[provider]);
  const preferred = configured.find((provider) => candidates.includes(provider));
  return preferred || null;
}

function getTtsVoice(languageCode) {
  const voiceMap = {
    ar: 'alloy',
    de: 'alloy',
    en: 'alloy',
    es: 'nova',
    fr: 'alloy',
    he: 'nova',
    hi: 'nova',
    it: 'alloy',
    ja: 'nova',
    ko: 'nova',
    pt: 'alloy',
    ru: 'nova',
    uk: 'nova',
    zh: 'alloy'
  };
  return voiceMap[languageCode] || 'alloy';
}

function uint8ArrayToBase64(value) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < value.length; index += chunkSize) {
    const chunk = value.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
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

async function synthesizeSpeech(message) {
  const input = typeof message.text === 'string' ? message.text.trim() : '';
  const language = message.language || settings.targetLanguage || 'es';
  if (!input) {
    await writeDebugLog('background', 'tts:blocked', { reason: 'missing_text' });
    return { success: false, error: 'Missing text for pronunciation.' };
  }

  if (!settings.apiKeysConfigured || !modelMeshClient?.audioSpeechCreate) {
    await writeDebugLog('background', 'tts:blocked', {
      reason: settings.apiKeysConfigured ? 'tts_unavailable' : 'api_keys_not_configured'
    });
    return { success: false, error: 'ModelMesh TTS is not configured.' };
  }

  const provider = selectTtsProvider();
  if (!provider) {
    await writeDebugLog('background', 'tts:blocked', { reason: 'no_tts_provider' });
    return { success: false, error: 'No TTS-capable provider configured.' };
  }

  const model = getSelectedTtsModel(provider);
  const voice = (message.voice && message.voice !== 'auto')
    ? message.voice
    : (settings.ttsVoice && settings.ttsVoice !== 'auto' ? settings.ttsVoice : getTtsVoice(language));
  const format = message.format || 'mp3';

  try {
    updateIconState({ processing: true });
    await writeDebugLog('background', 'tts:start', {
      provider,
      model,
      voice,
      language,
      textLength: input.length
    });
    const result = await modelMeshClient.audioSpeechCreate({
      input,
      voice,
      format,
      provider,
      model
    });
    const base64Audio = uint8ArrayToBase64(result.audioData);
    await writeDebugLog('background', 'tts:success', {
      provider: result.provider || provider,
      model,
      voice,
      mimeType: result.mimeType,
      byteLength: result.audioData?.length || 0
    });
    return {
      success: true,
      provider: result.provider || provider,
      model,
      voice,
      format: result.format || format,
      mimeType: result.mimeType || 'audio/mpeg',
      audioBase64: base64Audio
    };
  } catch (error) {
    await writeDebugLog('background', 'tts:error', {
      provider,
      model,
      voice,
      message: error.message
    });
    return {
      success: false,
      error: error.message || 'TTS synthesis failed.'
    };
  } finally {
    updateIconState({ processing: false });
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

async function getCalibrationQuestions(selfAssessedLevel, requestedTargetLanguage, requestedNativeLanguage) {
  const targetLanguage = requestedTargetLanguage || settings.targetLanguage || 'es';
  const nativeLanguage = requestedNativeLanguage || settings.nativeLanguage || 'en';
  const calibrationState = getCalibrationStateForLanguage(targetLanguage, nativeLanguage, selfAssessedLevel);
  const bank = await generateCalibrationBank(targetLanguage, nativeLanguage, calibrationState.anchorDifficulty) || CALIBRATION_BANK[targetLanguage] || CALIBRATION_BANK.es;
  const anchorIndex = calibrationState.anchorIndex;
  const sortedBank = [...bank].sort((left, right) => {
    const leftIndex = getCalibrationDifficultyIndex(left.difficulty);
    const rightIndex = getCalibrationDifficultyIndex(right.difficulty);
    const leftScore = Math.abs(leftIndex - anchorIndex) - (leftIndex >= anchorIndex ? 0.25 : 0);
    const rightScore = Math.abs(rightIndex - anchorIndex) - (rightIndex >= anchorIndex ? 0.25 : 0);
    return leftScore - rightScore;
  });
  const questions = sortedBank.slice(0, 10).map((question, index) => ({
    ...question,
    id: `${targetLanguage}-${index + 1}`
  }));
  const roundDifficultyIndex = deriveRoundDifficultyIndex(questions, anchorIndex);
  const nextRoundDifficultyIndex = Math.min(CALIBRATION_DIFFICULTIES.length - 1, roundDifficultyIndex + 1);
  await chrome.storage.sync.set({
    calibrationState: {
      targetLanguage,
      nativeLanguage,
      roundNumber: (calibrationState.roundNumber || 0) + 1,
      lastRoundDifficultyIndex: roundDifficultyIndex,
      nextRoundDifficultyIndex,
      anchorDifficulty: CALIBRATION_DIFFICULTIES[nextRoundDifficultyIndex]
    }
  });
  settings.calibrationState = {
    targetLanguage,
    nativeLanguage,
    roundNumber: (calibrationState.roundNumber || 0) + 1,
    lastRoundDifficultyIndex: roundDifficultyIndex,
    nextRoundDifficultyIndex,
    anchorDifficulty: CALIBRATION_DIFFICULTIES[nextRoundDifficultyIndex]
  };
  await writeDebugLog('background', 'calibration:round-generated', {
    targetLanguage,
    nativeLanguage,
    anchorDifficulty: calibrationState.anchorDifficulty,
    roundDifficulty: CALIBRATION_DIFFICULTIES[roundDifficultyIndex],
    nextRoundDifficulty: CALIBRATION_DIFFICULTIES[nextRoundDifficultyIndex]
  });
  return {
    questions,
    targetLanguage,
    nativeLanguage,
    roundSize: questions.length,
    roundDifficulty: CALIBRATION_DIFFICULTIES[roundDifficultyIndex],
    nextRoundDifficulty: CALIBRATION_DIFFICULTIES[nextRoundDifficultyIndex]
  };
}

async function generateCalibrationBank(targetLanguage, nativeLanguage, selfAssessedLevel) {
  if (!modelMeshClient) {
    await writeDebugLog('background', 'calibration:bank-fallback', { reason: 'modelmesh_unavailable', targetLanguage });
    return null;
  }

  try {
    const provider = selectProvider('calibration');
    const model = getSelectedModel('calibration', provider);
    const prompt = buildCalibrationPrompt(targetLanguage, nativeLanguage, selfAssessedLevel);
    const result = await modelMeshClient.chatCompletionsCreate({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 2500,
      provider,
      model
    });
    const content = result.choices?.[0]?.message?.content || '';
    const questions = parseCalibrationQuestions(content, targetLanguage);
    if (questions.length >= 10) {
      await writeDebugLog('background', 'calibration:bank-generated', { targetLanguage, provider, model, count: questions.length });
      return questions;
    }
    await writeDebugLog('background', 'calibration:bank-fallback', { reason: 'insufficient_generated_questions', targetLanguage, count: questions.length });
  } catch (error) {
    await writeDebugLog('background', 'calibration:bank-error', { targetLanguage, message: error.message });
  }

  return null;
}

function buildCalibrationPrompt(targetLanguage, nativeLanguage, selfAssessedLevel) {
  const targetLabel = getLanguageLabel(targetLanguage);
  const nativeLabel = getLanguageLabel(nativeLanguage || settings.nativeLanguage || 'en');
  return `Create exactly 10 multiple-choice calibration questions for a ${nativeLabel} speaker studying ${targetLabel}.

Requirements:
- Mix passive recognition and active recall questions.
- Mix single words, collocations, and idiomatic expressions.
- Cover these difficulties: novice, beginner, intermediate, upper-intermediate, advanced.
- Bias slightly toward ${selfAssessedLevel || learnerProfile.level || 'intermediate'}.
- Each question must have: prompt, choices (exactly 4 non-empty strings), correctAnswer, type, difficulty, itemKind.
- For passive questions, the prompt should ask for the meaning of a ${targetLabel} word, idiomatic expression, collocation, or phrase in ${nativeLabel}.
- For active questions, the prompt should ask how to say a ${nativeLabel} word, idiomatic expression, collocation, or phrase in ${targetLabel}.
- Use ${nativeLabel} in the explanatory part of prompts unless the prompt is asking about the ${targetLabel} item itself.
- All prompts and choices must match ${targetLabel} and ${nativeLabel} correctly, not Spanish unless ${targetLabel} is Spanish and not English unless ${nativeLabel} is English.

Return only valid JSON:
[{"prompt":"...","choices":["...","...","...","..."],"correctAnswer":"...","type":"passive","difficulty":"novice","itemKind":"word"}]`;
}

function getCalibrationDifficultyIndex(difficulty) {
  return Math.max(0, CALIBRATION_DIFFICULTIES.indexOf(difficulty || 'intermediate'));
}

function getCalibrationStateForLanguage(targetLanguage, nativeLanguage, selfAssessedLevel) {
  const existing = settings.calibrationState;
  if (
    existing &&
    existing.targetLanguage === targetLanguage &&
    existing.nativeLanguage === nativeLanguage &&
    Number.isInteger(existing.nextRoundDifficultyIndex)
  ) {
    return {
      ...existing,
      anchorIndex: existing.nextRoundDifficultyIndex,
      anchorDifficulty: CALIBRATION_DIFFICULTIES[existing.nextRoundDifficultyIndex] || CALIBRATION_DIFFICULTIES[0]
    };
  }

  const fallbackDifficulty = selfAssessedLevel || learnerProfile.level || 'intermediate';
  const anchorIndex = getCalibrationDifficultyIndex(fallbackDifficulty);
  return {
    roundNumber: 0,
    anchorIndex,
    anchorDifficulty: CALIBRATION_DIFFICULTIES[anchorIndex]
  };
}

function deriveRoundDifficultyIndex(questions, fallbackIndex) {
  if (!Array.isArray(questions) || !questions.length) {
    return fallbackIndex;
  }
  const averageIndex = questions.reduce((sum, question) => sum + getCalibrationDifficultyIndex(question.difficulty), 0) / questions.length;
  return Math.max(0, Math.min(CALIBRATION_DIFFICULTIES.length - 1, Math.round(averageIndex)));
}

function parseCalibrationQuestions(response, targetLanguage) {
  try {
    const questions = parseJSONArrayWithRepair(response);
    if (!questions) return [];
    return questions
      .map((question, index) => normalizeCalibrationQuestion(question, targetLanguage, index))
      .filter((question) => question);
  } catch {
    return [];
  }
}

function normalizeCalibrationQuestion(question, targetLanguage, index) {
  const prompt = typeof question?.prompt === 'string' ? question.prompt.trim() : '';
  const correctAnswer = typeof question?.correctAnswer === 'string' ? question.correctAnswer.trim() : '';
  const type = question?.type === 'active' ? 'active' : 'passive';
  const difficulty = ['novice', 'beginner', 'intermediate', 'upper-intermediate', 'advanced'].includes(question?.difficulty)
    ? question.difficulty
    : 'intermediate';
  const itemKind = ['word', 'collocation', 'idiom'].includes(question?.itemKind)
    ? question.itemKind
    : 'word';
  const choices = Array.isArray(question?.choices)
    ? question.choices
      .map((choice) => typeof choice === 'string' ? choice.trim() : '')
      .filter((choice, choiceIndex, array) => choice && array.indexOf(choice) === choiceIndex)
      .slice(0, 4)
    : [];

  if (!prompt || !correctAnswer || choices.length !== 4 || !choices.includes(correctAnswer)) {
    return null;
  }

  return {
    id: `${targetLanguage}-${index + 1}`,
    prompt,
    choices,
    correctAnswer,
    type,
    difficulty,
    itemKind
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
  const answeredDifficultyIndex = deriveRoundDifficultyIndex(answers, getCalibrationDifficultyIndex(level));
  const nextRoundDifficultyIndex = Math.min(CALIBRATION_DIFFICULTIES.length - 1, answeredDifficultyIndex + 1);
  const passiveAnswers = answers.filter((answer) => answer.type === 'passive');
  const activeAnswers = answers.filter((answer) => answer.type === 'active');
  const idiomAnswers = answers.filter((answer) => answer.itemKind === 'idiom' || answer.itemKind === 'collocation');
  const breakdown = {
    passiveAccuracy: passiveAnswers.length ? passiveAnswers.filter((answer) => answer.correct).length / passiveAnswers.length : 0,
    activeAccuracy: activeAnswers.length ? activeAnswers.filter((answer) => answer.correct).length / activeAnswers.length : 0,
    phraseAccuracy: idiomAnswers.length ? idiomAnswers.filter((answer) => answer.correct).length / idiomAnswers.length : 0
  };
  
  const roundsCompleted = Math.max(1, Math.ceil((answers.length || 0) / 10));
  await chrome.storage.local.set({ 
    learnerProfile,
    calibrationData: {
      level,
      accuracy,
      roundsCompleted,
      totalQuestions: answers.length,
      lastCalibrated: Date.now(),
      lastRoundDifficulty: CALIBRATION_DIFFICULTIES[answeredDifficultyIndex],
      nextRoundDifficulty: CALIBRATION_DIFFICULTIES[nextRoundDifficultyIndex],
      breakdown
    }
  });
  
  const preservedState = settings.calibrationState
    ? {
        ...settings.calibrationState,
        lastRoundDifficultyIndex: answeredDifficultyIndex,
        nextRoundDifficultyIndex,
        anchorDifficulty: CALIBRATION_DIFFICULTIES[nextRoundDifficultyIndex]
      }
    : null;
  await chrome.storage.sync.set({ calibrationState: preservedState });
  settings.calibrationState = preservedState;
  await writeDebugLog('background', 'calibration:round-finished', {
    level,
    accuracy,
    answeredDifficulty: CALIBRATION_DIFFICULTIES[answeredDifficultyIndex],
    nextRoundDifficulty: CALIBRATION_DIFFICULTIES[nextRoundDifficultyIndex]
  });
  
  return {
    level,
    accuracy,
    roundsCompleted,
    totalQuestions: answers.length,
    nextRoundDifficulty: CALIBRATION_DIFFICULTIES[nextRoundDifficultyIndex],
    breakdown
  };
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
  const tabId = Number.isInteger(override.tabId) ? override.tabId : null;
  if (tabId != null) {
    const previous = tabBadgeState.get(tabId) || {};
    tabBadgeState.set(tabId, {
      ...previous,
      cueCount: override.cueCount ?? previous.cueCount ?? 0,
      completed: override.completed ?? previous.completed ?? false,
      processing: override.processing ?? previous.processing ?? false,
      stage: override.stage ?? previous.stage ?? null
    });
  }

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
  const badgeState = tabId != null ? (tabBadgeState.get(tabId) || {}) : {};
  const stage = override.stage ?? badgeState.stage ?? null;
  const cueCount = Number.isInteger(override.cueCount)
    ? override.cueCount
    : Number.isInteger(badgeState.cueCount)
      ? badgeState.cueCount
      : 0;
  const completed = override.completed ?? badgeState.completed ?? false;
  
  let status = 'active';
  if (!configured) status = 'notconfigured';
  else if (processing) status = stage || 'processing';
  else if (offline) status = 'offline';
  else if (paused) status = 'paused';
  else if (!enabled) status = 'disabled';
  
  chrome.action.setTitle({
    title: completed
      ? 'EdgeLang - complete'
      : cueCount > 0
        ? `EdgeLang - ${cueCount} cues remaining`
        : `EdgeLang - ${status}`
  });
  
  if (processing) {
    applyProcessingBadgeStage(tabId, stage || 'processing');
    return;
  }
  if (!configured) {
    chrome.action.setBadgeText({ text: '!', ...(tabId != null ? { tabId } : {}) });
    chrome.action.setBadgeBackgroundColor({ color: '#FFA500', ...(tabId != null ? { tabId } : {}) });
  } else if (!enabled) {
    chrome.action.setBadgeText({ text: 'off', ...(tabId != null ? { tabId } : {}) });
    chrome.action.setBadgeBackgroundColor({ color: '#888', ...(tabId != null ? { tabId } : {}) });
  } else if (offline) {
    chrome.action.setBadgeText({ text: '...', ...(tabId != null ? { tabId } : {}) });
    chrome.action.setBadgeBackgroundColor({ color: '#666', ...(tabId != null ? { tabId } : {}) });
  } else if (paused) {
    chrome.action.setBadgeText({ text: '||', ...(tabId != null ? { tabId } : {}) });
    chrome.action.setBadgeBackgroundColor({ color: '#E6A700', ...(tabId != null ? { tabId } : {}) });
  } else if (completed) {
    chrome.action.setBadgeText({ text: '0', ...(tabId != null ? { tabId } : {}) });
    chrome.action.setBadgeBackgroundColor({ color: '#2BCB7A', ...(tabId != null ? { tabId } : {}) });
  } else if (cueCount > 0) {
    chrome.action.setBadgeText({ text: String(Math.min(cueCount, 99)), ...(tabId != null ? { tabId } : {}) });
    chrome.action.setBadgeBackgroundColor({ color: '#2D6CDF', ...(tabId != null ? { tabId } : {}) });
  } else {
    chrome.action.setBadgeText({ text: '', ...(tabId != null ? { tabId } : {}) });
  }
}

function canShowProcessingForUrl(url) {
  return typeof url === 'string' && /^https?:/i.test(url);
}

function shouldAnimateOnPageLoad(url) {
  return canShowProcessingForUrl(url) &&
    settings.enabled !== false &&
    settings.apiKeysConfigured &&
    !settings.isPaused;
}

function applyProcessingBadgeStage(tabId = null, stage = 'loading') {
  const stageConfig = {
    loading: {
      text: '•',
      color: '#2BCB7A'
    },
    analyzing: {
      text: '•',
      color: '#E6A700'
    },
    rendering: {
      text: '•',
      color: '#D64545'
    },
    processing: {
      text: '•',
      color: '#2BCB7A'
    }
  };
  const resolvedStage = stageConfig[stage] ? stage : 'processing';
  const badge = stageConfig[resolvedStage];
  chrome.action.setBadgeText({ text: badge.text, ...(tabId != null ? { tabId } : {}) });
  chrome.action.setBadgeBackgroundColor({ color: badge.color, ...(tabId != null ? { tabId } : {}) });
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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    if (shouldAnimateOnPageLoad(tab?.url)) {
      tabBadgeState.set(tabId, { cueCount: 0, completed: false, processing: true, stage: 'loading' });
      updateIconState({ processing: true, offline: false, tabId, cueCount: 0, completed: false, stage: 'loading' });
    } else if (!canShowProcessingForUrl(tab?.url)) {
      tabBadgeState.delete(tabId);
      updateIconState({ processing: false, tabId, cueCount: 0, completed: false });
    }
  }
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  if (!shouldAnimateOnPageLoad(details.url)) return;
  tabBadgeState.set(details.tabId, { cueCount: 0, completed: false, processing: true, stage: 'loading' });
  updateIconState({ processing: true, offline: false, tabId: details.tabId, cueCount: 0, completed: false, stage: 'loading' });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabBadgeState.delete(tabId);
});

init();
