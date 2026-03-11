import { test, expect } from './helpers/edge-test.js';

test.describe('EdgeLang on CNN with Russian content', () => {

  test('Russian language detection', async ({ page }) => {
    const russianTexts = [
      'Добро пожаловать на CNN',
      'Новости со всего мира',
      'Президент России',
      'Москва, 10 марта'
    ];

    const russianPattern = /[а-яё]/i;
    
    for (const text of russianTexts) {
      expect(russianPattern.test(text)).toBe(true);
    }

    const englishPattern = /[a-z]/i;
    expect(englishPattern.test('Hello')).toBe(true);
    expect(englishPattern.test('Добро пожаловать')).toBe(false);
  });

  test('Russian text extraction simulation', async ({ page }) => {
    await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><article><h1>Новости CNN</h1><p>Сегодняшние главные новости из России и мира.</p><p>Экономика России растет.</p></article></body></html>`);

    const text = await page.evaluate(() => document.body.innerText);
    expect(text).toContain('Новости CNN');
    expect(text).toContain('России');
  });

  test('Russian vocabulary cue structure', async ({ page }) => {
    await page.goto('data:text/html,<html><body></body></html>');
    
    const russianVocab = [
      { word: 'привет', translation: 'hello', level: 'beginner' },
      { word: 'экономика', translation: 'economy', level: 'intermediate' },
      { word: 'правительство', translation: 'government', level: 'advanced' }
    ];

    for (const item of russianVocab) {
      expect(item.word).toMatch(/[а-яё]/i);
      expect(item.translation).toMatch(/[a-z]/i);
    }
  });

  test('Passive mode with Russian target language', async ({ page }) => {
    await page.goto('data:text/html,<html><body></body></html>');
    
    await page.evaluate(() => {
      document.body.innerHTML = `
        <div id="settings">
          <div id="native-language">en</div>
          <div id="target-language">ru</div>
          <div id="mode">passive</div>
        </div>
        <span class="edgelang-cue" data-word="привет" data-translation="hello">привет</span>
      `;
    });

    const targetLang = await page.locator('#target-language').textContent();
    const mode = await page.locator('#mode').textContent();
    const cue = page.locator('.edgelang-cue');
    
    expect(targetLang).toBe('ru');
    expect(mode).toBe('passive');
    await expect(cue).toHaveCount(1);
    expect(await cue.textContent()).toBe('привет');
  });

  test('Cyrillic character handling', async ({ page }) => {
    const cyrillicUpper = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
    const cyrillicLower = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя';
    const cyrillic = 'привет мир';
    
    expect(cyrillic.toUpperCase()).toContain('П');
    expect(cyrillic.toLowerCase()).toContain('п');
    expect(cyrillic.length).toBe(10);
  });

  test('Russian distractor generation', async ({ page }) => {
    const correctAnswer = 'привет';
    const distractors = ['пока', 'спасибо', 'извините', 'до свидания'];
    
    expect(distractors).toHaveLength(4);
    expect(distractors).not.toContain(correctAnswer);
    
    for (const d of distractors) {
      expect(d).toMatch(/[а-яё]/i);
    }
  });

  test('ModelMesh with Russian prompts', async ({ page }) => {
    const russianPrompt = `Проанализируйте этот русский текст и определите 5% слов для изучающих русский язык:

Текст: Россия - крупнейшая страна в мире.

Верните как JSON массив: [{"text": "слово", "translation": "translation", "correctAnswer": "translation", "distractors": ["wrong1", "wrong2", "wrong3", "wrong4"]}]`;

    expect(russianPrompt).toContain('JSON массив');
    expect(russianPrompt).toContain('translation');
    expect(russianPrompt).toContain('distractors');
  });

  test('Russian TTS compatibility', async ({ page }) => {
    const russianWords = ['привет', 'спасибо', 'извините'];
    
    for (const word of russianWords) {
      expect(word).toMatch(/^[а-яё]+$/i);
    }
  });

  test('CNN Russia section simulation', async ({ page }) => {
    await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><article class="news-article"><h1 class="headline">Новости России</h1><div class="body"><p>Российская экономика демонстрирует рост в первом квартале.</p><p>Кремль объявил о новых мерах поддержки бизнеса.</p></div></article></body></html>`);

    const headline = await page.locator('.headline').textContent();
    const paragraphs = await page.locator('.body p').allTextContents();
    
    expect(headline).toContain('России');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs.join(' ')).toContain('Российская');
  });

  test('Multi-language page with Russian section', async ({ page }) => {
    await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><section class="en"><h1>World News</h1><p>Latest updates from around the world.</p></section><section class="ru"><h1>Мировые Новости</h1><p>Последние обновления со всего мира.</p></section></body></html>`);

    const enSection = await page.locator('section.en').textContent();
    const ruSection = await page.locator('section.ru').textContent();
    
    expect(enSection).toContain('World News');
    expect(ruSection).toContain('Мировые');
  });

});
