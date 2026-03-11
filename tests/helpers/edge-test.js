import { test as base, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEBUG_DIR = path.join(__dirname, '..', '..', 'test-results', 'debug');

function sanitizeFileSegment(value) {
  return String(value || 'unknown')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'unknown';
}

function getTestTitlePath(testInfo) {
  if (typeof testInfo.titlePath === 'function') {
    return testInfo.titlePath();
  }
  if (Array.isArray(testInfo.titlePath)) {
    return testInfo.titlePath;
  }
  return [testInfo.file, testInfo.title];
}

function limitString(value, maxLength = 400) {
  if (typeof value !== 'string') {
    return value;
  }
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function serializeError(error) {
  if (!error) {
    return null;
  }
  return {
    name: error.name,
    message: error.message,
    stack: error.stack
  };
}

async function safePageEvaluate(page, evaluator, fallbackValue = null) {
  try {
    return await page.evaluate(evaluator);
  } catch {
    return fallbackValue;
  }
}

async function getPageSnapshot(page) {
  const pageState = await safePageEvaluate(page, () => {
    const state = typeof window.__edgelangGetState === 'function'
      ? window.__edgelangGetState()
      : null;
    return {
      href: window.location.href,
      title: document.title,
      readyState: document.readyState,
      state,
      contentDebug: Array.isArray(window.__edgelangDebug) ? window.__edgelangDebug.slice(-100) : [],
      uiDebug: Array.isArray(window.__edgelangUiDebug) ? window.__edgelangUiDebug.slice(-100) : []
    };
  }, null);

  const extensionDebug = await safePageEvaluate(page, async () => {
    if (!window.chrome?.runtime?.sendMessage) {
      return null;
    }
    try {
      const response = await window.chrome.runtime.sendMessage({ action: 'getDebugLog' });
      return response?.entries || null;
    } catch {
      return null;
    }
  }, null);

  return {
    url: page.url(),
    snapshot: pageState,
    extensionDebug
  };
}

async function getServiceWorkerLogs(context) {
  if (typeof context.serviceWorkers !== 'function') {
    return [];
  }

  const workers = context.serviceWorkers();
  const results = [];

  for (const worker of workers) {
    try {
      const entries = await worker.evaluate(async () => {
        return await new Promise((resolve) => {
          chrome.storage.local.get(['debugLog'], (result) => {
            resolve(result.debugLog || []);
          });
        });
      });
      results.push(...entries);
    } catch {}
  }

  return results;
}

function summarizeFailure(artifact) {
  const lines = [];
  const extensionDebug = artifact.extensionDebug;
  const pageSnapshots = artifact.pages;
  const pageErrors = artifact.pageErrors;

  if (!extensionDebug.length) {
    lines.push('No extension background logs were captured.');
  }

  const lastAnalyzeRequest = [...extensionDebug].reverse().find((entry) => entry.event === 'message:analyzePage');
  if (lastAnalyzeRequest?.details) {
    lines.push(
      `Last analyze request: stage=${lastAnalyzeRequest.details.stage || 'unknown'}, mode=${lastAnalyzeRequest.details.mode || 'unknown'}, blocks=${lastAnalyzeRequest.details.textBlockCount || 0}, sample="${limitString(lastAnalyzeRequest.details.textSample || '', 180)}"`
    );
  }

  const lastError = [...extensionDebug].reverse().find((entry) => /error|blocked|parse:no-json/i.test(entry.event));
  if (lastError) {
    lines.push(`Last extension issue: ${lastError.event} ${JSON.stringify(lastError.details || {})}`);
  }

  const lastRenderEmpty = [...extensionDebug].reverse().find((entry) => entry.event === 'render:empty');
  if (lastRenderEmpty) {
    lines.push(`Render ended empty. Details: ${JSON.stringify(lastRenderEmpty.details || {})}`);
  }

  for (const page of pageSnapshots) {
    const state = page.snapshot?.state;
    if (state) {
      lines.push(
        `Page state for ${limitString(page.url, 140)}: cues=${state.cueCount ?? 'n/a'}, processing=${state.processing ?? 'n/a'}, blocker=${state.blockerReason || 'none'}, mode=${state.currentMode || 'unknown'}, language=${state.pageLanguage || 'unknown'}`
      );
      if (state.lastExtraction) {
        lines.push(`Last extraction: ${JSON.stringify(state.lastExtraction)}`);
      }
    }
  }

  if (pageErrors.length) {
    lines.push(`Page errors: ${pageErrors.map((entry) => entry.message).join(' | ')}`);
  }

  if (!lines.length) {
    lines.push('No specific EdgeLang diagnosis was available.');
  }

  return lines.join('\n');
}

export const test = base.extend({
  debugContextRegistry: async ({ context }, use) => {
    const registry = {
      contexts: [context],
      onRegister: []
    };
    await use(registry);
  },
  registerDebugContext: async ({ debugContextRegistry }, use) => {
    await use((extraContext) => {
      if (extraContext && !debugContextRegistry.contexts.includes(extraContext)) {
        debugContextRegistry.contexts.push(extraContext);
        debugContextRegistry.onRegister.forEach((callback) => callback(extraContext));
      }
    });
  },
  edgeDebugCollector: [async ({ debugContextRegistry }, use, testInfo) => {
    const consoleEntries = [];
    const pageErrors = [];
    const requestFailures = [];
    const pageListenerState = new WeakSet();
    const trackedContexts = debugContextRegistry.contexts;

    const attachPageListeners = (page) => {
      if (!page || pageListenerState.has(page)) {
        return;
      }
      pageListenerState.add(page);
      page.on('console', (message) => {
        consoleEntries.push({
          page: page.url(),
          type: message.type(),
          text: message.text(),
          location: message.location()
        });
      });
      page.on('pageerror', (error) => {
        pageErrors.push({
          page: page.url(),
          ...serializeError(error)
        });
      });
      page.on('requestfailed', (request) => {
        requestFailures.push({
          page: page.url(),
          url: request.url(),
          method: request.method(),
          failure: request.failure()
        });
      });
    };

    trackedContexts.forEach((activeContext) => {
      activeContext.pages().forEach(attachPageListeners);
      activeContext.on('page', attachPageListeners);
    });
    debugContextRegistry.onRegister.push((activeContext) => {
      activeContext.pages().forEach(attachPageListeners);
      activeContext.on('page', attachPageListeners);
    });

    await use();

    if (testInfo.status === testInfo.expectedStatus) {
      return;
    }

    fs.mkdirSync(DEBUG_DIR, { recursive: true });

    const pageSnapshots = [];
    for (const activeContext of trackedContexts) {
      for (const page of activeContext.pages()) {
        pageSnapshots.push(await getPageSnapshot(page));
      }
    }

    const extensionDebug = [];
    for (const pageSnapshot of pageSnapshots) {
      if (Array.isArray(pageSnapshot.extensionDebug)) {
        extensionDebug.push(...pageSnapshot.extensionDebug);
      }
    }

    if (!extensionDebug.length) {
      for (const activeContext of trackedContexts) {
        extensionDebug.push(...await getServiceWorkerLogs(activeContext));
      }
    }

    const artifact = {
      test: {
        title: testInfo.title,
        titlePath: getTestTitlePath(testInfo),
        file: testInfo.file,
        status: testInfo.status,
        expectedStatus: testInfo.expectedStatus,
        retry: testInfo.retry,
        duration: testInfo.duration
      },
      pages: pageSnapshots,
      extensionDebug,
      consoleEntries,
      pageErrors,
      requestFailures
    };

    artifact.summary = summarizeFailure(artifact);

    const baseName = sanitizeFileSegment(`${getTestTitlePath(testInfo).join('__')}__retry-${testInfo.retry}`);
    const jsonPath = path.join(DEBUG_DIR, `${baseName}.json`);
    const summaryPath = path.join(DEBUG_DIR, `${baseName}.summary.txt`);
    fs.writeFileSync(jsonPath, JSON.stringify(artifact, null, 2));
    fs.writeFileSync(summaryPath, `${artifact.summary}\n`);

    await testInfo.attach('edgelang-debug-json', {
      path: jsonPath,
      contentType: 'application/json'
    });
    await testInfo.attach('edgelang-debug-summary', {
      path: summaryPath,
      contentType: 'text/plain'
    });

    console.log(`[EdgeLang debug] Failure analysis saved to ${summaryPath}`);
    console.log(`[EdgeLang debug] ${artifact.summary}`);
  }, { auto: true }]
});

export { expect };
