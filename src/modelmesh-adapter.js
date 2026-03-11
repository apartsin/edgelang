/**
 * EdgeLang ModelMesh Adapter
 * Lightweight ModelMesh integration for Chrome extension
 * Supports: OpenAI, Anthropic, Google, Groq, OpenRouter
 */

const ModelMeshAdapter = {
  clients: {},
  providers: {},
  providerPool: [],
  
  // Initialize with API keys
  init(apiKeys) {
    this.providers = {};
    this.providerPool = [];
    
    const providerConfigs = [
      { name: 'openai', key: apiKeys.openai, endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-3.5-turbo' },
      { name: 'anthropic', key: apiKeys.anthropic, endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-3-haiku-20240307' },
      { name: 'google', key: apiKeys.google, endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', model: 'gemini-1.5-flash' },
      { name: 'groq', key: apiKeys.groq, endpoint: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.1-70b-versatile' },
      { name: 'openrouter', key: apiKeys.openrouter, endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'google/gemini-2.0-flash-001' }
    ];
    
    for (const config of providerConfigs) {
      if (config.key) {
        this.providers[config.name] = { ...config, apiKey: config.key, active: true };
        this.providerPool.push(config.name);
      }
    }
    
    console.log('ModelMeshAdapter: Initialized with providers:', this.providerPool);
    return this;
  },
  
  // Get next available provider from pool (round-robin)
  getNextProvider() {
    if (this.providerPool.length === 0) return null;
    const provider = this.providerPool[0];
    this.providerPool.push(this.providerPool.shift());
    return provider;
  },
  
  // Create chat completion with provider pool routing
  async chatCompletionsCreate(params) {
    const { messages, temperature = 0.3, max_tokens = 1000, provider: preferredProvider, model } = params;
    const prompt = messages[0]?.content || '';
    const triedProviders = new Set();
    const providerQueue = preferredProvider
      ? [preferredProvider, ...this.providerPool.filter(name => name !== preferredProvider)]
      : [...this.providerPool];

    for (const providerName of providerQueue) {
      if (!providerName || triedProviders.has(providerName)) continue;
      triedProviders.add(providerName);
      
      const provider = this.providers[providerName];
      if (!provider.active) continue;
      
      try {
        console.log(`ModelMeshAdapter: Trying provider ${providerName}`);
        const response = await this.callProvider(providerName, prompt, temperature, max_tokens, model);
        
        return {
          choices: [{
            message: {
              role: 'assistant',
              content: response
            }
          }],
          provider: providerName
        };
      } catch (error) {
        console.warn(`ModelMeshAdapter: ${providerName} failed:`, error.message);
        
        // Disable provider on quota/error
        if (error.status === 429 || error.status >= 500 || error.message.includes('quota')) {
          provider.active = false;
          this.providerPool = this.providerPool.filter(p => p !== providerName);
          console.log(`ModelMeshAdapter: Disabled ${providerName} due to ${error.status || 'error'}`);
        }
      }
    }
    
    throw new Error('All ModelMesh providers failed');
  },

  async audioSpeechCreate(params) {
    const {
      input,
      voice = 'alloy',
      format = 'mp3',
      provider: preferredProvider,
      model
    } = params;
    const triedProviders = new Set();
    const providerQueue = preferredProvider
      ? [preferredProvider, ...this.providerPool.filter(name => name !== preferredProvider)]
      : [...this.providerPool];

    for (const providerName of providerQueue) {
      if (!providerName || triedProviders.has(providerName)) continue;
      triedProviders.add(providerName);

      const provider = this.providers[providerName];
      if (!provider?.active) continue;

      try {
        const result = await this.callSpeechProvider(providerName, input, voice, format, model);
        return {
          ...result,
          provider: providerName
        };
      } catch (error) {
        console.warn(`ModelMeshAdapter TTS: ${providerName} failed:`, error.message);
        if (error.status === 429 || error.status >= 500 || error.message.includes('quota')) {
          provider.active = false;
          this.providerPool = this.providerPool.filter(p => p !== providerName);
        }
      }
    }

    throw new Error('All ModelMesh TTS providers failed');
  },
  
  // Call specific provider
  async callProvider(provider, prompt, temperature, maxTokens, modelOverride) {
    const config = this.providers[provider];
    if (!config) throw new Error(`Provider ${provider} not configured`);
    const model = modelOverride || config.model;
    
    switch (provider) {
      case 'openai':
      case 'groq':
        return this.callOpenAI(provider, config.apiKey, prompt, temperature, maxTokens, model);
      case 'anthropic':
        return this.callAnthropic(config.apiKey, prompt, temperature, maxTokens, model);
      case 'google':
        return this.callGoogle(config.apiKey, prompt, temperature, maxTokens, model);
      case 'openrouter':
        return this.callOpenRouter(config.apiKey, prompt, temperature, maxTokens, model);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  },

  async callSpeechProvider(provider, input, voice, format, modelOverride) {
    const config = this.providers[provider];
    if (!config) throw new Error(`Provider ${provider} not configured`);
    const model = modelOverride || config.ttsModel || 'tts-1';

    switch (provider) {
      case 'openai':
        return this.callOpenAITTS('https://api.openai.com/v1/audio/speech', config.apiKey, input, voice, format, model, {});
      case 'openrouter':
        return this.callOpenAITTS(
          'https://openrouter.ai/api/v1/audio/speech',
          config.apiKey,
          input,
          voice,
          format,
          model,
          {
            'HTTP-Referer': 'https://edgelang.dev',
            'X-Title': 'EdgeLang'
          }
        );
      default:
        throw new Error(`Provider ${provider} does not support TTS in this extension`);
    }
  },
  
  async callOpenAI(provider, apiKey, prompt, temperature, maxTokens, model) {
    const endpoints = {
      openai: 'https://api.openai.com/v1/chat/completions',
      groq: 'https://api.groq.com/openai/v1/chat/completions'
    };
    
    const response = await fetch(endpoints[provider], {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens
      })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  },
  
  async callAnthropic(apiKey, prompt, temperature, maxTokens, model) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens
      })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data.content[0]?.text || '';
  },
  
  async callGoogle(apiKey, prompt, temperature, maxTokens, model) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data.candidates[0]?.content?.parts[0]?.text || '';
  },

  async callOpenRouter(apiKey, prompt, temperature, maxTokens, model) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://edgelang.dev',
        'X-Title': 'EdgeLang'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  },

  async callOpenAITTS(endpoint, apiKey, input, voice, format, model, extraHeaders = {}) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...extraHeaders
      },
      body: JSON.stringify({
        model,
        voice,
        input,
        format
      })
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const error = await response.json();
        message = error.error?.message || message;
      } catch {}
      throw new Error(message);
    }

    const audioData = new Uint8Array(await response.arrayBuffer());
    return {
      audioData,
      mimeType: format === 'wav' ? 'audio/wav' : 'audio/mpeg',
      format
    };
  },
  
  // Get provider status
  getStatus() {
    return Object.entries(this.providers).map(([name, config]) => ({
      name,
      active: config.active,
      configured: true
    }));
  },
  
  // Reset all providers (e.g., on new day)
  reset() {
    for (const provider of Object.values(this.providers)) {
      provider.active = true;
    }
  }
};

// Export for use in background script
if (typeof window !== 'undefined') {
  window.ModelMeshAdapter = ModelMeshAdapter;
} else if (typeof self !== 'undefined') {
  self.ModelMeshAdapter = ModelMeshAdapter;
}

export { ModelMeshAdapter };
