import { test, expect } from './helpers/edge-test.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENV_FILE = path.join(__dirname, '..', '.env.all');

function loadApiKeys() {
  const content = fs.readFileSync(ENV_FILE, 'utf-8');
  const keys = {};
  content.split('\n').forEach(line => {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && match[2].trim()) {
      const name = match[1].replace('_API_KEY', '').toLowerCase();
      keys[name] = match[2].trim();
    }
  });
  return keys;
}

const apiKeys = loadApiKeys();

test.describe('Real LLM API Integration Tests', () => {

  test('OpenRouter API call - chat completion', async ({ page }) => {
    if (!apiKeys.openrouter) {
      console.log('Skipping: No OpenRouter API key');
      return;
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKeys.openrouter}`,
        'HTTP-Referer': 'https://edgelang.dev',
        'X-Title': 'EdgeLang'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [{ role: 'user', content: 'Say "Hello from OpenRouter" in exactly 3 words' }],
        max_tokens: 20
      })
    });

    const data = await response.json();
    console.log('OpenRouter response status:', response.status);
    console.log('OpenRouter response:', JSON.stringify(data).substring(0, 500));
    
    if (!response.ok) {
      console.log('OpenRouter error:', data.error?.message || data);
    }
    
    expect(response.ok).toBe(true);
    expect(data.choices[0].message.content).toBeDefined();
  });

  test('OpenRouter - Russian vocabulary edge detection', async ({ page }) => {
    if (!apiKeys.openrouter) {
      console.log('Skipping: No OpenRouter API key');
      return;
    }

    const prompt = `Analyze this Russian text and identify words appropriate for an intermediate English learner studying Russian.

Return ONLY a valid JSON array with this exact structure:
[{"text": "word", "translation": "translation", "correctAnswer": "translation", "distractors": ["w1", "w2", "w3", "w4"]}]

Text to analyze: Привет мир. Россия большая страна.

Respond only with valid JSON, no other text.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKeys.openrouter}`,
        'HTTP-Referer': 'https://edgelang.dev',
        'X-Title': 'EdgeLang'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500
      })
    });

    const data = await response.json();
    console.log('Russian edge detection status:', response.status);
    
    if (!response.ok) {
      console.log('Error:', data.error?.message || data);
      return;
    }
    
    const content = data.choices[0].message.content;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    expect(jsonMatch).toBeDefined();
    
    const cues = JSON.parse(jsonMatch[0]);
    console.log('Russian edge detection result:', JSON.stringify(cues, null, 2));
    expect(cues.length).toBeGreaterThan(0);
  });

  test('OpenRouter - Spanish vocabulary edge detection', async ({ page }) => {
    if (!apiKeys.openrouter) {
      console.log('Skipping: No OpenRouter API key');
      return;
    }

    const prompt = `Analyze this Spanish text and identify words appropriate for an intermediate English learner studying Spanish.

Return ONLY a valid JSON array with this exact structure:
[{"text": "word", "translation": "translation", "correctAnswer": "translation", "distractors": ["w1", "w2", "w3", "w4"]}]

Text to analyze: Hola mundo. España es un país hermoso.

Respond only with valid JSON, no other text.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKeys.openrouter}`,
        'HTTP-Referer': 'https://edgelang.dev',
        'X-Title': 'EdgeLang'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500
      })
    });

    const data = await response.json();
    console.log('Spanish edge detection status:', response.status);
    
    if (!response.ok) {
      console.log('Error:', data.error?.message || data);
      return;
    }
    
    const content = data.choices[0].message.content;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    expect(jsonMatch).toBeDefined();
    
    const cues = JSON.parse(jsonMatch[0]);
    console.log('Spanish edge detection result:', JSON.stringify(cues, null, 2));
    expect(cues.length).toBeGreaterThan(0);
  });

  test('OpenRouter - Language detection', async ({ page }) => {
    if (!apiKeys.openrouter) {
      console.log('Skipping: No OpenRouter API key');
      return;
    }

    const testTexts = [
      { text: 'Добро пожаловать на CNN', expected: 'russian' },
      { text: 'Bienvenido a CNN', expected: 'spanish' },
      { text: 'Bienvenue sur CNN', expected: 'french' }
    ];

    for (const tc of testTexts) {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKeys.openrouter}`,
          'HTTP-Referer': 'https://edgelang.dev',
          'X-Title': 'EdgeLang'
        },
        body: JSON.stringify({
          model: 'google/gemini-2.0-flash-001',
          messages: [{ role: 'user', content: `What language is this? Just answer with the language name in English: "${tc.text}"` }],
          max_tokens: 10
        })
      });

      const data = await response.json();
      if (response.ok) {
        const detected = data.choices[0].message.content.trim().toLowerCase();
        console.log(`Language detection: "${tc.text.substring(0, 15)}..." -> ${detected}`);
      } else {
        console.log('Language detection error:', data.error?.message);
      }
    }
  });

  test('OpenRouter - Multiple choice distractor generation', async ({ page }) => {
    if (!apiKeys.openrouter) {
      console.log('Skipping: No OpenRouter API key');
      return;
    }

    const prompt = `Generate 4 plausible wrong translations for the Russian word "привет" (hello).
    
Return ONLY a valid JSON array of strings:
["wrong1", "wrong2", "wrong3", "wrong4"]

Respond only with the JSON array, no other text.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKeys.openrouter}`,
        'HTTP-Referer': 'https://edgelang.dev',
        'X-Title': 'EdgeLang'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100
      })
    });

    const data = await response.json();
    console.log('Distractor generation status:', response.status);
    
    if (!response.ok) {
      console.log('Error:', data.error?.message || data);
      return;
    }
    
    const content = data.choices[0].message.content;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    expect(jsonMatch).toBeDefined();
    
    const distractors = JSON.parse(jsonMatch[0]);
    console.log('Generated distractors:', distractors);
    expect(distractors).toHaveLength(4);
  });

  test('API Keys available check', async ({ page }) => {
    console.log('Available API keys:', Object.keys(apiKeys));
    expect(Object.keys(apiKeys).length).toBeGreaterThan(0);
  });

});
