import { test, expect } from './helpers/edge-test.js';
import { chromium } from 'playwright';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '..', 'src');
const SITES_PATH = path.join(__dirname, 'data', 'top-sites.json');
const TOP_SITES = JSON.parse(fs.readFileSync(SITES_PATH, 'utf-8'));
const RUN_LIVE_SITE_COMPAT = process.env.EDGE_LANG_LIVE_SITES === '1';
const FILTERED_DOMAINS = (process.env.EDGE_LANG_LIVE_SITES_FILTER || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

async function waitForServiceWorker(context) {
  const existingWorker = context.serviceWorkers()[0];
  if (existingWorker) {
    return existingWorker;
  }
  return await context.waitForEvent('serviceworker', { timeout: 15000 });
}

async function configureExtensionForLiveSiteChecks(worker) {
  await worker.evaluate(async () => {
    function storageSet(area, values) {
      return new Promise((resolve) => chrome.storage[area].set(values, resolve));
    }

    await storageSet('sync', {
      enabled: true,
      nativeLanguage: 'en',
      targetLanguage: 'es',
      apiKeys: { openai: 'edgelang-live-site-test-key' },
      modelSelection: { 'edge-detection': 'gpt-4o-mini', classification: 'gpt-4o-mini' },
      siteMode: 'blacklist',
      siteList: { blacklist: [], whitelist: [] },
      autoDetectLanguage: true,
      modePreference: 'passive',
      isPaused: false,
      questionIntensity: 5,
      recallIntensity: 10,
      multipleChoiceCount: 4,
      quotaExhausted: false
    });

    await storageSet('local', {
      debugLog: [],
      learnerProfile: {
        level: 'intermediate',
        vocabulary: {},
        resolvedItems: [],
        confusionPatterns: [],
        recentInteractions: [],
        conceptPerformance: {},
        stats: {
          totalAnswered: 0,
          correctAnswers: 0,
          streak: 0,
          lastActive: null,
          averageLatencyMs: 0
        }
      }
    });

    if (!globalThis.__edgelangLiveSiteFetchStubInstalled) {
      const originalFetch = globalThis.fetch.bind(globalThis);
      const stopWords = new Set([
        'about', 'after', 'again', 'also', 'being', 'below', 'could', 'first',
        'from', 'have', 'into', 'just', 'more', 'most', 'other', 'should',
        'their', 'there', 'these', 'those', 'through', 'under', 'which',
        'while', 'with', 'would'
      ]);

      function makeResponse(payload, headers = { 'Content-Type': 'application/json' }) {
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers
        });
      }

      function getPromptFromRequest(init) {
        if (typeof init?.body !== 'string') {
          return '';
        }
        try {
          const parsed = JSON.parse(init.body);
          return parsed.messages?.[0]?.content
            || parsed.contents?.[0]?.parts?.[0]?.text
            || parsed.input
            || '';
        } catch {
          return '';
        }
      }

      function detectLanguageFromPrompt(prompt) {
        const sample = prompt.split('\n\n').slice(-1)[0] || prompt;
        if (/[\u4e00-\u9fff]/u.test(sample)) return 'zh';
        if (/[\u3040-\u30ff]/u.test(sample)) return 'ja';
        if (/[\uac00-\ud7af]/u.test(sample)) return 'ko';
        if (/[\u0400-\u04ff]/u.test(sample)) return 'ru';
        if (/[\u0590-\u05ff]/u.test(sample)) return 'he';
        if (/[\u0600-\u06ff]/u.test(sample)) return 'ar';
        return 'en';
      }

      function getBlocks(prompt) {
        const matches = [...prompt.matchAll(/\[Block\s+(\d+)\]\s+([^\n]+)/g)];
        return matches.map((match) => ({
          index: Number(match[1]),
          text: match[2].trim()
        }));
      }

      function getCandidateTerms(text) {
        const matches = text.match(/\p{L}[\p{L}\p{M}'’-]{2,}/gu) || [];
        return matches
          .map((value) => value.trim())
          .filter((value, index, array) =>
            value.length >= 4 &&
            !stopWords.has(value.toLowerCase()) &&
            array.indexOf(value) === index
          );
      }

      function buildCuePayload(prompt) {
        const blocks = getBlocks(prompt);
        const sourceBlocks = blocks.length
          ? blocks
          : [{ index: 1, text: prompt.slice(-1000).replace(/\s+/g, ' ').trim() }];
        const cues = [];

        for (const block of sourceBlocks) {
          const candidates = getCandidateTerms(block.text);
          for (const term of candidates.slice(0, 2)) {
            cues.push({
              text: term,
              displayText: `es:${term.toLowerCase()}`,
              translation: `meaning of ${term}`,
              correctAnswer: `meaning of ${term}`,
              nativeMeaning: `${term} as used in this excerpt`,
              distractors: [
                `${term} option 1`,
                `${term} option 2`,
                `${term} option 3`,
                `${term} option 4`
              ],
              blockIndex: block.index,
              contextExcerpt: block.text.slice(0, 180)
            });
          }
          if (cues.length >= 3) {
            break;
          }
        }

        if (!cues.length) {
          cues.push({
            text: 'Page',
            displayText: 'es:page',
            translation: 'meaning of Page',
            correctAnswer: 'meaning of Page',
            nativeMeaning: 'Page as used in this excerpt',
            distractors: ['Page option 1', 'Page option 2', 'Page option 3', 'Page option 4'],
            blockIndex: sourceBlocks[0]?.index || 1,
            contextExcerpt: sourceBlocks[0]?.text?.slice(0, 180) || 'Page excerpt'
          });
        }

        return JSON.stringify(cues);
      }

      globalThis.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input?.url || '';
        if (!/api\.openai\.com|api\.groq\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|openrouter\.ai/u.test(url)) {
          return originalFetch(input, init);
        }

        if (/audio\/speech/u.test(url)) {
          return new Response(new Uint8Array([1, 2, 3]).buffer, {
            status: 200,
            headers: { 'Content-Type': 'audio/mpeg' }
          });
        }

        const prompt = getPromptFromRequest(init);
        const content = /What language is this\?/u.test(prompt)
          ? detectLanguageFromPrompt(prompt)
          : buildCuePayload(prompt);

        if (/api\.anthropic\.com/u.test(url)) {
          return makeResponse({ content: [{ text: content }] });
        }
        if (/generativelanguage\.googleapis\.com/u.test(url)) {
          return makeResponse({ candidates: [{ content: { parts: [{ text: content }] } }] });
        }

        return makeResponse({ choices: [{ message: { content } }] });
      };

      globalThis.__edgelangLiveSiteFetchStubInstalled = true;
    }
  });
}

