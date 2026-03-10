/**
 * EdgeLang Background Script
 * Handles API communication using ModelMeshAdapter for AI routing
 */

import { ModelMeshAdapter } from './modelmesh-adapter.js';

// State
let settings = {};
let learnerProfile = {};
let modelMeshAdapter = null;

// Initialize
async function init() {
  await loadSettings();
  await loadLearnerProfile();
  initModelMesh();
  updateIconState();
}

// Initialize ModelMesh adapter
function initModelMesh() {
  const apiKeys = settings.apiKeys || {};
  
  if (Object.keys(apiKeys).length === 0) {
    console.log('EdgeLang: No API keys configured');
    return;
  }
  
  // Use imported ModelMesh adapter
  modelMeshAdapter = ModelMeshAdapter.init(apiKeys);
  console.log('EdgeLang: ModelMeshAdapter initialized');
}

// Load settings
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(null, (result) => {
      settings = result;
      settings.apiKeysConfigured = Object.keys(result.apiKeys || {}).length > 0;
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
  switch (message.action) {
    case 'analyzePage':
      return await analyzePage(message);
      
    case 'detectLanguage':
      return await detectLanguage(message.text);
      
    case 'updateStats':
      return await updateStats(message.isCorrect);
      
    case 'updateIconState':
      return { success: true };
      
    case 'getSettings':
      return settings;
      
    case 'getProfile':
      return learnerProfile;
      
    case 'runCalibration':
      return await runCalibration(message.answers);
      
    case 'reinitModelMesh':
      initModelMesh();
      return { success: true };
      
    default:
      return { error: 'Unknown action' };
  }
}

// Analyze page for learnable items
async function analyzePage(message) {
  if (!settings.apiKeysConfigured) {
    return { error: 'API keys not configured' };
  }

  try {
    const prompt = buildAnalysisPrompt(message);
    
    let response;
    
    if (modelMeshAdapter) {
      // Use ModelMesh adapter
      const result = await modelMeshAdapter.chatCompletionsCreate({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 4000
      });
      response = result.choices[0]?.message?.content || '';
    } else {
      // Fallback to manual implementation
      response = await callManualAPI(prompt);
    }

    const cues = parseCuesFromResponse(response, message.mode);
    return { cues: cues };
    
  } catch (error) {
    console.error('EdgeLang: Analysis error:', error);
    return { error: error.message };
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
  const requestBody = buildProviderRequest(provider, model, prompt, 4000);

  const response = await fetch(getProviderEndpoint(provider), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  return parseProviderResponse(provider, data);
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
    return [];
  }
}

// Detect language
async function detectLanguage(text) {
  const langPatterns = {
    'es': /[áéíóúñ¿¡]/i,
    'fr': /[àâçéèêëîïôûùüÿœæ]/i,
    'de': /[äöüß]/i,
    'it': /[àèéìíîòóùú]/i,
    'pt': /[ãõç]/i,
    'zh': /[\u4e00-\u9fff]/,
    'ja': /[\u3040-\u309f\u30a0-\u30ff]/,
    'ko': /[\uac00-\ud7af]/
  };

  for (const [lang, pattern] of Object.entries(langPatterns)) {
    if (pattern.test(text.substring(0, 500))) {
      return { language: lang };
    }
  }

  if (settings.apiKeysConfigured && modelMeshAdapter) {
    try {
      const prompt = `What language is this? Just answer with the language code (en, es, fr, de, it, pt, zh, ja, ko):\n\n${text.substring(0, 500)}`;
      
      const result = await modelMeshAdapter.chatCompletionsCreate({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 10
      });

      const langMatch = result.choices[0]?.message?.content?.match(/\b(en|es|fr|de|it|pt|zh|ja|ko)\b/i);
      if (langMatch) {
        return { language: langMatch[1].toLowerCase() };
      }
    } catch (e) {
      console.warn('EdgeLang: Language detection failed:', e);
    }
  }

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
    'groq': 'llama-3.1-70b-versatile'
  };
  return defaults[provider] || 'gpt-3.5-turbo';
}

function buildProviderRequest(provider, model, prompt, maxTokens) {
  const base = { max_tokens: maxTokens };
  
  switch (provider) {
    case 'openai':
    case 'groq':
      return { ...base, model, messages: [{ role: 'user', content: prompt }], temperature: 0.3 };
    case 'anthropic':
      return { ...base, model, messages: [{ role: 'user', content: prompt }] };
    default:
      return { ...base, model, prompt };
  }
}

function getProviderEndpoint(provider) {
  const endpoints = {
    'openai': 'https://api.openai.com/v1/chat/completions',
    'anthropic': 'https://api.anthropic.com/v1/messages',
    'google': 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    'groq': 'https://api.groq.com/openai/v1/chat/completions'
  };
  return endpoints[provider];
}

function parseProviderResponse(provider, data) {
  switch (provider) {
    case 'openai':
    case 'groq':
      return data.choices?.[0]?.message?.content || '';
    case 'anthropic':
      return data.content?.[0]?.text || '';
    default:
      return '';
  }
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

async function runCalibration(answers) {
  const correctCount = answers.filter(a => a.correct).length;
  const accuracy = correctCount / answers.length;
  
  let level;
  if (accuracy >= 0.9) level = 'advanced';
  else if (accuracy >= 0.7) level = 'intermediate';
  else if (accuracy >= 0.5) level = 'beginner';
  else level = 'novice';
  
  learnerProfile.level = level;
  
  await chrome.storage.local.set({ 
    learnerProfile,
    calibrationData: { level, accuracy, lastCalibrated: Date.now() }
  });
  
  return { level, accuracy };
}

function updateIconState() {
  const configured = settings.apiKeysConfigured;
  const enabled = settings.enabled !== false;
  
  let status = 'active';
  if (!configured) status = 'notconfigured';
  else if (!enabled) status = 'disabled';
  
  chrome.action.setTitle({
    title: `EdgeLang - ${status}`
  });
  
  if (!configured) {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#FFA500' });
  } else if (!enabled) {
    chrome.action.setBadgeText({ text: 'off' });
    chrome.action.setBadgeBackgroundColor({ color: '#888' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
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

chrome.runtime.onInstalled.addListener(() => {
  init();
});

chrome.runtime.onStartup.addListener(() => {
  init();
});

init();
