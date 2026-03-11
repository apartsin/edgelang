import { test, expect } from './helpers/edge-test.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.join(__dirname, '..', 'src');

test.describe('Document Alignment', () => {
  test('background implements onboarding and calibration handlers from the docs', async () => {
    const backgroundSource = fs.readFileSync(path.join(SRC_DIR, 'background.js'), 'utf-8');

    expect(backgroundSource).toContain("case 'getCalibrationQuestions'");
    expect(backgroundSource).toContain("case 'setModePreference'");
    expect(backgroundSource).toContain("case 'setPaused'");
    expect(backgroundSource).toContain("case 'toggleCurrentSite'");
    expect(backgroundSource).toContain("case 'validateApiKeys'");
    expect(backgroundSource).toContain("case 'synthesizeSpeech'");
    expect(backgroundSource).toContain("case 'getDebugLog'");
    expect(backgroundSource).toContain("case 'debugLog'");
    expect(backgroundSource).toContain('applyProcessingBadgeStage');
    expect(backgroundSource).toContain("status = stage || 'processing'");
    expect(backgroundSource).toContain("chrome.runtime.openOptionsPage()");
    expect(backgroundSource).toContain("details.reason === 'install'");
    expect(backgroundSource).toContain("chrome.commands.onCommand.addListener");
    expect(backgroundSource).toContain("chrome.tabs.onUpdated.addListener");
    expect(backgroundSource).toContain("chrome.webNavigation.onBeforeNavigate.addListener");
    expect(backgroundSource).toContain("quotaExhausted");
    expect(backgroundSource).toContain('getSelectedModel');
    expect(backgroundSource).toContain('getSelectedTtsModel');
    expect(backgroundSource).toContain('selectTtsProvider');
    expect(backgroundSource).toContain("loading: {");
    expect(backgroundSource).toContain("analyzing: {");
    expect(backgroundSource).toContain("rendering: {");
    expect(backgroundSource).toContain("chrome.action.setBadgeText({ text: String(Math.min(cueCount, 99))");
    expect(backgroundSource).toContain("chrome.action.setBadgeText({ text: '0'");
    expect(backgroundSource).toContain('Positive few-shot examples from this learner');
    expect(backgroundSource).toContain('Negative few-shot examples from this learner');
    expect(backgroundSource).toContain('similar in topic or construction, with comparable or slightly higher difficulty');
    expect(backgroundSource).toContain('Use the excerpt context, not a generic dictionary meaning.');
    expect(backgroundSource).toContain('meaning it has inside the entire fragment or sentence where it appears');
    expect(backgroundSource).toContain('fragment-level sense');
    expect(backgroundSource).toContain('Set "correctAnswer" to the best foreign-language equivalent');
    expect(backgroundSource).toContain('In passive mode, set "displayText" to the foreign-language equivalent');
    expect(backgroundSource).toContain('contextExcerpt');
    expect(backgroundSource).toContain('nativeMeaning');
    expect(backgroundSource).toContain('nextRoundDifficultyIndex');
    expect(backgroundSource).toContain('calibration:round-generated');
    expect(backgroundSource).toContain('itemKind');
    expect(backgroundSource).toContain('ttsProvider');
  });

  test('options script exports combined data and clears both storage areas', async () => {
    const optionsSource = fs.readFileSync(path.join(SRC_DIR, 'options.js'), 'utf-8');
    const contentSource = fs.readFileSync(path.join(SRC_DIR, 'content.js'), 'utf-8');
    expect(optionsSource).toContain('sync: syncData');
    expect(optionsSource).toContain('local: localData');
    expect(optionsSource).toContain('chrome.storage.sync.clear');
    expect(optionsSource).toContain('highlightColor');
    expect(contentSource).toContain('recentInteractions');
    expect(contentSource).toContain('confusionPatterns');
    expect(contentSource).toContain("updateIconState(true, 'analyzing')");
    expect(contentSource).toContain("updateIconState(true, 'rendering')");
  });

  test('options page exposes a broad native and target language list including English, Russian, and Hebrew', async ({ page }) => {
    await page.addInitScript(() => {
      window.chrome = {
        storage: {
          sync: {
            get: (_keys, cb) => cb({ nativeLanguage: 'en', targetLanguage: 'ru', siteList: { blacklist: [], whitelist: [] } }),
            set: (_values, cb) => cb && cb(),
            clear: (cb) => cb && cb()
          },
          local: {
            get: (_keys, cb) => cb({ learnerProfile: { resolvedItems: [], vocabulary: {}, stats: {} } }),
            clear: (cb) => cb && cb(),
            set: (_values, cb) => cb && cb(),
            remove: (_keys, cb) => cb && cb()
          }
        },
        runtime: {
          sendMessage: async () => ({ success: true })
        },
        tabs: {
          query: async () => [],
          sendMessage: async () => ({ success: true })
        }
      };
      window.confirm = () => true;
    });

    await page.goto(pathToFileURL(path.join(SRC_DIR, 'options.html')).href);

    const nativeOptions = await page.locator('#nativeLanguage option').allTextContents();
    const targetOptions = await page.locator('#targetLanguage option').allTextContents();

    expect(nativeOptions).toContain('English');
    expect(nativeOptions).toContain('Russian');
    expect(nativeOptions).toContain('Hebrew');
    expect(targetOptions).toContain('English');
    expect(targetOptions).toContain('Russian');
    expect(targetOptions).toContain('Hebrew');
    expect(nativeOptions.length).toBe(targetOptions.length);
    expect(nativeOptions.length).toBeGreaterThan(20);
  });

  test('legacy adapter keeps OpenRouter and apiKey wiring consistent', async () => {
    const originalFetch = global.fetch;
    const moduleUrl = pathToFileURL(path.join(SRC_DIR, 'modelmesh-adapter.js')).href;
    const { ModelMeshAdapter } = await import(moduleUrl);

    let lastRequest = null;
    global.fetch = async (url, options) => {
      lastRequest = { url, options };
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'hello' } }]
        })
      };
    };

    try {
      ModelMeshAdapter.init({ openrouter: 'test-openrouter-key' });
      const result = await ModelMeshAdapter.callProvider('openrouter', 'Prompt', 0.2, 64);

      expect(result).toBe('hello');
      expect(ModelMeshAdapter.providers.openrouter.apiKey).toBe('test-openrouter-key');
      expect(lastRequest.url).toContain('openrouter.ai/api/v1/chat/completions');
      expect(lastRequest.options.headers.Authorization).toBe('Bearer test-openrouter-key');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('popup exposes documented quick controls', async ({ page }) => {
    await page.addInitScript(() => {
      const syncStore = {
        enabled: true,
        apiKeys: { openai: 'sk-test' },
        modePreference: 'auto',
        isPaused: false,
        siteMode: 'blacklist',
        siteList: { blacklist: [], whitelist: [] }
      };
      const localStore = {
        learnerProfile: {
          level: 'intermediate',
          resolvedItems: ['hola'],
          stats: { totalAnswered: 4, correctAnswers: 3, streak: 2 }
        }
      };

      window.__messages = [];
      window.chrome = {
        storage: {
          sync: {
            get: (_keys, cb) => cb(syncStore),
            set: (values, cb) => {
              Object.assign(syncStore, values);
              cb && cb();
            }
          },
          local: {
            get: (_keys, cb) => cb(localStore)
          }
        },
        runtime: {
          sendMessage: async (message) => {
            window.__messages.push(message);
            if (message.action === 'toggleCurrentSite') {
              syncStore.siteList.blacklist = [message.hostname];
              return {
                success: true,
                siteMode: 'blacklist',
                siteList: syncStore.siteList
              };
            }
            return { success: true };
          },
          openOptionsPage: async () => {
            window.__openedOptions = true;
          }
        },
        tabs: {
          query: (queryInfo, cb) => {
            const tabs = [{ id: 1, url: 'https://example.com/article' }];
            if (typeof cb === 'function') {
              cb(tabs);
              return;
            }
            return Promise.resolve(tabs);
          },
          sendMessage: async () => ({ pageLanguage: 'es', currentMode: 'passive', cueCount: 4, processing: true, blockerReason: 'no_cues_from_analysis' })
        }
      };
    });

    await page.goto(pathToFileURL(path.join(SRC_DIR, 'popup.html')).href);

    await expect(page.locator('#toggleSite')).toContainText('Add to blacklist');
    await expect(page.locator('#pauseToggle')).toBeAttached();
    await expect(page.locator('#toggleSite')).toContainText('Add to blacklist');
    await expect(page.locator('#pageMeta')).toContainText('Page: es');
    await expect(page.locator('#pageMeta')).toContainText('Processing...');
    await expect(page.locator('#pageMeta')).toContainText('Reason: no_cues_from_analysis');
    await expect(page.locator('#statusText')).toContainText('Processing...');

    await page.locator('#autoBtn').click();
    await page.locator('#activeBtn').click();
    await page.evaluate(() => {
      const input = document.getElementById('pauseToggle');
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.locator('#toggleSite').click();

    const actions = await page.evaluate(() => window.__messages.map(msg => msg.action));
    expect(actions).toContain('setModePreference');
    expect(actions).toContain('setPaused');
    expect(actions).toContain('toggleCurrentSite');
  });

  test('options page runs a 10-question calibration round', async ({ page }) => {
    await page.addInitScript(() => {
      const syncStore = {
        nativeLanguage: 'en',
        targetLanguage: 'es',
        apiKeys: { openai: 'sk-test' },
        visualCueStyle: 'underline',
        highlightColor: '#f2a7a7',
        questionIntensity: 5,
        recallIntensity: 10,
        multipleChoiceCount: 5,
        positiveFeedback: true,
        negativeFeedback: true,
        audioEnabled: false,
        ttsEngine: 'browser',
        ttsProvider: 'openrouter',
        ttsVoice: 'nova',
        siteMode: 'blacklist',
        siteList: { blacklist: [], whitelist: [] }
      };
      const localStore = {
        calibrationData: {
          level: 'beginner',
          accuracy: 0.6
        },
        learnerProfile: {
          resolvedItems: ['hola', 'gracias'],
          vocabulary: {
            hola: { attempts: 3, correct: 2 },
            gracias: { attempts: 2, correct: 2 }
          },
          stats: {
            totalAnswered: 5,
            correctAnswers: 4,
            streak: 2,
            lastActive: Date.UTC(2026, 2, 10)
          }
        }
      };

      const questions = Array.from({ length: 10 }, (_, index) => ({
        id: `q-${index + 1}`,
        prompt: `Question ${index + 1}`,
        choices: ['A', 'B', 'C', 'D'],
        correctAnswer: 'A',
        type: index % 2 === 0 ? 'passive' : 'active',
        difficulty: index < 4 ? 'beginner' : 'intermediate'
      }));

      window.chrome = {
        storage: {
          sync: {
            get: (_keys, cb) => cb(syncStore),
            set: (values, cb) => {
              Object.assign(syncStore, values);
              cb && cb();
            }
          },
          local: {
            get: (_keys, cb) => cb(localStore),
            set: (values, cb) => {
              Object.assign(localStore, values);
              cb && cb();
            },
            clear: (cb) => {
              Object.keys(localStore).forEach(key => delete localStore[key]);
              cb && cb();
            },
            remove: (keys, cb) => {
              const entries = Array.isArray(keys) ? keys : [keys];
              entries.forEach(key => delete localStore[key]);
              cb && cb();
            }
          }
        },
        runtime: {
          sendMessage: async (message) => {
            window.__messages = window.__messages || [];
            window.__messages.push(message);
            if (message.action === 'validateApiKeys') {
              return {
                success: true,
                results: Object.keys(message.apiKeys).map((provider) => ({
                  provider,
                  model: message.modelSelection[provider],
                  valid: true,
                  message: 'Validated'
                }))
              };
            }
            if (message.action === 'getCalibrationQuestions') {
              window.__calibrationRequest = message;
              return {
                questions,
                targetLanguage: message.targetLanguage,
                nativeLanguage: message.nativeLanguage,
                roundSize: 10,
                roundDifficulty: 'intermediate',
                nextRoundDifficulty: 'upper-intermediate'
              };
            }
            if (message.action === 'runCalibration') {
              window.__submittedCalibrationAnswers = message.answers;
              localStore.calibrationData = {
                level: 'intermediate',
                accuracy: 0.8,
                nextRoundDifficulty: 'upper-intermediate'
              };
              return {
                level: 'intermediate',
                accuracy: 0.8,
                totalQuestions: message.answers.length,
                nextRoundDifficulty: 'upper-intermediate'
              };
            }
            return { success: true };
          }
        },
        tabs: {
          query: async () => [],
          sendMessage: async () => ({ success: true })
        }
      };
      window.confirm = () => true;
    });

    await page.goto(pathToFileURL(path.join(SRC_DIR, 'options.html')).href);

    await expect(page.locator('#groqKey')).toBeVisible();
    await expect(page.locator('#openrouterKey')).toBeVisible();
    await expect(page.locator('#validateKeys')).toBeVisible();
    await expect(page.locator('#model-openai')).toBeVisible();
    await expect(page.locator('#model-openrouter')).toBeVisible();
    await expect(page.locator('#highlightColor')).toBeVisible();
    await expect(page.locator('#highlightColor')).toHaveValue('#f2a7a7');
    await expect(page.locator('#exportVocabulary')).toBeVisible();
    await expect(page.locator('#autoStartCalibration')).toBeAttached();
    await expect(page.locator('#autoDetectLanguage')).toBeAttached();
    await expect(page.locator('#ttsEngine')).toHaveValue('browser');
    await expect(page.locator('#ttsProvider')).toHaveValue('openrouter');
    await expect(page.locator('#ttsVoice')).toHaveValue('nova');
    await expect(page.locator('#model-openai-tts')).toBeVisible();
    await expect(page.locator('#model-openrouter-tts')).toBeVisible();
    await expect(page.locator('#statsMastered')).toContainText('2');
    await expect(page.locator('#statsAccuracy')).toContainText('80%');
    await expect(page.locator('#statsWords')).toContainText('2');

    await page.selectOption('#model-openai', 'gpt-4.1-mini');
    await page.locator('#validateKeys').click();
    await expect(page.locator('#validationResults')).toContainText('Validated');
    const validationMessage = await page.evaluate(() => window.__messages.find((message) => message.action === 'validateApiKeys'));
    expect(validationMessage.modelSelection.openai).toBe('gpt-4.1-mini');
    expect(validationMessage.apiKeys.openai).toBe('sk-test');

    await page.selectOption('#targetLanguage', 'ru');
    await page.selectOption('#nativeLanguage', 'he');
    await page.locator('#startCalibration').click();
    await expect(page.locator('#calibrationProgress')).toContainText('Question 1 of 10');
    const calibrationRequest = await page.evaluate(() => window.__calibrationRequest);
    expect(calibrationRequest.targetLanguage).toBe('ru');
    expect(calibrationRequest.nativeLanguage).toBe('he');

    for (let index = 0; index < 10; index += 1) {
      await page.locator('.calibration-choice').first().click();
    }

    await expect(page.locator('#calibrationResult')).toBeVisible();
    await expect(page.locator('#calibrationLevel')).toContainText('Intermediate');
    await expect(page.locator('#calibrationSummary')).toContainText('Next round target: Upper-intermediate');
    const submittedCount = await page.evaluate(() => window.__submittedCalibrationAnswers.length);
    expect(submittedCount).toBe(10);
  });

  test('options page resumes saved calibration progress only when language matches', async ({ page }) => {
    await page.addInitScript(() => {
      const syncStore = {
        nativeLanguage: 'en',
        targetLanguage: 'ru',
        apiKeys: { openai: 'sk-test' },
        siteMode: 'blacklist',
        siteList: { blacklist: [], whitelist: [] }
      };
      const localStore = {
        calibrationProgress: {
          targetLanguage: 'es',
          nativeLanguage: 'en',
          selfAssessedLevel: 'intermediate',
          currentIndex: 3,
          answers: [{}, {}, {}],
          questions: Array.from({ length: 10 }, (_, index) => ({
            id: `q-${index + 1}`,
            prompt: `Question ${index + 1}`,
            choices: ['A', 'B', 'C', 'D'],
            correctAnswer: 'A',
            type: 'passive',
            difficulty: 'intermediate'
          }))
        }
      };

      window.chrome = {
        storage: {
          sync: {
            get: (_keys, cb) => cb(syncStore),
            set: (_values, cb) => cb && cb()
          },
          local: {
            get: (_keys, cb) => cb(localStore),
            set: (_values, cb) => cb && cb(),
            remove: (_keys, cb) => cb && cb(),
            clear: (cb) => cb && cb()
          }
        },
        runtime: {
          sendMessage: async () => ({ success: true })
        },
        tabs: {
          query: async () => [],
          sendMessage: async () => ({ success: true })
        }
      };
      window.confirm = () => true;
    });

    await page.goto(pathToFileURL(path.join(SRC_DIR, 'options.html')).href);
    await expect(page.locator('#startCalibration')).toContainText('Start Calibration');
  });

  test('options page saves, reloads, and removes comprehensive settings through the real UI', async ({ page }) => {
    await page.addInitScript(() => {
      const defaultSyncStore = {
        nativeLanguage: 'en',
        targetLanguage: 'es',
        apiKeys: { openai: 'sk-initial' },
        modelSelection: {
          openai: 'gpt-4.1-mini',
          anthropic: 'claude-3-5-haiku-latest',
          google: 'gemini-1.5-flash',
          groq: 'llama-3.1-70b-versatile',
          openrouter: 'google/gemini-2.0-flash-001',
          'openai-tts': 'gpt-4o-mini-tts',
          'openrouter-tts': 'openai/gpt-4o-mini-tts'
        },
        visualCueStyle: 'underline',
        highlightColor: '#f2a7a7',
        questionIntensity: 5,
        recallIntensity: 10,
        multipleChoiceCount: 4,
        positiveFeedback: true,
        negativeFeedback: true,
        audioEnabled: false,
        ttsEngine: 'browser',
        ttsProvider: 'auto',
        ttsVoice: 'auto',
        autoStartCalibration: true,
        autoDetectLanguage: true,
        siteMode: 'blacklist',
        siteList: { blacklist: ['old.example'], whitelist: [] }
      };
      const defaultLocalStore = {
        learnerProfile: {
          resolvedItems: ['hola'],
          vocabulary: { hola: { attempts: 1, correct: 1 } },
          stats: { totalAnswered: 1, correctAnswers: 1, streak: 1, lastActive: Date.UTC(2026, 2, 10) }
        }
      };

      const syncStore = JSON.parse(localStorage.getItem('__edgelang_test_sync__') || JSON.stringify(defaultSyncStore));
      const localStore = JSON.parse(localStorage.getItem('__edgelang_test_local__') || JSON.stringify(defaultLocalStore));
      const persistStores = () => {
        localStorage.setItem('__edgelang_test_sync__', JSON.stringify(syncStore));
        localStorage.setItem('__edgelang_test_local__', JSON.stringify(localStore));
      };
      persistStores();

      window.__syncStore = syncStore;
      window.__tabMessages = [];
      window.chrome = {
        storage: {
          sync: {
            get: (_keys, cb) => cb(syncStore),
            set: (values, cb) => {
              Object.assign(syncStore, values);
              persistStores();
              cb && cb();
            },
            clear: (cb) => {
              Object.keys(syncStore).forEach((key) => delete syncStore[key]);
              persistStores();
              cb && cb();
            }
          },
          local: {
            get: (_keys, cb) => cb(localStore),
            set: (values, cb) => {
              Object.assign(localStore, values);
              persistStores();
              cb && cb();
            },
            clear: (cb) => cb && cb(),
            remove: (_keys, cb) => cb && cb()
          }
        },
        runtime: {
          sendMessage: async (message) => {
            if (message.action === 'validateApiKeys') {
              return {
                success: true,
                results: Object.keys(message.apiKeys).map((provider) => ({
                  provider,
                  model: message.modelSelection[provider],
                  valid: true,
                  message: 'Validated'
                }))
              };
            }
            return { success: true };
          }
        },
        tabs: {
          query: async () => [{ id: 1, url: 'https://example.com/story' }],
          sendMessage: async (tabId, message) => {
            window.__tabMessages.push({ tabId, message });
            return { success: true };
          }
        }
      };
      window.confirm = () => true;
    });

    const optionsUrl = pathToFileURL(path.join(SRC_DIR, 'options.html')).href;
    await page.goto(optionsUrl);

    await page.selectOption('#nativeLanguage', 'he');
    await page.selectOption('#targetLanguage', 'ru');
    await page.fill('#openaiKey', 'sk-updated');
    await page.fill('#anthropicKey', 'sk-ant-updated');
    await page.fill('#googleKey', 'g-api-key');
    await page.fill('#groqKey', 'gsk_updated');
    await page.fill('#openrouterKey', 'sk-or-updated');
    await page.selectOption('#model-openai', 'gpt-4.1');
    await page.selectOption('#model-anthropic', 'claude-3-5-sonnet-latest');
    await page.selectOption('#model-google', 'gemini-2.0-flash');
    await page.selectOption('#model-groq', 'llama-3.3-70b-versatile');
    await page.selectOption('#model-openrouter', 'openai/gpt-4o-mini');
    await page.locator('#cueStyle [data-value="background"]').click();
    await page.locator('#highlightColor').fill('#c8f299');
    await page.locator('#questionIntensity').fill('12');
    await page.locator('#recallIntensity').fill('22');
    await page.selectOption('#multipleChoiceCount', '6');
    await page.evaluate(() => {
      document.getElementById('positiveFeedback').checked = false;
      document.getElementById('negativeFeedback').checked = false;
      document.getElementById('audioEnabled').checked = true;
      document.getElementById('autoStartCalibration').checked = false;
      document.getElementById('autoDetectLanguage').checked = false;
    });
    await page.selectOption('#ttsEngine', 'modelmesh');
    await page.selectOption('#ttsProvider', 'openai');
    await page.selectOption('#model-openai-tts', 'gpt-4o-audio-preview');
    await page.selectOption('#model-openrouter-tts', 'openai/gpt-4o-audio-preview');
    await page.selectOption('#ttsVoice', 'alloy');
    await page.locator('#siteMode [data-value="whitelist"]').click();
    await page.fill('#newSite', 'wikipedia.org');
    await page.locator('#addSite').click();
    await expect(page.locator('#siteListHint')).toContainText('wikipedia.org');

    await page.locator('#saveBtn').click();
    await expect(page.locator('#notification')).toContainText('Settings saved!');

    const savedStore = await page.evaluate(() => window.__syncStore);
    expect(savedStore.nativeLanguage).toBe('he');
    expect(savedStore.targetLanguage).toBe('ru');
    expect(savedStore.apiKeys.openai).toBe('sk-updated');
    expect(savedStore.apiKeys.openrouter).toBe('sk-or-updated');
    expect(savedStore.modelSelection.openai).toBe('gpt-4.1');
    expect(savedStore.modelSelection.anthropic).toBe('claude-3-5-sonnet-latest');
    expect(savedStore.modelSelection.google).toBe('gemini-2.0-flash');
    expect(savedStore.modelSelection.groq).toBe('llama-3.3-70b-versatile');
    expect(savedStore.modelSelection.openrouter).toBe('openai/gpt-4o-mini');
    expect(savedStore.modelSelection['openai-tts']).toBe('gpt-4o-audio-preview');
    expect(savedStore.modelSelection['openrouter-tts']).toBe('openai/gpt-4o-audio-preview');
    expect(savedStore.visualCueStyle).toBe('background');
    expect(savedStore.highlightColor).toBe('#c8f299');
    expect(savedStore.questionIntensity).toBe(12);
    expect(savedStore.recallIntensity).toBe(22);
    expect(savedStore.multipleChoiceCount).toBe(6);
    expect(savedStore.positiveFeedback).toBe(false);
    expect(savedStore.negativeFeedback).toBe(false);
    expect(savedStore.audioEnabled).toBe(true);
    expect(savedStore.ttsEngine).toBe('modelmesh');
    expect(savedStore.ttsProvider).toBe('openai');
    expect(savedStore.ttsVoice).toBe('alloy');
    expect(savedStore.autoStartCalibration).toBe(false);
    expect(savedStore.autoDetectLanguage).toBe(false);
    expect(savedStore.siteMode).toBe('whitelist');
    expect(savedStore.siteList.whitelist).toContain('wikipedia.org');
    const tabMessages = await page.evaluate(() => window.__tabMessages);
    expect(tabMessages.some((entry) => entry.message.action === 'settingsUpdated')).toBe(true);

    await page.reload();
    await expect(page.locator('#nativeLanguage')).toHaveValue('he');
    await expect(page.locator('#targetLanguage')).toHaveValue('ru');
    await expect(page.locator('#model-openai')).toHaveValue('gpt-4.1');
    await expect(page.locator('#highlightColor')).toHaveValue('#c8f299');
    await expect(page.locator('#multipleChoiceCount')).toHaveValue('6');
    await expect(page.locator('#ttsEngine')).toHaveValue('modelmesh');
    await expect(page.locator('#ttsProvider')).toHaveValue('openai');
    await expect(page.locator('#ttsVoice')).toHaveValue('alloy');
    await expect(page.locator('#siteListHint')).toContainText('wikipedia.org');

    await page.locator('#siteListHint button').click();
    await expect(page.locator('#siteListHint')).not.toContainText('wikipedia.org');
    const updatedStore = await page.evaluate(() => window.__syncStore);
    expect(updatedStore.siteList.whitelist).not.toContain('wikipedia.org');
  });

  test('content script highlights only the matched phrase and keeps the popup usable', async ({ page }) => {
    await page.addInitScript(() => {
      const syncStore = {
        enabled: true,
        nativeLanguage: 'en',
        targetLanguage: 'es',
        apiKeys: { openai: 'sk-test' },
        visualCueStyle: 'underline',
        highlightColor: '#f2a7a7',
        questionIntensity: 5,
        recallIntensity: 10,
        multipleChoiceCount: 4,
        positiveFeedback: true,
        negativeFeedback: true,
        audioEnabled: true,
        siteMode: 'blacklist',
        siteList: { blacklist: [], whitelist: [] },
        autoDetectLanguage: true,
        modePreference: 'auto',
        isPaused: false
      };
      const localStore = {
        learnerProfile: {
          level: 'intermediate',
          vocabulary: {},
          resolvedItems: [],
          confusionPatterns: [],
          stats: { totalAnswered: 0, correctAnswers: 0, streak: 0 }
        }
      };

      const runtimeListeners = [];
      window.chrome = {
        storage: {
          sync: {
            get: (_keys, cb) => cb(syncStore),
            set: (values, cb) => {
              Object.assign(syncStore, values);
              cb && cb();
            }
          },
          local: {
            get: (_keys, cb) => cb(localStore),
            set: (values, cb) => {
              Object.assign(localStore, values);
              cb && cb();
            }
          },
          onChanged: {
            addListener: () => {}
          }
        },
        runtime: {
          sendMessage: (message, cb) => {
            window.__messages = window.__messages || [];
            window.__messages.push(message);
            let response = { success: true };
            if (message.action === 'detectLanguage') {
              response = { language: 'es' };
            } else if (message.action === 'analyzePage') {
              response = {
                cues: [
                  {
                    text: 'Hola',
                    translation: 'hello',
                    correctAnswer: 'hello',
                    distractors: ['goodbye', 'please', 'thanks'],
                    contextExcerpt: 'Hola mundo desde EdgeLang.'
                  }
                ]
              };
            } else if (message.action === 'synthesizeSpeech') {
              response = {
                success: true,
                provider: 'openai',
                model: 'gpt-4o-mini-tts',
                mimeType: 'audio/mpeg',
                audioBase64: 'SUQz'
              };
            }
            if (typeof cb === 'function') {
              cb(response);
              return;
            }
            return Promise.resolve(response);
          },
          onMessage: {
            addListener: (listener) => runtimeListeners.push(listener)
          }
        }
      };
      window.__audioPlayCount = 0;
      window.Audio = function(src) {
        this.src = src;
        this.addEventListener = () => {};
        this.play = () => {
          window.__audioPlayCount += 1;
          return Promise.resolve();
        };
      };
      window.speechSynthesis = {
        cancel: () => {},
        speak: (utterance) => {
          window.__lastSpokenText = utterance.text;
        }
      };
      window.SpeechSynthesisUtterance = function(text) {
        this.text = text;
        this.lang = '';
      };
    });

    await page.goto('data:text/html,<html lang="es"><head><style>button, button span { color: white !important; -webkit-text-fill-color: white !important; }</style></head><body><p id="copy">Hola mundo desde EdgeLang. Este texto adicional existe para superar el umbral minimo de analisis y comprobar que solo se resalta la palabra correcta en lugar de toda la frase.</p></body></html>');
    await page.addScriptTag({ path: path.join(SRC_DIR, 'content.js') });

    await expect(page.locator('.edgelang-cue')).toHaveCount(1);
    await expect(page.locator('#copy')).toContainText('Hola mundo desde EdgeLang');
    await expect(page.locator('.edgelang-cue')).toContainText('Hola');
    await expect(page.locator('.edgelang-cue')).not.toContainText('mundo');
    const cueColor = await page.locator('.edgelang-cue').evaluate((element) =>
      getComputedStyle(element).getPropertyValue('--edgelang-cue-color').trim()
    );
    expect(cueColor).toBe('#f2a7a7');

    await page.locator('.edgelang-cue').hover();
    await expect(page.locator('.edgelang-popup')).toBeVisible();
    await expect(page.locator('.edgelang-context-preview')).toContainText('Hola mundo desde EdgeLang');
    await expect(page.locator('.edgelang-context-preview mark')).toContainText('Hola');
    await page.locator('.edgelang-popup').hover();
    await page.waitForTimeout(200);
    await expect(page.locator('.edgelang-popup')).toBeVisible();
    const popupThemeColor = await page.locator('.edgelang-popup').evaluate((element) =>
      getComputedStyle(element).getPropertyValue('--edgelang-cue-color').trim()
    );
    expect(popupThemeColor).toBe('');
    const optionTextColor = await page.locator('.edgelang-option-text').first().evaluate((element) =>
      getComputedStyle(element).color
    );
    expect(optionTextColor).not.toBe('rgb(255, 255, 255)');
    await expect(page.locator('.edgelang-audio-btn')).toBeVisible();
    await page.locator('.edgelang-audio-btn').click();
    await expect(page.locator('.edgelang-popup')).toBeVisible();
    const synthMessage = await page.evaluate(() =>
      window.__messages.find((message) => message.action === 'synthesizeSpeech')
    );
    expect(synthMessage.text).toBe('Hola');
    expect(await page.evaluate(() => window.__audioPlayCount)).toBe(1);
    expect(await page.evaluate(() => window.__lastSpokenText || null)).toBeNull();
    await page.locator('.edgelang-option[data-answer="hello"]').click();
    await expect(page.locator('.edgelang-feedback')).toBeVisible();
    await expect(page.locator('.edgelang-examples-btn')).toBeVisible();
    await page.locator('.edgelang-examples-btn').click();
    await expect(page.locator('.edgelang-example')).toBeVisible();
    await expect(page.locator('.edgelang-example')).toContainText('Meaning in English');
    await expect(page.locator('.edgelang-example')).toContainText('hello');
    await expect(page.locator('.edgelang-example')).toContainText('Usage on this page');
    await expect(page.locator('.edgelang-example')).toContainText('Hola mundo desde EdgeLang');
    await expect(page.locator('.edgelang-example mark')).toContainText('Hola');
    await expect(page.locator('.edgelang-cue')).toHaveCount(0);
    await page.locator('body').hover();
    await page.waitForTimeout(250);
    await expect(page.locator('.edgelang-popup')).toBeVisible();

    const debugEvents = await page.evaluate(() => window.__edgelangDebug.map((entry) => entry.event));
    expect(debugEvents).toContain('render:complete');
    expect(debugEvents).toContain('popup:answer');
    expect(debugEvents).toContain('popup:examples-shown');
    expect(debugEvents).toContain('audio:play-modelmesh');
    const iconUpdates = await page.evaluate(() =>
      window.__messages.filter((message) => message.action === 'updateIconState')
    );
    expect(iconUpdates.some((message) => message.cueCount >= 1)).toBe(true);
    expect(iconUpdates.some((message) => message.completed === true)).toBe(true);
  });

  test('passive mode shows a foreign word on the page and native-language options in the popup', async ({ page }) => {
    await page.addInitScript(() => {
      const syncStore = {
        enabled: true,
        nativeLanguage: 'en',
        targetLanguage: 'es',
        apiKeys: { openai: 'sk-test' },
        visualCueStyle: 'underline',
        highlightColor: '#f2a7a7',
        questionIntensity: 5,
        recallIntensity: 10,
        multipleChoiceCount: 4,
        positiveFeedback: true,
        negativeFeedback: true,
        audioEnabled: false,
        siteMode: 'blacklist',
        siteList: { blacklist: [], whitelist: [] },
        autoDetectLanguage: false,
        modePreference: 'passive',
        isPaused: false
      };
      const localStore = {
        learnerProfile: {
          level: 'intermediate',
          vocabulary: {},
          resolvedItems: [],
          confusionPatterns: [],
          recentInteractions: [],
          stats: { totalAnswered: 0, correctAnswers: 0, streak: 0 }
        }
      };

      window.chrome = {
        storage: {
          sync: {
            get: (_keys, cb) => cb(syncStore),
            set: (values, cb) => {
              Object.assign(syncStore, values);
              cb && cb();
            }
          },
          local: {
            get: (_keys, cb) => cb(localStore),
            set: (values, cb) => {
              Object.assign(localStore, values);
              cb && cb();
            }
          },
          onChanged: {
            addListener: () => {}
          }
        },
        runtime: {
          sendMessage: (message, cb) => {
            let response = { success: true };
            if (message.action === 'analyzePage') {
              response = {
                cues: [
                  {
                    text: 'market',
                    displayText: 'mercado',
                    translation: 'market',
                    correctAnswer: 'market',
                    nativeMeaning: 'market',
                    distractors: ['store', 'industry', 'economy'],
                    contextExcerpt: 'The market reacted quickly to the news.'
                  }
                ]
              };
            }
            if (typeof cb === 'function') {
              cb(response);
              return;
            }
            return Promise.resolve(response);
          },
          onMessage: {
            addListener: () => {}
          }
        }
      };
    });

    await page.goto('data:text/html,<html lang="en"><body><p id="copy">The market reacted quickly to the news, and the rest of this sentence exists to make sure the analyzer has enough text to process the page successfully.</p></body></html>');
    await page.addScriptTag({ path: path.join(SRC_DIR, 'content.js') });

    await expect(page.locator('.edgelang-cue')).toHaveCount(1);
    await expect(page.locator('.edgelang-cue')).toContainText('mercado');
    await expect(page.locator('#copy')).toContainText('The mercado reacted quickly to the news');

    await page.locator('.edgelang-cue').hover();
    await expect(page.locator('.edgelang-word')).toContainText('mercado');
    await expect(page.locator('.edgelang-popup-subtitle')).toContainText('Choose the best English meaning');
    const optionTexts = await page.locator('.edgelang-option-text').allTextContents();
    expect(optionTexts).toEqual(expect.arrayContaining(['market', 'store', 'industry', 'economy']));
  });

  test('active mode keeps the native page wording and quizzes with foreign-language options', async ({ page }) => {
    await page.addInitScript(() => {
      const syncStore = {
        enabled: true,
        nativeLanguage: 'en',
        targetLanguage: 'es',
        apiKeys: { openai: 'sk-test' },
        visualCueStyle: 'underline',
        highlightColor: '#f2a7a7',
        questionIntensity: 5,
        recallIntensity: 10,
        multipleChoiceCount: 4,
        positiveFeedback: true,
        negativeFeedback: true,
        audioEnabled: false,
        siteMode: 'blacklist',
        siteList: { blacklist: [], whitelist: [] },
        autoDetectLanguage: false,
        modePreference: 'active',
        isPaused: false
      };
      const localStore = {
        learnerProfile: {
          level: 'intermediate',
          vocabulary: {},
          resolvedItems: [],
          confusionPatterns: [],
          recentInteractions: [],
          stats: { totalAnswered: 0, correctAnswers: 0, streak: 0 }
        }
      };

      window.chrome = {
        storage: {
          sync: {
            get: (_keys, cb) => cb(syncStore),
            set: (values, cb) => {
              Object.assign(syncStore, values);
              cb && cb();
            }
          },
          local: {
            get: (_keys, cb) => cb(localStore),
            set: (values, cb) => {
              Object.assign(localStore, values);
              cb && cb();
            }
          },
          onChanged: {
            addListener: () => {}
          }
        },
        runtime: {
          sendMessage: (message, cb) => {
            let response = { success: true };
            if (message.action === 'analyzePage') {
              response = {
                cues: [
                  {
                    text: 'market',
                    translation: 'mercado',
                    correctAnswer: 'mercado',
                    nativeMeaning: 'market',
                    distractors: ['tienda', 'industria', 'economia'],
                    contextExcerpt: 'The market reacted quickly to the news.'
                  }
                ]
              };
            }
            if (typeof cb === 'function') {
              cb(response);
              return;
            }
            return Promise.resolve(response);
          },
          onMessage: {
            addListener: () => {}
          }
        }
      };
    });

    await page.goto('data:text/html,<html lang="en"><body><p id="copy">The market reacted quickly to the news, and the rest of this sentence exists to make sure the analyzer has enough text to process the page successfully.</p></body></html>');
    await page.addScriptTag({ path: path.join(SRC_DIR, 'content.js') });

    await expect(page.locator('.edgelang-cue')).toHaveCount(1);
    await expect(page.locator('.edgelang-cue')).toContainText('market');
    await expect(page.locator('#copy')).toContainText('The market reacted quickly to the news');

    await page.locator('.edgelang-cue').hover();
    await expect(page.locator('.edgelang-popup')).toBeVisible();
    await expect(page.locator('.edgelang-word')).toContainText('market');
    await expect(page.locator('.edgelang-popup-subtitle')).toContainText('Choose the best Spanish equivalent');
    await expect(page.locator('.edgelang-option')).toHaveCount(4);
    const optionTexts = await page.locator('.edgelang-option-text').allTextContents();
    expect(optionTexts).toEqual(expect.arrayContaining(['mercado', 'tienda', 'industria', 'economia']));
    await page.locator('.edgelang-option[data-answer="mercado"]').click();
    await expect(page.locator('.edgelang-feedback')).toContainText('Correct foreign equivalent');
    await expect(page.locator('.edgelang-cue')).toHaveCount(0);
    await expect(page.locator('#copy')).toContainText('The market reacted quickly to the news');
  });

  test('content script exposes blocker reasons when startup is blocked', async ({ page }) => {
    await page.addInitScript(() => {
      const syncStore = {
        enabled: true,
        nativeLanguage: 'en',
        targetLanguage: 'es',
        apiKeys: {},
        visualCueStyle: 'underline',
        questionIntensity: 5,
        recallIntensity: 10,
        multipleChoiceCount: 4,
        positiveFeedback: true,
        negativeFeedback: true,
        audioEnabled: false,
        siteMode: 'blacklist',
        siteList: { blacklist: [], whitelist: [] },
        autoDetectLanguage: true,
        modePreference: 'auto',
        isPaused: false
      };
      const runtimeListeners = [];
      window.chrome = {
        storage: {
          sync: {
            get: (_keys, cb) => cb(syncStore)
          },
          local: {
            get: (_keys, cb) => cb({ learnerProfile: { level: 'intermediate', resolvedItems: [], vocabulary: {}, stats: {} } })
          }
        },
        runtime: {
          sendMessage: (message, cb) => {
            if (typeof cb === 'function') cb({ success: true });
            return Promise.resolve({ success: true });
          },
          onMessage: {
            addListener: (listener) => runtimeListeners.push(listener)
          }
        }
      };
      window.__runtimeListeners = runtimeListeners;
    });

    await page.goto('data:text/html,<html><body><p>Sample page text with enough words for the extension to inspect if it were configured correctly.</p></body></html>');
    await page.addScriptTag({ path: path.join(SRC_DIR, 'content.js') });

    const state = await page.evaluate(() => {
      let response = null;
      for (const listener of window.__runtimeListeners) {
        listener({ action: 'getPageState' }, null, (payload) => {
          response = payload;
        });
      }
      return response;
    });

    expect(state.blockerReason).toBe('api_keys_not_configured');
    expect(state.debugTail.some((entry) => entry.event === 'init:blocked')).toBe(true);
  });

  test('content script reprocesses cues after target language changes', async ({ page }) => {
    await page.addInitScript(() => {
      const syncStore = {
        enabled: true,
        nativeLanguage: 'en',
        targetLanguage: 'es',
        apiKeys: { openai: 'sk-test' },
        visualCueStyle: 'underline',
        highlightColor: '#f2a7a7',
        questionIntensity: 5,
        recallIntensity: 10,
        multipleChoiceCount: 4,
        positiveFeedback: true,
        negativeFeedback: true,
        audioEnabled: false,
        siteMode: 'blacklist',
        siteList: { blacklist: [], whitelist: [] },
        autoDetectLanguage: true,
        modePreference: 'auto',
        isPaused: false
      };
      const localStore = {
        learnerProfile: {
          level: 'intermediate',
          vocabulary: {},
          resolvedItems: [],
          confusionPatterns: [],
          stats: { totalAnswered: 0, correctAnswers: 0, streak: 0 }
        }
      };
      const runtimeListeners = [];

      window.chrome = {
        storage: {
          sync: {
            get: (_keys, cb) => cb(syncStore),
            set: (values, cb) => {
              Object.assign(syncStore, values);
              cb && cb();
            }
          },
          local: {
            get: (_keys, cb) => cb(localStore),
            set: (_values, cb) => cb && cb()
          }
        },
        runtime: {
          sendMessage: (message, cb) => {
            let response = { success: true };
            if (message.action === 'detectLanguage') {
              response = { language: 'en' };
            } else if (message.action === 'analyzePage') {
              const answer = syncStore.targetLanguage === 'ru' ? 'dom' : 'casa';
              response = {
                cues: [{
                  text: 'house',
                  translation: answer,
                  correctAnswer: answer,
                  nativeMeaning: 'house',
                  distractors: ['hogar', 'vivienda', 'apartamento']
                }]
              };
            }
            if (typeof cb === 'function') {
              cb(response);
              return;
            }
            return Promise.resolve(response);
          },
          onMessage: {
            addListener: (listener) => runtimeListeners.push(listener)
          }
        }
      };

      window.__runtimeListeners = runtimeListeners;
      window.__syncStore = syncStore;
    });

    await page.goto('data:text/html,<html lang="en"><body><p>house stories and enough supporting text to make sure the analyzer runs on this document and can be reprocessed after a settings change without staying stuck on the previous language.</p></body></html>');
    await page.addScriptTag({ path: path.join(SRC_DIR, 'content.js') });

    await expect(page.locator('.edgelang-cue')).toContainText('house');
    await page.locator('.edgelang-cue').hover();
    await expect(page.locator('.edgelang-popup-subtitle')).toContainText('Choose the best Spanish equivalent');
    await expect(page.locator('.edgelang-option-text')).toContainText(['casa']);

    await page.evaluate(() => {
      window.__syncStore.targetLanguage = 'ru';
      for (const listener of window.__runtimeListeners) {
        listener({ action: 'settingsUpdated' }, null, () => {});
      }
    });

    await expect(page.locator('.edgelang-cue')).toHaveCount(1);
    await expect(page.locator('.edgelang-cue')).toContainText('house');
    await page.locator('.edgelang-cue').hover();
    await expect(page.locator('.edgelang-popup-subtitle')).toContainText('Choose the best Russian equivalent');
    await expect(page.locator('.edgelang-option-text')).toContainText(['dom']);
    const debugEvents = await page.evaluate(() => window.__edgelangDebug.map((entry) => entry.event));
    expect(debugEvents.filter((event) => event === 'process:start').length).toBeGreaterThan(1);
  });

  test('content script extracts distributed text blocks and renders cues outside navigation chrome', async ({ page }) => {
    await page.addInitScript(() => {
      const syncStore = {
        enabled: true,
        nativeLanguage: 'en',
        targetLanguage: 'es',
        apiKeys: { openai: 'sk-test' },
        visualCueStyle: 'underline',
        highlightColor: '#f2a7a7',
        questionIntensity: 20,
        recallIntensity: 10,
        multipleChoiceCount: 4,
        positiveFeedback: true,
        negativeFeedback: true,
        audioEnabled: false,
        siteMode: 'blacklist',
        siteList: { blacklist: [], whitelist: [] },
        autoDetectLanguage: true,
        modePreference: 'auto',
        isPaused: false
      };
      const localStore = {
        learnerProfile: {
          level: 'intermediate',
          vocabulary: {},
          resolvedItems: [],
          confusionPatterns: [],
          stats: { totalAnswered: 0, correctAnswers: 0, streak: 0 }
        }
      };

      window.__analyzeMessages = [];
      window.chrome = {
        storage: {
          sync: {
            get: (_keys, cb) => cb(syncStore),
            set: (_values, cb) => cb && cb()
          },
          local: {
            get: (_keys, cb) => cb(localStore),
            set: (_values, cb) => cb && cb()
          },
          onChanged: {
            addListener: () => {}
          }
        },
        runtime: {
          sendMessage: (message, cb) => {
            let response = { success: true };
            if (message.action === 'detectLanguage') {
              response = { language: 'en' };
            } else if (message.action === 'analyzePage') {
              window.__analyzeMessages.push(message);
              response = {
                cues: [
                  {
                    text: 'market turbulence',
                    translation: 'turbulencia del mercado',
                    correctAnswer: 'turbulencia del mercado',
                    distractors: ['calma del mercado', 'mercado local', 'precio del mercado'],
                    blockIndex: 0
                  },
                  {
                    text: 'diplomatic stalemate',
                    translation: 'estancamiento diplomatico',
                    correctAnswer: 'estancamiento diplomatico',
                    distractors: ['avance diplomatico', 'visita diplomatica', 'discurso diplomatico'],
                    blockIndex: 2
                  }
                ]
              };
            }
            if (typeof cb === 'function') {
              cb(response);
              return;
            }
            return Promise.resolve(response);
          },
          onMessage: {
            addListener: () => {}
          }
        }
      };
    });

    await page.goto(`data:text/html,${encodeURIComponent(`
      <html lang="en">
        <body>
          <header><nav>World US Politics Markets Video Live TV Search Sign In</nav></header>
          <main>
            <article>
              <p id="block-a">Analysts warned that market turbulence could continue through the quarter as investors reacted to uneven earnings, tighter lending conditions, and slower consumer demand across multiple regions.</p>
              <p id="block-b">Editors noted that transport bottlenecks and energy pricing shifts were still feeding uncertainty into manufacturing forecasts and household budgeting decisions.</p>
              <p id="block-c">Negotiators described the talks as a diplomatic stalemate after another late-night session ended without agreement on border monitoring, humanitarian access, or security guarantees.</p>
            </article>
          </main>
        </body>
      </html>
    `)}`);
    await page.addScriptTag({ path: path.join(SRC_DIR, 'content.js') });

    await expect(page.locator('.edgelang-cue')).toHaveCount(2);
    await expect(page.locator('header .edgelang-cue')).toHaveCount(0);
    await expect(page.locator('#block-a .edgelang-cue')).toHaveCount(1);
    await expect(page.locator('#block-c .edgelang-cue')).toHaveCount(1);

    const analyzeMessage = await page.evaluate(() => window.__analyzeMessages[0]);
    expect(analyzeMessage.textBlocks.length).toBeGreaterThanOrEqual(3);
    expect(analyzeMessage.textSample).toContain('market turbulence');
    expect(analyzeMessage.textSample).toContain('diplomatic stalemate');
  });

  test('content script supplements sparse cnn-like extraction with fallback content blocks', async ({ page }) => {
    await page.addInitScript(() => {
      const syncStore = {
        enabled: true,
        nativeLanguage: 'en',
        targetLanguage: 'es',
        apiKeys: { openai: 'sk-test' },
        visualCueStyle: 'underline',
        highlightColor: '#f2a7a7',
        questionIntensity: 5,
        recallIntensity: 10,
        multipleChoiceCount: 4,
        positiveFeedback: true,
        negativeFeedback: true,
        audioEnabled: false,
        siteMode: 'blacklist',
        siteList: { blacklist: [], whitelist: [] },
        autoDetectLanguage: true,
        modePreference: 'auto',
        isPaused: false
      };
      const localStore = {
        learnerProfile: {
          level: 'intermediate',
          vocabulary: {},
          resolvedItems: [],
          confusionPatterns: [],
          stats: { totalAnswered: 0, correctAnswers: 0, streak: 0 }
        }
      };

      window.__analyzeMessages = [];
      window.chrome = {
        storage: {
          sync: {
            get: (_keys, cb) => cb(syncStore),
            set: (_values, cb) => cb && cb()
          },
          local: {
            get: (_keys, cb) => cb(localStore),
            set: (_values, cb) => cb && cb()
          },
          onChanged: {
            addListener: () => {}
          }
        },
        runtime: {
          sendMessage: (message, cb) => {
            let response = { success: true };
            if (message.action === 'detectLanguage') {
              response = { language: 'en' };
            } else if (message.action === 'analyzePage') {
              window.__analyzeMessages.push(message);
              response = {
                cues: [
                  {
                    text: 'crew forced to seek safety',
                    displayText: 'equipo obligado a buscar refugio',
                    translation: 'crew forced to seek safety',
                    correctAnswer: 'crew forced to seek safety',
                    distractors: ['team left early', 'camera crew relaxed', 'reporters stayed home'],
                    blockIndex: 1
                  }
                ]
              };
            }
            if (typeof cb === 'function') {
              cb(response);
              return;
            }
            return Promise.resolve(response);
          },
          onMessage: {
            addListener: () => {}
          }
        }
      };
    });

    await page.goto(`data:text/html,${encodeURIComponent(`
      <html lang="en">
        <body>
          <main class="news-shell">
            <p>DRM System Not Supported. It looks like your browser does not support the Digital Rights Management system required to play this content. Visit the Help Center.</p>
            <div class="hero-content">
              <div class="image image__hide-placeholder">function imageLoadError(img) { img.removeAttribute('onerror'); img.src = '/fallback.jpg'; }</div>
              <div>With jets overhead, CNN's crew forced to seek safety in Tehran while correspondents continued documenting the strikes and evacuation routes from several neighborhoods.</div>
              <div>Iran begins laying mines in Strait of Hormuz, sources say, as shipping insurers and regional analysts warn that commercial traffic could face mounting risks over the coming days.</div>
              <div>Another long-form analysis block explains how diplomatic pressure, fuel markets, and military posturing are colliding across the region in a way that reshapes global attention.</div>
            </div>
          </main>
        </body>
      </html>
    `)}`);
    await page.addScriptTag({ path: path.join(SRC_DIR, 'content.js') });

    await expect.poll(async () => {
      return await page.evaluate(() => window.__analyzeMessages.length);
    }).toBeGreaterThan(0);

    const analyzeMessage = await page.evaluate(() => window.__analyzeMessages[0]);
    expect(analyzeMessage).toBeTruthy();
    expect(analyzeMessage.textSample).toContain("crew forced to seek safety in Tehran");
    expect(analyzeMessage.textSample).toContain('Iran begins laying mines in Strait of Hormuz');
    expect(analyzeMessage.textSample).not.toContain('DRM System Not Supported');
    expect(analyzeMessage.textSample).not.toContain('function imageLoadError');
  });

  test('content script extracts fallback text blocks from div-heavy pages instead of reporting insufficient text', async ({ page }) => {
    await page.addInitScript(() => {
      const syncStore = {
        enabled: true,
        nativeLanguage: 'en',
        targetLanguage: 'es',
        apiKeys: { openai: 'sk-test' },
        visualCueStyle: 'underline',
        highlightColor: '#f2a7a7',
        questionIntensity: 5,
        recallIntensity: 10,
        multipleChoiceCount: 4,
        positiveFeedback: true,
        negativeFeedback: true,
        audioEnabled: false,
        siteMode: 'blacklist',
        siteList: { blacklist: [], whitelist: [] },
        autoDetectLanguage: true,
        modePreference: 'auto',
        isPaused: false
      };
      const localStore = {
        learnerProfile: {
          level: 'intermediate',
          vocabulary: {},
          resolvedItems: [],
          confusionPatterns: [],
          stats: { totalAnswered: 0, correctAnswers: 0, streak: 0 }
        }
      };

      window.__analyzeMessages = [];
      window.chrome = {
        storage: {
          sync: {
            get: (_keys, cb) => cb(syncStore),
            set: (_values, cb) => cb && cb()
          },
          local: {
            get: (_keys, cb) => cb(localStore),
            set: (_values, cb) => cb && cb()
          },
          onChanged: {
            addListener: () => {}
          }
        },
        runtime: {
          sendMessage: (message, cb) => {
            let response = { success: true };
            if (message.action === 'detectLanguage') {
              response = { language: 'en' };
            } else if (message.action === 'analyzePage') {
              window.__analyzeMessages.push(message);
              response = {
                cues: [
                  {
                    text: 'long-form reporting',
                    translation: 'reportaje de formato largo',
                    correctAnswer: 'reportaje de formato largo',
                    distractors: ['resumen breve', 'nota local', 'editorial ligera']
                  }
                ]
              };
            }
            if (typeof cb === 'function') {
              cb(response);
              return;
            }
            return Promise.resolve(response);
          },
          onMessage: {
            addListener: () => {}
          }
        }
      };
    });

    await page.goto(`data:text/html,${encodeURIComponent(`
      <html lang="en">
        <body>
          <main class="markdown-body">
            <div id="story">
              long-form reporting can still thrive on the web when a page presents rich context, detailed sourcing, and meaningful explanation across several connected sections of text without relying on paragraph tags alone.
              the second section continues the article with more reporting detail, background explanation, and additional examples so the extractor can recover enough useful content from a div-based layout that resembles many modern publishing systems.
            </div>
          </main>
        </body>
      </html>
    `)}`);
    await page.addScriptTag({ path: path.join(SRC_DIR, 'content.js') });

    await expect(page.locator('.edgelang-cue')).toHaveCount(1);
    const analyzeMessage = await page.evaluate(() => window.__analyzeMessages[0]);
    expect(analyzeMessage.text.length).toBeGreaterThan(100);
  });

  test('content script falls back to body text when sparse pages have meaningful copy but no eligible blocks', async ({ page }) => {
    await page.addInitScript(() => {
      const syncStore = {
        enabled: true,
        nativeLanguage: 'en',
        targetLanguage: 'es',
        apiKeys: { openai: 'sk-test' },
        visualCueStyle: 'underline',
        highlightColor: '#f2a7a7',
        questionIntensity: 5,
        recallIntensity: 10,
        multipleChoiceCount: 4,
        positiveFeedback: true,
        negativeFeedback: true,
        audioEnabled: false,
        siteMode: 'blacklist',
        siteList: { blacklist: [], whitelist: [] },
        autoDetectLanguage: true,
        modePreference: 'auto',
        isPaused: false
      };
      const localStore = {
        learnerProfile: {
          level: 'intermediate',
          vocabulary: {},
          resolvedItems: [],
          confusionPatterns: [],
          stats: { totalAnswered: 0, correctAnswers: 0, streak: 0 }
        }
      };

      window.__analyzeMessages = [];
      window.chrome = {
        storage: {
          sync: {
            get: (_keys, cb) => cb(syncStore),
            set: (_values, cb) => cb && cb()
          },
          local: {
            get: (_keys, cb) => cb(localStore),
            set: (_values, cb) => cb && cb()
          },
          onChanged: {
            addListener: () => {}
          }
        },
        runtime: {
          sendMessage: (message, cb) => {
            let response = { success: true };
            if (message.action === 'detectLanguage') {
              response = { language: 'en' };
            } else if (message.action === 'analyzePage') {
              window.__analyzeMessages.push(message);
              response = {
                cues: [
                  {
                    text: 'research workflows',
                    translation: 'flujos de trabajo de investigacion',
                    correctAnswer: 'flujos de trabajo de investigacion',
                    distractors: ['panel de control', 'calendario diario', 'resumen semanal']
                  }
                ]
              };
            }
            if (typeof cb === 'function') {
              cb(response);
              return;
            }
            return Promise.resolve(response);
          },
          onMessage: {
            addListener: () => {}
          }
        }
      };
    });

    await page.goto(`data:text/html,${encodeURIComponent(`
      <html lang="en">
        <body>
          research workflows improve when people can scan one concise page, compare source notes, and revisit supporting context without leaving the current screen during review.
        </body>
      </html>
    `)}`);
    await page.addScriptTag({ path: path.join(SRC_DIR, 'content.js') });

    await expect(page.locator('.edgelang-cue')).toHaveCount(1);
    const analyzeMessage = await page.evaluate(() => window.__analyzeMessages[0]);
    expect(analyzeMessage.text.length).toBeGreaterThan(100);
    expect(analyzeMessage.textSample).toContain('research workflows improve when people can scan one concise page');
  });

  test('content script extracts meaningful text from generic section and card layouts', async ({ page }) => {
    await page.addInitScript(() => {
      const syncStore = {
        enabled: true,
        nativeLanguage: 'en',
        targetLanguage: 'es',
        apiKeys: { openai: 'sk-test' },
        visualCueStyle: 'underline',
        highlightColor: '#f2a7a7',
        questionIntensity: 10,
        recallIntensity: 10,
        multipleChoiceCount: 4,
        positiveFeedback: true,
        negativeFeedback: true,
        audioEnabled: false,
        siteMode: 'blacklist',
        siteList: { blacklist: [], whitelist: [] },
        autoDetectLanguage: true,
        modePreference: 'auto',
        isPaused: false
      };
      const localStore = {
        learnerProfile: {
          level: 'intermediate',
          vocabulary: {},
          resolvedItems: [],
          confusionPatterns: [],
          stats: { totalAnswered: 0, correctAnswers: 0, streak: 0 }
        }
      };

      window.__analyzeMessages = [];
      window.chrome = {
        storage: {
          sync: {
            get: (_keys, cb) => cb(syncStore),
            set: (_values, cb) => cb && cb()
          },
          local: {
            get: (_keys, cb) => cb(localStore),
            set: (_values, cb) => cb && cb()
          },
          onChanged: {
            addListener: () => {}
          }
        },
        runtime: {
          sendMessage: (message, cb) => {
            let response = { success: true };
            if (message.action === 'detectLanguage') {
              response = { language: 'en' };
            } else if (message.action === 'analyzePage') {
              window.__analyzeMessages.push(message);
              response = { cues: [] };
            }
            if (typeof cb === 'function') {
              cb(response);
              return;
            }
            return Promise.resolve(response);
          },
          onMessage: {
            addListener: () => {}
          }
        }
      };
    });

    await page.goto(`data:text/html,${encodeURIComponent(`
      <html lang="en">
        <body>
          <div id="cookie-banner">Accept all cookies to continue reading and manage preferences.</div>
          <aside>Home Topics Video Audio Live Search Sign in</aside>
          <main>
            <section class="story-grid">
              <div class="story-card">
                <div class="eyebrow">Global Economy</div>
                <div class="story-body">Central banks are weighing a slower path for rate cuts as wage growth, energy volatility, and shipping disruptions keep inflation pressure alive across multiple regions and industries.</div>
              </div>
              <div class="story-card">
                <div class="eyebrow">Climate</div>
                <div class="story-body">Researchers say coastal adaptation plans now depend on neighborhood-scale flood modeling, long-term insurance reform, and resilient transit links that communities can actually maintain.</div>
              </div>
              <div class="story-card">
                <div class="eyebrow">Technology</div>
                <div class="story-body">Enterprise buyers are demanding clearer evidence that automation tools reduce repetitive work, improve review quality, and fit established security controls instead of creating extra process overhead.</div>
              </div>
            </section>
          </main>
        </body>
      </html>
    `)}`);
    await page.addScriptTag({ path: path.join(SRC_DIR, 'content.js') });

    await expect.poll(async () => page.evaluate(() => window.__analyzeMessages.length)).toBeGreaterThan(0);
    const analyzeMessage = await page.evaluate(() => window.__analyzeMessages[0]);

    expect(analyzeMessage.textSample).toContain('Central banks are weighing a slower path for rate cuts');
    expect(analyzeMessage.textSample).toContain('Researchers say coastal adaptation plans now depend on neighborhood-scale flood modeling');
    expect(analyzeMessage.textSample).toContain('Enterprise buyers are demanding clearer evidence that automation tools reduce repetitive work');
    expect(analyzeMessage.textSample).not.toContain('Accept all cookies');
    expect(analyzeMessage.textSample).not.toContain('Home Topics Video Audio Live Search Sign in');
  });

  test('content script extracts readable text from documentation-style pages without article paragraphs', async ({ page }) => {
    await page.addInitScript(() => {
      const syncStore = {
        enabled: true,
        nativeLanguage: 'en',
        targetLanguage: 'es',
        apiKeys: { openai: 'sk-test' },
        visualCueStyle: 'underline',
        highlightColor: '#f2a7a7',
        questionIntensity: 10,
        recallIntensity: 10,
        multipleChoiceCount: 4,
        positiveFeedback: true,
        negativeFeedback: true,
        audioEnabled: false,
        siteMode: 'blacklist',
        siteList: { blacklist: [], whitelist: [] },
        autoDetectLanguage: true,
        modePreference: 'auto',
        isPaused: false
      };
      const localStore = {
        learnerProfile: {
          level: 'intermediate',
          vocabulary: {},
          resolvedItems: [],
          confusionPatterns: [],
          stats: { totalAnswered: 0, correctAnswers: 0, streak: 0 }
        }
      };

      window.__analyzeMessages = [];
      window.chrome = {
        storage: {
          sync: {
            get: (_keys, cb) => cb(syncStore),
            set: (_values, cb) => cb && cb()
          },
          local: {
            get: (_keys, cb) => cb(localStore),
            set: (_values, cb) => cb && cb()
          },
          onChanged: {
            addListener: () => {}
          }
        },
        runtime: {
          sendMessage: (message, cb) => {
            let response = { success: true };
            if (message.action === 'detectLanguage') {
              response = { language: 'en' };
            } else if (message.action === 'analyzePage') {
              window.__analyzeMessages.push(message);
              response = { cues: [] };
            }
            if (typeof cb === 'function') {
              cb(response);
              return;
            }
            return Promise.resolve(response);
          },
          onMessage: {
            addListener: () => {}
          }
        }
      };
    });

    await page.goto(`data:text/html,${encodeURIComponent(`
      <html lang="en">
        <body>
          <header>Docs Search API Guides Changelog</header>
          <main class="prose">
            <section id="intro">
              <div>Getting started with the deployment workflow means defining a build command, setting environment variables, and verifying that preview releases use the same runtime assumptions as production.</div>
            </section>
            <section id="advanced">
              <div>Advanced usage focuses on rollback safety, request tracing, and gradual rollout controls so teams can isolate regressions before a full release reaches every user.</div>
            </section>
            <pre><code>npm run deploy -- --env production</code></pre>
          </main>
        </body>
      </html>
    `)}`);
    await page.addScriptTag({ path: path.join(SRC_DIR, 'content.js') });

    await expect.poll(async () => page.evaluate(() => window.__analyzeMessages.length)).toBeGreaterThan(0);
    const analyzeMessage = await page.evaluate(() => window.__analyzeMessages[0]);

    expect(analyzeMessage.textSample).toContain('Getting started with the deployment workflow means defining a build command');
    expect(analyzeMessage.textSample).toContain('Advanced usage focuses on rollback safety, request tracing, and gradual rollout controls');
    expect(analyzeMessage.textSample).not.toContain('Docs Search API Guides Changelog');
    expect(analyzeMessage.textSample).not.toContain('npm run deploy');
  });

  test('content script retries short initial pages instead of locking into insufficient text', async ({ page }) => {
    await page.addInitScript(() => {
      const syncStore = {
        enabled: true,
        nativeLanguage: 'en',
        targetLanguage: 'es',
        apiKeys: { openai: 'sk-test' },
        visualCueStyle: 'underline',
        highlightColor: '#f2a7a7',
        questionIntensity: 5,
        recallIntensity: 10,
        multipleChoiceCount: 4,
        positiveFeedback: true,
        negativeFeedback: true,
        audioEnabled: false,
        siteMode: 'blacklist',
        siteList: { blacklist: [], whitelist: [] },
        autoDetectLanguage: true,
        modePreference: 'auto',
        isPaused: false
      };
      const localStore = {
        learnerProfile: {
          level: 'intermediate',
          vocabulary: {},
          resolvedItems: [],
          confusionPatterns: [],
          recentInteractions: [],
          stats: { totalAnswered: 0, correctAnswers: 0, streak: 0 }
        }
      };

      window.__analyzeMessages = [];
      window.chrome = {
        storage: {
          sync: {
            get: (_keys, cb) => cb(syncStore),
            set: (_values, cb) => cb && cb()
          },
          local: {
            get: (_keys, cb) => cb(localStore),
            set: (_values, cb) => cb && cb()
          },
          onChanged: {
            addListener: () => {}
          }
        },
        runtime: {
          sendMessage: (message, cb) => {
            let response = { success: true };
            if (message.action === 'detectLanguage') {
              response = { language: 'en' };
            } else if (message.action === 'analyzePage') {
              window.__analyzeMessages.push(message);
              response = {
                cues: [
                  {
                    text: 'detailed coverage',
                    translation: 'cobertura detallada',
                    correctAnswer: 'cobertura detallada',
                    distractors: ['resumen breve', 'nota ligera', 'cobertura local']
                  }
                ]
              };
            }
            if (typeof cb === 'function') {
              cb(response);
              return;
            }
            return Promise.resolve(response);
          },
          onMessage: {
            addListener: (listener) => {
              window.__runtimeListeners = window.__runtimeListeners || [];
              window.__runtimeListeners.push(listener);
            }
          }
        }
      };
    });

    await page.goto('data:text/html,<html lang=\"en\"><body><main><div id=\"slot\">Short intro.</div></main></body></html>');
    await page.addScriptTag({ path: path.join(SRC_DIR, 'content.js') });
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      document.getElementById('slot').textContent = 'Detailed coverage of the developing story arrives after the initial shell and provides enough context, reporting, background, and analysis for the extension to extract meaningful language-learning candidates from the page.';
      const more = document.createElement('div');
      more.textContent = 'A second section adds further explanation, reactions, and examples so the retry path sees a fuller body of text instead of the short placeholder that was present at first paint.';
      document.querySelector('main').appendChild(more);
    });

    await expect.poll(async () => {
      return await page.evaluate(() => window.__analyzeMessages.length);
    }).toBeGreaterThan(0);

    const state = await page.evaluate(() => {
      let response = null;
      for (const listener of window.__runtimeListeners || []) {
        listener({ action: 'getPageState' }, null, (payload) => {
          response = payload;
        });
      }
      return response;
    });
    expect(state.blockerReason).not.toBe('insufficient_text');

    const debugEvents = await page.evaluate(() => window.__edgelangDebug.map((entry) => entry.event));
    expect(debugEvents).toContain('process:blocked');
    expect(debugEvents).toContain('process:complete');
  });

  test('content script renders quick viewport cues before the slower full-page analysis completes', async ({ page }) => {
    await page.addInitScript(() => {
      const syncStore = {
        enabled: true,
        nativeLanguage: 'en',
        targetLanguage: 'es',
        apiKeys: { openai: 'sk-test' },
        visualCueStyle: 'underline',
        highlightColor: '#f2a7a7',
        questionIntensity: 20,
        recallIntensity: 10,
        multipleChoiceCount: 4,
        positiveFeedback: true,
        negativeFeedback: true,
        audioEnabled: false,
        siteMode: 'blacklist',
        siteList: { blacklist: [], whitelist: [] },
        autoDetectLanguage: true,
        modePreference: 'auto',
        isPaused: false
      };
      const localStore = {
        learnerProfile: {
          level: 'intermediate',
          vocabulary: {},
          resolvedItems: [],
          confusionPatterns: [],
          recentInteractions: [],
          stats: { totalAnswered: 0, correctAnswers: 0, streak: 0 }
        }
      };

      window.__analyzeStages = [];
      window.chrome = {
        storage: {
          sync: {
            get: (_keys, cb) => cb(syncStore),
            set: (_values, cb) => cb && cb()
          },
          local: {
            get: (_keys, cb) => cb(localStore),
            set: (_values, cb) => cb && cb()
          },
          onChanged: {
            addListener: () => {}
          }
        },
        runtime: {
          sendMessage: (message, cb) => {
            if (message.action === 'detectLanguage') {
              const response = { language: 'en' };
              if (typeof cb === 'function') {
                cb(response);
                return;
              }
              return Promise.resolve(response);
            }

            if (message.action === 'analyzePage') {
              window.__analyzeStages.push({
                stage: message.stage,
                textLength: message.text.length,
                blockCount: message.textBlocks.length
              });
              const response = message.stage === 'quick'
                ? Promise.resolve({
                    cues: [
                      {
                        text: 'market volatility',
                        translation: 'volatilidad del mercado',
                        correctAnswer: 'volatilidad del mercado',
                        distractors: ['mercado estable', 'precio local', 'acuerdo comercial'],
                        blockIndex: 0
                      }
                    ]
                  })
                : new Promise((resolve) => {
                    setTimeout(() => resolve({
                      cues: [
                        {
                          text: 'market volatility',
                          translation: 'volatilidad del mercado',
                          correctAnswer: 'volatilidad del mercado',
                          distractors: ['mercado estable', 'precio local', 'acuerdo comercial'],
                          blockIndex: 0
                        },
                        {
                          text: 'diplomatic impasse',
                          translation: 'impasse diplomatico',
                          correctAnswer: 'impasse diplomatico',
                          distractors: ['avance diplomatico', 'visita diplomatica', 'nota diplomatica'],
                          blockIndex: 2
                        }
                      ]
                    }), 900);
                  });

              if (typeof cb === 'function') {
                response.then(cb);
                return;
              }
              return response;
            }

            const response = { success: true };
            if (typeof cb === 'function') {
              cb(response);
              return;
            }
            return Promise.resolve(response);
          },
          onMessage: {
            addListener: () => {}
          }
        }
      };
    });

    await page.goto(`data:text/html,${encodeURIComponent(`
      <html lang="en">
        <body>
          <main>
            <article>
              <p id="top">Analysts said market volatility was still shaping investor sentiment during the first half of the session as traders reacted to earnings and revised forecasts.</p>
              <p id="mid">Another paragraph adds more detail about consumer demand, production trends, and broad risk appetite so the quick pass has enough nearby text to work with immediately.</p>
              <div style="height: 2600px;"></div>
              <p id="bottom">Diplomats later described the overnight talks as a diplomatic impasse after another meeting ended without a shared monitoring framework or security guarantee.</p>
            </article>
          </main>
        </body>
      </html>
    `)}`);
    await page.addScriptTag({ path: path.join(SRC_DIR, 'content.js') });

    await expect(page.locator('#top .edgelang-cue')).toHaveCount(1);
    await expect.poll(async () => {
      return await page.evaluate(() => window.__analyzeStages.map((entry) => entry.stage));
    }).toEqual(['quick', 'full']);

    await expect(page.locator('#bottom .edgelang-cue')).toHaveCount(1);

    const analyzeStages = await page.evaluate(() => window.__analyzeStages);
    expect(analyzeStages[0].stage).toBe('quick');
    expect(analyzeStages[1].stage).toBe('full');
    expect(analyzeStages[0].blockCount).toBeLessThanOrEqual(analyzeStages[1].blockCount);

    const debugEvents = await page.evaluate(() => window.__edgelangDebug.map((entry) => entry.event));
    expect(debugEvents).toContain('process:quick-complete');
    expect(debugEvents).toContain('process:complete');
  });

  test('content script keeps the popup open while page mutations trigger deferred reprocessing', async ({ page }) => {
    await page.addInitScript(() => {
      const syncStore = {
        enabled: true,
        nativeLanguage: 'en',
        targetLanguage: 'es',
        apiKeys: { openai: 'sk-test' },
        visualCueStyle: 'underline',
        highlightColor: '#f2a7a7',
        questionIntensity: 5,
        recallIntensity: 10,
        multipleChoiceCount: 4,
        positiveFeedback: true,
        negativeFeedback: true,
        audioEnabled: false,
        siteMode: 'blacklist',
        siteList: { blacklist: [], whitelist: [] },
        autoDetectLanguage: true,
        modePreference: 'auto',
        isPaused: false
      };
      const localStore = {
        learnerProfile: {
          level: 'intermediate',
          vocabulary: {},
          resolvedItems: [],
          confusionPatterns: [],
          stats: { totalAnswered: 0, correctAnswers: 0, streak: 0 }
        }
      };

      window.__analyzeCallCount = 0;
      window.chrome = {
        storage: {
          sync: {
            get: (_keys, cb) => cb(syncStore),
            set: (_values, cb) => cb && cb()
          },
          local: {
            get: (_keys, cb) => cb(localStore),
            set: (_values, cb) => cb && cb()
          },
          onChanged: {
            addListener: () => {}
          }
        },
        runtime: {
          sendMessage: (message, cb) => {
            let response = { success: true };
            if (message.action === 'detectLanguage') {
              response = { language: 'es' };
            } else if (message.action === 'analyzePage') {
              window.__analyzeCallCount += 1;
              response = {
                cues: [
                  {
                    text: 'Hola',
                    translation: 'hello',
                    correctAnswer: 'hello',
                    distractors: ['goodbye', 'please', 'thanks']
                  }
                ]
              };
            }
            if (typeof cb === 'function') {
              cb(response);
              return;
            }
            return Promise.resolve(response);
          },
          onMessage: {
            addListener: () => {}
          }
        }
      };
    });

    await page.goto('data:text/html,<html lang="es"><body><main><p id="copy">Hola mundo desde EdgeLang. Este texto adicional existe para que el analisis tenga contenido suficiente y la pagina pueda mutar mientras el popup esta abierto.</p></main></body></html>');
    await page.addScriptTag({ path: path.join(SRC_DIR, 'content.js') });

    await expect(page.locator('.edgelang-cue')).toHaveCount(1);
    await page.locator('.edgelang-cue').hover();
    await expect(page.locator('.edgelang-popup')).toBeVisible();
    await page.evaluate(() => {
      const extra = document.createElement('p');
      extra.textContent = 'Contenido nuevo para activar el observador de mutaciones.';
      document.querySelector('main').appendChild(extra);
    });

    await page.waitForTimeout(1500);
    await expect(page.locator('.edgelang-popup')).toBeVisible();

    await page.locator('.edgelang-close').click();
    await page.waitForTimeout(1500);

    const debugEvents = await page.evaluate(() => window.__edgelangDebug.map((entry) => entry.event));
    expect(debugEvents).toContain('process:deferred');
    expect(debugEvents).toContain('process:resume-deferred');
  });
});
