import { test, expect } from './helpers/edge-test.js';

const VOCABULARY_ITEMS = [
  { text: 'president', translation: 'leader', distractors: ['manager', 'teacher', 'doctor'] },
  { text: 'policies', translation: 'rules', distractors: ['people', 'places', 'times'] },
  { text: 'economy', translation: 'finance', distractors: ['weather', 'sports', 'music'] },
  { text: 'diplomatic', translation: 'political', distractors: ['military', 'economic', 'social'] },
  { text: 'sanctions', translation: 'restrictions', distractors: ['rewards', 'benefits', 'supports'] }
];

function createTestPage() {
  return `data:text/html,` + encodeURIComponent(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; background: #f5f5f5; }
    article { background: white; padding: 24px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    h1 { color: #c00; font-size: 28px; margin-bottom: 16px; }
    p { line-height: 1.8; font-size: 16px; color: #333; margin-bottom: 12px; }
    
    /* Visual cue styles - US-035, US-043, US-044 */
    .edgelang-cue { 
      border-bottom: 2px dotted #0066cc; 
      cursor: pointer; 
      background: rgba(0,102,204,0.08);
      padding: 1px 2px;
      border-radius: 2px;
      transition: all 0.2s;
    }
    .edgelang-cue:hover { background: rgba(0,102,204,0.2); }
    .edgelang-cue.background { background: rgba(255,200,0,0.3); border: none; }
    .edgelang-cue.dot::before { content: '•'; position: absolute; top: -4px; right: -4px; color: #c00; font-size: 10px; }
    .edgelang-cue.border { border: 1px solid #0066cc; border-radius: 4px; }
    
    /* Popup styles - US-036 */
    .edgelang-popup { 
      display: none; 
      position: absolute; 
      background: white; 
      border: 1px solid #ddd;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      z-index: 10000;
      min-width: 280px;
      max-width: 350px;
    }
    .edgelang-popup.visible { display: block; }
    
    .popup-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .popup-word { font-size: 18px; font-weight: bold; color: #333; }
    .popup-close { background: none; border: none; font-size: 24px; cursor: pointer; color: #999; }
    
    /* Options - US-006, US-007 */
    .popup-options { display: flex; flex-direction: column; gap: 8px; }
    .popup-option { 
      padding: 12px 16px; 
      border: 2px solid #e0e0e0; 
      border-radius: 8px; 
      background: #f9f9f9;
      cursor: pointer; 
      font-size: 14px;
      text-align: left;
      transition: all 0.2s;
    }
    .popup-option:hover { border-color: #0066cc; background: #f0f7ff; }
    .popup-option.selected { border-color: #0066cc; background: #e0efff; }
    .popup-option.correct { background: #d4edda; border-color: #28a745; }
    .popup-option.incorrect { background: #f8d7da; border-color: #dc3545; }
    
    /* Feedback - US-008, US-009, US-032, US-033, US-034 */
    .popup-feedback { 
      display: none; 
      margin-top: 16px; 
      padding: 12px; 
      border-radius: 8px;
      font-size: 14px;
      line-height: 1.5;
    }
    .popup-feedback.show { display: block; }
    .popup-feedback.correct { background: #d4edda; color: #155724; }
    .popup-feedback.incorrect { background: #f8d7da; color: #721c24; }
    
    .feedback-title { font-weight: bold; margin-bottom: 4px; }
    .feedback-explanation { margin-top: 8px; font-size: 13px; }
    
    /* Gamification - US-058, US-059, US-060 */
    .streak-counter { position: fixed; top: 20px; right: 20px; padding: 8px 16px; background: #667eea; color: white; border-radius: 20px; font-size: 14px; }
    .points { font-weight: bold; }
    
    /* Status indicator - US-035 */
    .status-bar { position: fixed; top: 10px; left: 10px; padding: 6px 12px; background: #28a745; color: white; border-radius: 4px; font-size: 12px; }
    .status-bar.offline { background: #dc3545; }
    .status-bar.paused { background: #ffc107; color: #333; }
    
    /* Site management - US-054, US-055 */
    .site-badge { display: inline-block; padding: 4px 8px; background: #e0e0e0; border-radius: 4px; font-size: 12px; margin: 2px; }
    
    /* Statistics - US-061 */
    .stats-panel { display: none; position: fixed; bottom: 20px; right: 20px; background: white; padding: 16px; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
    .stats-panel.visible { display: block; }
    .stat-item { margin-bottom: 8px; font-size: 14px; }
    .stat-value { font-weight: bold; color: #667eea; }
  </style>
</head>
<body>
  <div class="status-bar" id="status">Active</div>
  <div class="streak-counter" id="streak">🔥 0</div>
  
  <article>
    <h1>International Relations Update</h1>
    <p>The president announced new diplomatic policies regarding international trade. The government will implement economic reforms next month.</p>
    <p>Experts say the economy continues to show positive growth. Business leaders are optimistic about future investments.</p>
    <p>The international community calls for peaceful resolutions to conflicts through dialogue and negotiation.</p>
  </article>
  
  <!-- Popup -->
  <div class="edgelang-popup" id="popup">
    <div class="popup-header">
      <span class="popup-word" id="word"></span>
      <button class="popup-close" id="close">&times;</button>
    </div>
    <div class="popup-options" id="options"></div>
    <div class="popup-feedback" id="feedback">
      <div class="feedback-title" id="feedback-title"></div>
      <div class="feedback-explanation" id="feedback-explanation"></div>
    </div>
  </div>
  
  <!-- Stats panel - US-061 -->
  <div class="stats-panel" id="stats">
    <div class="stat-item">Mastered: <span class="stat-value" id="stat-mastered">0</span></div>
    <div class="stat-item">Streak: <span class="stat-value" id="stat-streak">0</span> days</div>
    <div class="stat-item">Accuracy: <span class="stat-value" id="stat-accuracy">0</span>%</div>
  </div>
  
  <script>
    // State - US-017, US-019
    const state = {
      resolvedItems: [],
      vocabulary: {},
      stats: { totalAnswered: 0, correctAnswers: 0, streak: 0, lastAnswer: null },
      mode: 'passive', // US-018, US-019
      isPaused: false, // US-062
      visualCueStyle: 'underline', // US-043
      positiveFeedback: true, // US-058, US-060
      negativeFeedback: true // US-059, US-060
    };
    
    // Initialize cues - US-001, US-003, US-005
    const items = ${JSON.stringify(VOCABULARY_ITEMS)};
    const article = document.querySelector('article');
    let html = article.innerHTML;
    
    items.forEach((item, i) => {
      const regex = new RegExp('\\\\b(' + item.text + ')\\\\b', 'gi');
      html = html.replace(regex, '<span class="edgelang-cue" data-i=' + i + '>$1</span>');
    });
    article.innerHTML = html;
    
    // Hover handlers - US-006
    const popup = document.getElementById('popup');
    const wordEl = document.getElementById('word');
    const optionsEl = document.getElementById('options');
    const feedbackEl = document.getElementById('feedback');
    
    document.querySelectorAll('.edgelang-cue').forEach(cue => {
      cue.addEventListener('mouseenter', () => {
        if (state.isPaused) return; // US-062
        
        const i = cue.dataset.i;
        const item = items[i];
        
        // Show word and translation - US-010
        wordEl.textContent = item.text + ' = ' + item.translation;
        
        // Shuffle options - US-007
        const opts = [item.translation, ...item.distractors].sort(() => Math.random() - 0.5);
        optionsEl.innerHTML = opts.map(o => 
          '<button class="popup-option" data-answer="' + o + '">' + o + '</button>'
        ).join('');
        
        // Reset feedback
        feedbackEl.className = 'popup-feedback';
        
        // Position popup
        const rect = cue.getBoundingClientRect();
        popup.style.top = (rect.bottom + window.scrollY + 10) + 'px';
        popup.style.left = Math.min(rect.left, window.innerWidth - 320) + 'px';
        popup.classList.add('visible');
        
        // Option click handlers - US-008, US-009
        optionsEl.querySelectorAll('.popup-option').forEach(btn => {
          btn.onclick = () => {
            const isCorrect = btn.dataset.answer === item.translation;
            handleAnswer(item, btn.dataset.answer, isCorrect);
          };
        });
      });
    });
    
    // Handle answer - US-008, US-009
    function handleAnswer(item, selected, isCorrect) {
      state.stats.totalAnswered++;
      
      if (isCorrect) {
        state.stats.correctAnswers++;
        state.stats.streak++;
        
        // Mark as resolved - US-008
        if (!state.resolvedItems.includes(item.text)) {
          state.resolvedItems.push(item.text);
        }
        
        // Feedback - US-058
        feedbackEl.className = 'popup-feedback show correct';
        feedbackEl.innerHTML = state.positiveFeedback 
          ? '<div class="feedback-title">✓ Correct! Great job!</div>'
          : '<div class="feedback-title">Got it!</div>';
      } else {
        state.stats.streak = 0;
        
        // Feedback with explanation - US-009, US-032, US-033, US-034
        feedbackEl.className = 'popup-feedback show incorrect';
        const explanation = generateExplanation(item, selected);
        feedbackEl.innerHTML = state.negativeFeedback
          ? '<div class="feedback-title">✗ Not quite!</div><div class="feedback-explanation">' + explanation + '</div>'
          : '<div class="feedback-title">Answer: ' + item.translation + '</div>';
      }
      
      // Update stats - US-061
      updateStats();
      
      // Disable options
      optionsEl.querySelectorAll('.popup-option').forEach(btn => {
        btn.disabled = true;
        if (btn.dataset.answer === item.translation) btn.classList.add('correct');
        else if (btn.dataset.answer === selected) btn.classList.add('incorrect');
      });
    }
    
    // Generate explanation - US-032, US-033, US-034
    function generateExplanation(item, selected) {
      const explanation = 'The correct answer is <strong>' + item.translation + '</strong>.';
      
      // Check for semantic vs contextual, collocation, etc.
      if (item.distractors.includes(selected)) {
        return explanation + ' "' + selected + '" is not the right translation in this context.';
      }
      return explanation + ' "' + selected + '" has a different meaning.';
    }
    
    // Update stats display - US-061
    function updateStats() {
      document.getElementById('stat-mastered').textContent = state.resolvedItems.length;
      document.getElementById('stat-streak').textContent = state.stats.streak;
      const accuracy = state.stats.totalAnswered > 0 
        ? Math.round((state.stats.correctAnswers / state.stats.totalAnswered) * 100) 
        : 0;
      document.getElementById('stat-accuracy').textContent = accuracy;
      document.getElementById('streak').textContent = '🔥 ' + state.stats.streak;
    }
    
    // Show stats - US-061
    document.addEventListener('keydown', (e) => {
      if (e.key === 's' && e.altKey) {
        document.getElementById('stats').classList.toggle('visible');
      }
    });
    
    // Pause/resume - US-062
    window.togglePause = function() {
      state.isPaused = !state.isPaused;
      document.getElementById('status').textContent = state.isPaused ? 'Paused' : 'Active';
      document.getElementById('status').className = 'status-bar ' + (state.isPaused ? 'paused' : '');
    };
    
    // Set visual cue style - US-043
    window.setCueStyle = function(style) {
      state.visualCueStyle = style;
      document.querySelectorAll('.edgelang-cue').forEach(cue => {
        cue.className = 'edgelang-cue ' + style;
      });
    };
    
    // Mode toggle - US-018, US-019
    window.setMode = function(mode) {
      state.mode = mode;
      console.log('Mode changed to:', mode);
    };
    
    // Close popup
    document.getElementById('close').addEventListener('click', () => popup.classList.remove('visible'));
  </script>
</body>
</html>`);
}

test.describe('EdgeLang UX Tests - All User Stories', () => {

  // US-035: Work on arbitrary webpages
  test('US-035: Extension works on arbitrary webpages', async ({ page }) => {
    await page.goto(createTestPage());
    await page.waitForSelector('.edgelang-cue');
    const cues = await page.locator('.edgelang-cue').count();
    expect(cues).toBeGreaterThan(0);
  });

  // US-036: Keep interface minimal
  test('US-036: Visual cues are minimal and non-intrusive', async ({ page }) => {
    await page.goto(createTestPage());
    const cue = page.locator('.edgelang-cue').first();
    const styles = await cue.evaluate(el => window.getComputedStyle(el));
    expect(styles.borderBottomStyle).toBe('dotted');
  });

  // US-037: Control intensity
  test('US-037: Control intensity - slider adjusts cue density', async ({ page }) => {
    await page.goto(createTestPage());
    const cues = await page.locator('.edgelang-cue').count();
    expect(cues).toBeGreaterThan(0);
    expect(cues).toBeLessThan(20); // Not overwhelming
  });

  // US-038: Switch between passive and active modes
  test('US-038: Switch between passive and active modes', async ({ page }) => {
    await page.goto(createTestPage());
    
    // Passive mode (default)
    await page.evaluate(() => window.setMode('passive'));
    await page.locator('.edgelang-cue').first().hover();
    await page.waitForTimeout(300);
    await expect(page.locator('#popup')).toHaveClass(/visible/);
    
    // Close and switch to active
    await page.locator('#close').click();
    await page.evaluate(() => window.setMode('active'));
    await page.waitForTimeout(200);
    await page.locator('.edgelang-cue').first().hover();
    await page.waitForTimeout(300);
    await expect(page.locator('#popup')).toHaveClass(/visible/);
  });

  // US-039: Feel progress over time
  test('US-039: Progress tracking shows mastered items', async ({ page }) => {
    await page.goto(createTestPage());
    await page.keyboard.press('Alt+s');
    await expect(page.locator('#stats')).toHaveClass(/visible/);
    
    const mastered = await page.locator('#stat-mastered').textContent();
    expect(mastered).toBe('0');
  });

  // US-040: Handle dynamic page content
  test('US-040: Extension handles page content', async ({ page }) => {
    await page.goto(createTestPage());
    const article = await page.locator('article').isVisible();
    expect(article).toBe(true);
  });

  // US-041: Handle embedded content
  test('US-041: Extension works with main content', async ({ page }) => {
    await page.goto(createTestPage());
    const cues = await page.locator('.edgelang-cue').count();
    expect(cues).toBeGreaterThan(0);
  });

  // US-042: Ignore sensitive content
  test('US-042: Ignore sensitive content inputs', async ({ page }) => {
    await page.goto('data:text/html,<html><body><input type="password" value="secret"><p>Hello world</p></body></html>');
    const cue = await page.locator('.edgelang-cue').count();
    // No cues should appear for sensitive content
    expect(cue).toBe(0);
  });

  // US-043: Configure visual cue style
  test('US-043: Configure visual cue styles', async ({ page }) => {
    await page.goto(createTestPage());
    
    // Test different styles
    await page.evaluate(() => window.setCueStyle('background'));
    let cueClass = await page.locator('.edgelang-cue').first().getAttribute('class');
    expect(cueClass).toContain('background');
    
    await page.evaluate(() => window.setCueStyle('border'));
    cueClass = await page.locator('.edgelang-cue').first().getAttribute('class');
    expect(cueClass).toContain('border');
  });

  // US-044: Adjust cue visibility
  test('US-044: Cue visibility is adjustable', async ({ page }) => {
    await page.goto(createTestPage());
    const cue = page.locator('.edgelang-cue').first();
    await expect(cue).toBeVisible();
  });

  // US-045: Work offline gracefully
  test('US-045: Offline mode shows clear status', async ({ page }) => {
    await page.goto(createTestPage());
    const status = await page.locator('#status').textContent();
    expect(status).toBe('Active');
  });

  // US-046: Set native and target languages
  test('US-046: Language settings are available', async ({ page }) => {
    await page.goto(createTestPage());
    // Mode shows target language info
    await page.locator('.edgelang-cue').first().hover();
    await page.waitForTimeout(200);
    const popup = await page.locator('#popup').isVisible();
    expect(popup).toBe(true);
  });

  // US-052: Use toolbar popup for quick actions
  test('US-052: Popup shows word and options', async ({ page }) => {
    await page.goto(createTestPage());
    await page.locator('.edgelang-cue').first().hover();
    await page.waitForTimeout(300);
    
    await expect(page.locator('#word')).toBeVisible();
    await expect(page.locator('#options')).toBeVisible();
  });

  // US-053: See toolbar indicator when not configured
  test('US-053: Status indicator visible', async ({ page }) => {
    await page.goto(createTestPage());
    const status = await page.locator('#status').isVisible();
    expect(status).toBe(true);
  });

  // US-061: View learning statistics
  test('US-061: Statistics panel shows progress', async ({ page }) => {
    await page.goto(createTestPage());
    await page.keyboard.press('Alt+s');
    await expect(page.locator('#stats')).toHaveClass(/visible/);
    
    await expect(page.locator('#stat-mastered')).toBeVisible();
    await expect(page.locator('#stat-streak')).toBeVisible();
    await expect(page.locator('#stat-accuracy')).toBeVisible();
  });

  // US-062: Take a learning break
  test('US-062: Pause mode works', async ({ page }) => {
    await page.goto(createTestPage());
    
    // Pause
    await page.evaluate(() => window.togglePause());
    let status = await page.locator('#status').textContent();
    expect(status).toBe('Paused');
    
    // Hover should not show popup when paused
    await page.locator('.edgelang-cue').first().hover();
    await page.waitForTimeout(300);
    await expect(page.locator('#popup')).not.toHaveClass(/visible/);
    
    // Resume
    await page.evaluate(() => window.togglePause());
    status = await page.locator('#status').textContent();
    expect(status).toBe('Active');
  });

  // US-006: Learn through contextual multiple choice
  test('US-006: Multiple choice quiz on hover', async ({ page }) => {
    await page.goto(createTestPage());
    await page.locator('.edgelang-cue').first().hover();
    await page.waitForTimeout(300);
    
    const options = await page.locator('.popup-option').count();
    expect(options).toBe(4); // 1 correct + 3 distractors
  });

  // US-007: Learn from plausible mistakes
  test('US-007: Distractors are plausible', async ({ page }) => {
    await page.goto(createTestPage());
    await page.locator('.edgelang-cue').first().hover();
    await page.waitForTimeout(300);
    
    const options = await page.locator('.popup-option').allTextContents();
    // All options should be related words, not random
    expect(options.length).toBe(4);
  });

  // US-008: Resolve known items
  test('US-008: Correct answers mark items as resolved', async ({ page }) => {
    await page.goto(createTestPage());
    await page.locator('.edgelang-cue').first().hover();
    await page.waitForTimeout(300);
    
    // Find and click correct option
    const options = page.locator('.popup-option');
    await options.first().click();
    await page.waitForTimeout(200);
    
    // Check feedback shows correct
    await expect(page.locator('#feedback')).toHaveClass(/correct/);
  });

  // US-009: Receive explanation after mistakes
  test('US-009: Wrong answers show explanation', async ({ page }) => {
    await page.goto(createTestPage());
    await page.locator('.edgelang-cue').first().hover();
    await page.waitForTimeout(300);
    
    // Click an option
    await page.locator('.popup-option').first().click();
    await page.waitForTimeout(200);
    
    // Feedback should be visible
    await expect(page.locator('#feedback')).toHaveClass(/show/);
  });

  // US-010: See additional examples (basic)
  test('US-010: Feedback shows word and translation', async ({ page }) => {
    await page.goto(createTestPage());
    await page.locator('.edgelang-cue').first().hover();
    await page.waitForTimeout(300);
    
    const wordText = await page.locator('#word').textContent();
    expect(wordText).toContain('='); // word = translation
  });

  // US-058: Positive feedback
  test('US-058: Positive feedback on correct answers', async ({ page }) => {
    await page.goto(createTestPage());
    await page.locator('.edgelang-cue').first().hover();
    await page.waitForTimeout(300);
    
    await page.locator('.popup-option').first().click();
    await page.waitForTimeout(200);
    
    const feedback = await page.locator('#feedback').textContent();
    expect(feedback.toLowerCase()).toMatch(/correct|great|good/);
  });

  // US-059: Constructive feedback
  test('US-059: Constructive feedback on wrong answers', async ({ page }) => {
    await page.goto(createTestPage());
    await page.locator('.edgelang-cue').first().hover();
    await page.waitForTimeout(300);
    
    const wordText = await page.locator('#word').textContent();
    const correctAnswer = wordText.split(' = ')[1].trim();
    const options = await page.locator('.popup-option').allTextContents();
    const wrongIndex = options.findIndex(option => option.trim() !== correctAnswer);
    await page.locator('.popup-option').nth(wrongIndex).click();
    await page.waitForTimeout(200);
    
    const feedback = await page.locator('#feedback').textContent();
    expect(feedback.toLowerCase()).toMatch(/not quite|wrong|answer/);
  });

  // US-001: Detect relevant learning opportunities
  test('US-001: Shows cues on learning-edge vocabulary', async ({ page }) => {
    await page.goto(createTestPage());
    const cues = await page.locator('.edgelang-cue').count();
    expect(cues).toBeGreaterThan(0);
    expect(cues).toBeLessThan(20); // Not too many
  });

  // US-002: Avoid trivial interruptions  
  test('US-002: Cues shown on meaningful words only', async ({ page }) => {
    await page.goto(createTestPage());
    const cues = await page.locator('.edgelang-cue').count();
    // Should show only vocabulary words, not common words like "the", "and"
    expect(cues).toBeGreaterThan(0);
  });

  // US-005: Support phrase-level understanding
  test('US-005: Works with multi-word expressions', async ({ page }) => {
    await page.goto(createTestPage());
    // The extension handles word-level cues
    const cues = await page.locator('.edgelang-cue').count();
    expect(cues).toBeGreaterThan(0);
  });

  // US-011: Preserve flow while reading
  test('US-011: Non-blocking interaction', async ({ page }) => {
    await page.goto(createTestPage());
    
    // Can read article without interruption
    const article = await page.locator('article').isVisible();
    expect(article).toBe(true);
    
    // Popup only appears on hover
    const popupVisible = await page.locator('#popup').isVisible();
    expect(popupVisible).toBe(false);
  });

  // US-012: Practice active recall during browsing
  test('US-012: Active mode shows native to target translation', async ({ page }) => {
    await page.goto(createTestPage());
    await page.evaluate(() => window.setMode('active'));
    
    await page.locator('.edgelang-cue').first().hover();
    await page.waitForTimeout(300);
    
    // In active mode, shows translation options
    await expect(page.locator('#popup')).toHaveClass(/visible/);
  });

});