async function clearDebugLog(worker) {
  await worker.evaluate(async () => {
    await new Promise((resolve) => chrome.storage.local.set({ debugLog: [] }, resolve));
  });
}

async function getDebugLog(worker) {
  return await worker.evaluate(async () => {
    return await new Promise((resolve) => {
      chrome.storage.local.get(['debugLog'], (result) => resolve(result.debugLog || []));
    });
  });
}

async function waitForSiteOutcome(page, worker) {
  const deadline = Date.now() + 15000;
  let latestState = null;
  let latestLog = [];

  while (Date.now() < deadline) {
    latestState = await page.evaluate(() =>
      typeof window.__edgelangGetState === 'function' ? window.__edgelangGetState() : null
    ).catch(() => null);
    latestLog = await getDebugLog(worker);

    const analyzeRequest = latestLog.find((entry) => entry.event === 'message:analyzePage');
    const analyzeComplete = latestLog.find((entry) => entry.event === 'analyze:complete');
    const analyzeError = latestLog.find((entry) => entry.event === 'analyze:error');
    const blocked = latestLog.find((entry) => entry.event === 'process:blocked' || entry.event === 'analyze:blocked');

    if (analyzeRequest && (analyzeComplete || analyzeError || blocked)) {
      break;
    }

    await page.waitForTimeout(500);
  }

  return { state: latestState, debugLog: latestLog };
}

