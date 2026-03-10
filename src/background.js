/**
 * EdgeLang Background Script
 * Handles API communication, ModelMesh integration, and extension state
 */

// State
let settings = {};
let learnerProfile = {};
let isProcessing = false;

// Initialize
async function init() {
  await loadSettings();
  await loadLearnerProfile();
  updateIconState();
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
  return true; // Keep channel open for async response
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
    
    const response = await callModelMesh({
      prompt: prompt,
      task: 'edge-detection',
      max_tokens: 4000
    });

    // Parse response to extract cues
    const cues = parseCuesFromResponse(response, message.mode);
    
    return { cues: cues };
  } catch (error) {
    console.error('EdgeLang: Analysis error:', error);
    return { error: error.message };
  }
}

// Build prompt for LLM analysis
function buildAnalysisPrompt(message) {
  const { text, language, learnerLevel, intensity, mode, resolvedItems } = message;
  
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
    // Try to extract JSON from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('EdgeLang: No JSON found in response');
      return [];
    }
    
    const cues = JSON.parse(jsonMatch[0]);
    
    // Validate and clean cues
    return cues.filter(cue => 
      cue.text && 
      cue.translation && 
      cue.correctAnswer && 
      cue.distractors?.length >= 3
    ).slice(0, 50); // Limit to 50 cues
    
  } catch (error) {
    console.error('EdgeLang: Parse error:', error);
    return [];
  }
}

// Detect language using simple heuristics and LLM
async function detectLanguage(text) {
  // Quick heuristic detection first
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

  // Use LLM for ambiguous cases
  if (settings.apiKeysConfigured) {
    try {
      const prompt = `What language is this text? Just answer with the language code (e.g., "en", "es", "fr"):\n\n${text.substring(0, 500)}`;
      
      const response = await callModelMesh({
        prompt: prompt,
        task: 'classification'
      });

      const langMatch = response.match(/\b(en|es|fr|de|it|pt|zh|ja|ko|ru|ar)\b/i);
      if (langMatch) {
        return { language: langMatch[1].toLowerCase() };
      }
    } catch (e) {
      console.warn('EdgeLang: Language detection failed:', e);
    }
  }

  return { language: 'en' };
}

// Call ModelMesh for AI requests
async function callModelMesh(request) {
  const { prompt, task, max_tokens = 1000 } = request;

  // Select provider based on task
  const provider = selectProvider(task);
  const apiKey = settings.apiKeys?.[provider];
  
  if (!apiKey) {
    throw new Error(`No API key for ${provider}`);
  }

  const model = settings.modelSelection?.[task] || getDefaultModel(provider);

  // Build request based on provider
  const requestBody = buildProviderRequest(provider, model, prompt, max_tokens);

  try {
    const response = await fetch(getProviderEndpoint(provider), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      if (response.status === 429) {
        // Quota exceeded, try next provider
        return await callModelMeshWithFallback(request, provider);
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return parseProviderResponse(provider, data);

  } catch (error) {
    // Try fallback providers
    return await callModelMeshWithFallback(request, provider);
  }
}

// Call with fallback providers
async function callModelMeshWithFallback(originalRequest, failedProvider) {
  const providers = Object.keys(settings.apiKeys || {}).filter(p => p !== failedProvider);
  
  for (const provider of providers) {
    try {
      const apiKey = settings.apiKeys[provider];
      const model = settings.modelSelection?.[originalRequest.task] || getDefaultModel(provider);
      
      const requestBody = buildProviderRequest(provider, model, originalRequest.prompt, originalRequest.max_tokens);
      
      const response = await fetch(getProviderEndpoint(provider), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const data = await response.json();
        return parseProviderResponse(provider, data);
      }
    } catch (e) {
      continue;
    }
  }

  throw new Error('All providers failed');
}

// Select provider based on task
function selectProvider(task) {
  const taskProviderMap = {
    'edge-detection': 'openai',
    'distractor-generation': 'openai',
    'explanation': 'anthropic',
    'classification': 'openai',
    'calibration': 'openai'
  };
  
  const preferred = taskProviderMap[task] || 'openai';
  
  // Check if preferred provider has API key
  if (settings.apiKeys?.[preferred]) {
    return preferred;
  }
  
  // Fall back to first available
  return Object.keys(settings.apiKeys || {})[0] || 'openai';
}

// Get default model for provider
function getDefaultModel(provider) {
  const defaults = {
    'openai': 'gpt-3.5-turbo',
    'anthropic': 'claude-3-haiku-20240307',
    'google': 'gemini-1.5-flash',
    'groq': 'llama-3.1-70b-versatile'
  };
  return defaults[provider] || 'gpt-3.5-turbo';
}

// Build provider-specific request
function buildProviderRequest(provider, model, prompt, maxTokens) {
  const base = { max_tokens: maxTokens };
  
  switch (provider) {
    case 'openai':
    case 'groq':
      return {
        ...base,
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      };
      
    case 'anthropic':
      return {
        ...base,
        model: model,
        messages: [{ role: 'user', content: prompt }]
      };
      
    case 'google':
      return {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: maxTokens
        }
      };
      
    default:
      return { ...base, model: model, prompt: prompt };
  }
}

// Get provider endpoint
function getProviderEndpoint(provider) {
  const endpoints = {
    'openai': 'https://api.openai.com/v1/chat/completions',
    'anthropic': 'https://api.anthropic.com/v1/messages',
    'google': 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    'groq': 'https://api.groq.com/openai/v1/chat/completions'
  };
  return endpoints[provider];
}

// Parse provider response
function parseProviderResponse(provider, data) {
  switch (provider) {
    case 'openai':
    case 'groq':
      return data.choices?.[0]?.message?.content || '';
      
    case 'anthropic':
      return data.content?.[0]?.text || '';
      
    case 'google':
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
    default:
      return '';
  }
}

// Update statistics
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

// Run calibration
async function runCalibration(answers) {
  // Analyze answers to estimate level
  const correctCount = answers.filter(a => a.correct).length;
  const total = answers.length;
  const accuracy = correctCount / total;
  
  // Simple level estimation based on accuracy
  let level;
  if (accuracy >= 0.9) level = 'advanced';
  else if (accuracy >= 0.7) level = 'intermediate';
  else if (accuracy >= 0.5) level = 'beginner';
  else level = 'novice';
  
  learnerProfile.level = level;
  
  await chrome.storage.local.set({ 
    learnerProfile,
    calibrationData: { 
      level,
      accuracy,
      lastCalibrated: Date.now()
    }
  });
  
  return { level, accuracy };
}

// Update icon state
function updateIconState() {
  const configured = settings.apiKeysConfigured;
  const enabled = settings.enabled !== false;
  
  let iconPath = 'icons/';
  if (!configured) {
    iconPath += 'icon-gray'; // Not configured
  } else if (!enabled) {
    iconPath += 'icon-off'; // Disabled
  } else {
    iconPath += 'icon'; // Active
  }
  
  chrome.action.setIcon({
    path: {
      '16': `${iconPath}16.png`,
      '48': `${iconPath}48.png`,
      '128': `${iconPath}128.png`
    }
  });
  
  // Update badge
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

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    loadSettings();
  }
  if (area === 'local') {
    loadLearnerProfile();
  }
});

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  init();
});

// Initialize on startup
chrome.runtime.onStartup.addListener(() => {
  init();
});

// Start
init();
