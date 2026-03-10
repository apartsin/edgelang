import { test, expect } from '@playwright/test';
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
    expect(backgroundSource).toContain("case 'getDebugLog'");
    expect(backgroundSource).toContain("case 'debugLog'");
    expect(backgroundSource).toContain('startProcessingBadgeAnimation');
    expect(backgroundSource).toContain("status = 'processing'");
    expect(backgroundSource).toContain("chrome.runtime.openOptionsPage()");
    expect(backgroundSource).toContain("details.reason === 'install'");
    expect(backgroundSource).toContain("chrome.commands.onCommand.addListener");
    expect(backgroundSource).toContain("quotaExhausted");
    expect(backgroundSource).toContain('getSelectedModel');
  });

  test('options script exports combined data and clears both storage areas', async () => {
    const optionsSource = fs.readFileSync(path.join(SRC_DIR, 'options.js'), 'utf-8');
    expect(optionsSource).toContain('sync: syncData');
    expect(optionsSource).toContain('local: localData');
    expect(optionsSource).toContain('chrome.storage.sync.clear');
    expect(optionsSource).toContain('highlightColor');
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
              return { questions, targetLanguage: 'es', roundSize: 10 };
            }
            if (message.action === 'runCalibration') {
              window.__submittedCalibrationAnswers = message.answers;
              localStore.calibrationData = {
                level: 'intermediate',
                accuracy: 0.8
              };
              return {
                level: 'intermediate',
                accuracy: 0.8,
                totalQuestions: message.answers.length
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
    await expect(page.locator('#statsMastered')).toContainText('2');
    await expect(page.locator('#statsAccuracy')).toContainText('80%');
    await expect(page.locator('#statsWords')).toContainText('2');

    await page.selectOption('#model-openai', 'gpt-4.1-mini');
    await page.locator('#validateKeys').click();
    await expect(page.locator('#validationResults')).toContainText('Validated');
    const validationMessage = await page.evaluate(() => window.__messages.find((message) => message.action === 'validateApiKeys'));
    expect(validationMessage.modelSelection.openai).toBe('gpt-4.1-mini');
    expect(validationMessage.apiKeys.openai).toBe('sk-test');

    await page.locator('#startCalibration').click();
    await expect(page.locator('#calibrationProgress')).toContainText('Question 1 of 10');

    for (let index = 0; index < 10; index += 1) {
      await page.locator('.calibration-choice').first().click();
    }

    await expect(page.locator('#calibrationResult')).toBeVisible();
    await expect(page.locator('#calibrationLevel')).toContainText('Intermediate');
    const submittedCount = await page.evaluate(() => window.__submittedCalibrationAnswers.length);
    expect(submittedCount).toBe(10);
  });

  test('options page resumes saved calibration progress', async ({ page }) => {
    await page.addInitScript(() => {
      const syncStore = {
        nativeLanguage: 'en',
        targetLanguage: 'es',
        apiKeys: { openai: 'sk-test' },
        siteMode: 'blacklist',
        siteList: { blacklist: [], whitelist: [] }
      };
      const localStore = {
        calibrationProgress: {
          targetLanguage: 'es',
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
    await expect(page.locator('#startCalibration')).toContainText('Resume Calibration');
    await page.locator('#startCalibration').click();
    await expect(page.locator('#calibrationProgress')).toContainText('Question 4 of 10');
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
            addListener: (listener) => runtimeListeners.push(listener)
          }
        }
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

    await page.goto('data:text/html,<html lang="es"><body><p id="copy">Hola mundo desde EdgeLang. Este texto adicional existe para superar el umbral minimo de analisis y comprobar que solo se resalta la palabra correcta en lugar de toda la frase.</p></body></html>');
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
    await page.locator('.edgelang-popup').hover();
    await page.waitForTimeout(200);
    await expect(page.locator('.edgelang-popup')).toBeVisible();
    await expect(page.locator('.edgelang-audio-btn')).toBeVisible();
    await page.locator('.edgelang-audio-btn').click();
    await expect(page.locator('.edgelang-popup')).toBeVisible();
    await page.keyboard.press('1');
    await expect(page.locator('.edgelang-feedback')).toBeVisible();

    const pageState = await page.evaluate(() => new Promise((resolve) => {
      const listeners = [];
      window.chrome.runtime.onMessage.addListener = (listener) => listeners.push(listener);
      resolve({
        blockerReason: null,
        debugTail: window.__edgelangDebug.slice(-10)
      });
    }));
    expect(pageState.debugTail.some((entry) => entry.event === 'render:complete')).toBe(true);
    expect(pageState.debugTail.some((entry) => entry.event === 'popup:answer')).toBe(true);
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
});
