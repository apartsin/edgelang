/**
 * EdgeLang ModelMesh Adapter
 * Lightweight ModelMesh integration for Chrome extension
 * Supports: OpenAI, Anthropic, Google, Groq
 */

const ModelMeshAdapter = {
  clients: {},
  providers: {},
  
  // Initialize with API keys
  init(apiKeys) {
    this.providers = {};
    
    if (apiKeys.openai) {
      this.providers.openai = { apiKey: apiKeys.openai, active: true };
    }
    if (apiKeys.anthropic) {
      this.providers.anthropic = { apiKey: apiKeys.anthropic, active: true };
    }
    if (apiKeys.google) {
      this.providers.google = { apiKey: apiKeys.google, active: true };
    }
    if (apiKeys.groq) {
      this.providers.groq = { apiKey: apiKeys.groq, active: true };
    }
    
    console.log('ModelMeshAdapter: Initialized with providers:', Object.keys(this.providers));
    return this;
  },
  
  // Create chat completion
  async chatCompletionsCreate(params) {
    const { messages, temperature = 0.3, max_tokens = 1000 } = params;
    const prompt = messages[0]?.content || '';
    
    // Try each provider in order
    const providerOrder = ['openai', 'groq', 'anthropic', 'google'];
    
    for (const provider of providerOrder) {
      if (!this.providers[provider] || !this.providers[provider].active) continue;
      
      try {
        const response = await this.callProvider(provider, prompt, temperature, max_tokens);
        return {
          choices: [{
            message: {
              role: 'assistant',
              content: response
            }
          }]
        };
      } catch (error) {
        console.warn(`ModelMeshAdapter: ${provider} failed:`, error.message);
        
        // Mark provider as inactive if quota/error
        if (error.status === 429 || error.status >= 500) {
          this.providers[provider].active = false;
        }
        // Continue to next provider
      }
    }
    
    throw new Error('All providers failed');
  },
  
  // Call specific provider
  async callProvider(provider, prompt, temperature, maxTokens) {
    const config = this.providers[provider];
    if (!config) throw new Error(`Provider ${provider} not configured`);
    
    switch (provider) {
      case 'openai':
      case 'groq':
        return this.callOpenAI(provider, config.apiKey, prompt, temperature, maxTokens);
      case 'anthropic':
        return this.callAnthropic(config.apiKey, prompt, temperature, maxTokens);
      case 'google':
        return this.callGoogle(config.apiKey, prompt, temperature, maxTokens);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  },
  
  async callOpenAI(provider, apiKey, prompt, temperature, maxTokens) {
    const endpoints = {
      openai: 'https://api.openai.com/v1/chat/completions',
      groq: 'https://api.groq.com/openai/v1/chat/completions'
    };
    
    const models = {
      openai: 'gpt-3.5-turbo',
      groq: 'llama-3.1-70b-versatile'
    };
    
    const response = await fetch(endpoints[provider], {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: models[provider],
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
  
  async callAnthropic(apiKey, prompt, temperature, maxTokens) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
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
  
  async callGoogle(apiKey, prompt, temperature, maxTokens) {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey, {
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