test.describe('Top Site Fixture', () => {
  test('contains 20 real top-traffic sites with unique domains', async () => {
    expect(TOP_SITES).toHaveLength(20);

    const ranks = TOP_SITES.map((entry) => entry.rank);
    const domains = TOP_SITES.map((entry) => entry.domain);
    const urls = TOP_SITES.map((entry) => entry.url);

    expect(ranks).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(new Set(domains).size).toBe(20);
    expect(urls.every((url) => /^https:\/\//.test(url))).toBe(true);
    expect(TOP_SITES.every((entry) => /Similarweb/u.test(entry.source))).toBe(true);
  });
});

test.describe('Live Top Site Compatibility', () => {
  test.skip(!RUN_LIVE_SITE_COMPAT, 'Set EDGE_LANG_LIVE_SITES=1 to run live-site browser coverage.');

  test('extension extracts and highlights content across the curated top 20 sites', async ({ registerDebugContext }) => {
    test.slow();
    test.setTimeout(240000);
    const sitesToRun = FILTERED_DOMAINS.length
      ? TOP_SITES.filter((site) => FILTERED_DOMAINS.includes(site.domain.toLowerCase()))
      : TOP_SITES;

    const userDataDir = path.join(os.tmpdir(), `edgelang-live-sites-${Date.now()}`);
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`]
    });
    registerDebugContext(context);

    const failures = [];
    const results = [];

    try {
      const worker = await waitForServiceWorker(context);
      await configureExtensionForLiveSiteChecks(worker);

      const page = context.pages().find((candidate) => candidate.url().startsWith('http')) || await context.newPage();

      for (const site of sitesToRun) {
        await test.step(`${site.rank}. ${site.domain}`, async () => {
          try {
            await clearDebugLog(worker);
            await page.goto(site.url, { waitUntil: 'commit', timeout: 45000 });
            await page.waitForTimeout(5000);

            const cueCount = await page.locator('.edgelang-cue').count().catch(() => 0);
            const bodyTextLength = await page.evaluate(() => document.body?.innerText?.length || 0).catch(() => 0);
            const { state, debugLog } = await waitForSiteOutcome(page, worker);
            const analyzeRequest = debugLog.find((entry) => entry.event === 'message:analyzePage');
            const analyzeComplete = debugLog.find((entry) => entry.event === 'analyze:complete');
            const analyzeError = debugLog.find((entry) => entry.event === 'analyze:error');
            const blocked = debugLog.find((entry) => entry.event === 'process:blocked' || entry.event === 'analyze:blocked');
            const processStarted = debugLog.some((entry) => entry.event === 'process:start');
            const extraction = state?.lastExtraction || {};

            const result = {
              domain: site.domain,
              url: page.url(),
              cueCount,
              bodyTextLength,
              blockCount: extraction.blockCount || analyzeRequest?.details?.textBlockCount || 0,
              blocker: state?.blockerReason || blocked?.details?.reason || null,
              analyzeError: analyzeError?.details?.message || null,
              status: 'failed'
            };

            const hasMeaningfulExtraction = result.blockCount > 0 || bodyTextLength > 100;
            const hasHighlights = cueCount > 0 || (analyzeComplete?.details?.cueCount || 0) > 0;
            const attachedOnly = processStarted && (bodyTextLength > 100 || Boolean(state));
            result.status = hasHighlights && hasMeaningfulExtraction
              ? 'compatible'
              : attachedOnly
                ? 'attached-only'
                : 'failed';
            results.push(result);

            if (result.status === 'failed' || result.analyzeError || (result.blocker && result.status !== 'compatible')) {
              failures.push({
                ...result,
                analyzeRequest: analyzeRequest?.details || null,
                analyzeComplete: analyzeComplete?.details || null,
                lastEvents: debugLog.slice(-8)
              });
            }
          } catch (error) {
            const result = {
              domain: site.domain,
              url: site.url,
              cueCount: 0,
              bodyTextLength: 0,
              blockCount: 0,
              blocker: null,
              analyzeError: error.message,
              status: 'failed'
            };
            results.push(result);
            failures.push({
              ...result,
              lastEvents: []
            });
          }
        });
      }
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }

    const compatibleCount = results.filter((entry) => entry.status === 'compatible').length;
    const minimumCompatibleCount = FILTERED_DOMAINS.length
      ? 0
      : Math.max(results.length - 2, Math.ceil(results.length * 0.8));

    console.log(`[EdgeLang live sites] compatible=${compatibleCount}/${results.length}`);
    console.log(`[EdgeLang live sites] results=${JSON.stringify(results, null, 2)}`);

    expect(compatibleCount, `Live-site compatibility summary:\n${JSON.stringify(results, null, 2)}`).toBeGreaterThanOrEqual(minimumCompatibleCount);
    expect(failures, `Live-site failures:\n${JSON.stringify({ results, failures }, null, 2)}`).toEqual([]);
  });
});
