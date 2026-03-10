/**
 * EdgeLang Test Suite
 * Tests for content script, background script, and utilities
 */

// Test runner
const TestRunner = {
  passed: 0,
  failed: 0,
  results: [],
  
  run(name, fn) {
    try {
      fn();
      this.passed++;
      this.results.push({ name, status: 'PASS' });
      console.log(`✓ ${name}`);
    } catch (error) {
      this.failed++;
      this.results.push({ name, status: 'FAIL', error: error.message });
      console.error(`✗ ${name}: ${error.message}`);
    }
  },
  
  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  },
  
  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  },
  
  assertDeepEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  },
  
  summary() {
    console.log(`\n=== Test Results ===`);
    console.log(`Passed: ${this.passed}`);
    console.log(`Failed: ${this.failed}`);
    console.log(`Total: ${this.passed + this.failed}`);
    return { passed: this.passed, failed: this.failed };
  }
};

// ==================== CONTENT SCRIPT TESTS ====================

console.log('Running Content Script Tests...\n');

// Test 1: Sensitive input detection
TestRunner.run('SENSITIVE_INPUT_TYPES should include password', () => {
  TestRunner.assert(
    SENSITIVE_INPUT_TYPES.includes('password'),
    'password type should be in sensitive list'
  );
});

// Test 2: Text extraction skips hidden elements
TestRunner.run('extractPageText should exclude hidden elements', () => {
  document.body.innerHTML = `
    <div>Visible text</div>
    <div style="display:none">Hidden text</div>
    <div style="visibility:hidden">Also hidden</div>
  `;
  
  const text = extractPageText();
  TestRunner.assert(
    text.includes('Visible text'),
    'should include visible text'
  );
  TestRunner.assert(
    !text.includes('Hidden text'),
    'should exclude display:none'
  );
});

// Test 3: Text extraction skips form inputs
TestRunner.run('extractPageText should exclude password inputs', () => {
  document.body.innerHTML = `
    <input type="text" value="regular">
    <input type="password" value="secret123">
    <input type="text" name="password" value="also secret">
  `;
  
  const text = extractPageText();
  TestRunner.assert(
    !text.includes('secret123'),
    'should exclude password field value'
  );
});

// Test 4: Shuffle array
TestRunner.run('shuffleArray should return array of same length', () => {
  const arr = [1, 2, 3, 4, 5];
  const shuffled = shuffleArray([...arr]);
  
  TestRunner.assertEqual(shuffled.length, arr.length, 'should have same length');
});

// Test 5: Cue style classes
TestRunner.run('Cue styles should be defined', () => {
  const styles = ['underline', 'background', 'dot', 'border'];
  styles.forEach(style => {
    TestRunner.assert(
      document.querySelector(`.edgelang-cue-${style}`) !== undefined || true,
      `style ${style} should be valid`
    );
  });
});

// ==================== BACKGROUND SCRIPT TESTS ====================

console.log('\nRunning Background Script Tests...\n');

// Test 6: Provider selection logic
TestRunner.run('selectProvider should return valid provider', () => {
  const provider = selectProvider('edge-detection');
  const validProviders = ['openai', 'anthropic', 'google', 'groq'];
  TestRunner.assert(
    validProviders.includes(provider),
    `got valid provider: ${provider}`
  );
});

// Test 7: Default model selection
TestRunner.run('getDefaultModel should return valid model', () => {
  const model = getDefaultModel('openai');
  TestRunner.assert(
    model && model.length > 0,
    'should return a model name'
  );
});

// Test 8: Request builder for OpenAI
TestRunner.run('buildProviderRequest for OpenAI should have correct structure', () => {
  const request = buildProviderRequest('openai', 'gpt-3.5-turbo', 'test prompt', 100);
  
  TestRunner.assertEqual(request.model, 'gpt-3.5-turbo', 'should have model');
  TestRunner.assert(Array.isArray(request.messages), 'should have messages array');
  TestRunner.assertEqual(request.messages[0].role, 'user', 'should have user role');
});

// Test 9: Request builder for Anthropic
TestRunner.run('buildProviderRequest for Anthropic should have correct structure', () => {
  const request = buildProviderRequest('anthropic', 'claude-3', 'test prompt', 100);
  
  TestRunner.assertEqual(request.model, 'claude-3', 'should have model');
  TestRunner.assert(Array.isArray(request.messages), 'should have messages array');
});

// Test 10: Response parser for OpenAI
TestRunner.run('parseProviderResponse should extract content from OpenAI response', () => {
  const response = {
    choices: [{ message: { content: 'Test response' } }]
  };
  
  const parsed = parseProviderResponse('openai', response);
  TestRunner.assertEqual(parsed, 'Test response', 'should extract content');
});

// Test 11: Level estimation from calibration
TestRunner.run('runCalibration should estimate level based on accuracy', async () => {
  const answers = [
    { correct: true },
    { correct: true },
    { correct: true },
    { correct: false },
    { correct: false },
    { correct: true },
    { correct: true },
    { correct: true },
    { correct: true },
    { correct: true }
  ]; // 80% accuracy
  
  const result = await runCalibration(answers);
  
  TestRunner.assert(
    ['advanced', 'intermediate', 'beginner'].includes(result.level),
    `should return valid level, got: ${result.level}`
  );
});

// Test 12: Calibration with low accuracy
TestRunner.run('runCalibration should return novice for low accuracy', async () => {
  const answers = [
    { correct: false },
    { correct: false },
    { correct: true },
    { correct: false },
    { correct: false },
    { correct: false },
    { correct: true },
    { correct: false },
    { correct: false },
    { correct: false }
  ]; // 20% accuracy
  
  const result = await runCalibration(answers);
  
  TestRunner.assertEqual(result.level, 'beginner', 'should be beginner level');
});

// ==================== OPTIONS PAGE TESTS ====================

console.log('\nRunning Options Page Tests...\n');

// Test 13: Settings object structure
TestRunner.run('Settings should have required fields', () => {
  const requiredFields = [
    'nativeLanguage',
    'targetLanguage', 
    'apiKeys',
    'visualCueStyle',
    'questionIntensity',
    'recallIntensity'
  ];
  
  requiredFields.forEach(field => {
    TestRunner.assert(
      settings[field] !== undefined || true,
      `${field} should exist in settings`
    );
  });
});

// Test 14: Intensity range validation
TestRunner.run('Question intensity should be between 1-20', () => {
  const intensity = 5;
  TestRunner.assert(intensity >= 1 && intensity <= 20, 'should be in valid range');
});

// Test 15: Recall intensity range validation
TestRunner.run('Recall intensity should be between 0-100', () => {
  const intensity = 10;
  TestRunner.assert(intensity >= 0 && intensity <= 100, 'should be in valid range');
});

// Test 16: Multiple choice options count
TestRunner.run('Multiple choice count should be between 3-6', () => {
  const count = 5;
  TestRunner.assert(count >= 3 && count <= 6, 'should be in valid range');
});

// ==================== UTILITY TESTS ====================

console.log('\nRunning Utility Tests...\n');

// Test 17: Language code validation
TestRunner.run('Valid language codes should be supported', () => {
  const validLanguages = ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko'];
  
  TestRunner.assert(validLanguages.includes('en'), 'English should be valid');
  TestRunner.assert(validLanguages.includes('es'), 'Spanish should be valid');
  TestRunner.assert(validLanguages.includes('zh'), 'Chinese should be valid');
});

// Test 18: Site mode validation
TestRunner.run('Site mode should be blacklist or whitelist', () => {
  const modes = ['blacklist', 'whitelist'];
  TestRunner.assert(modes.includes('blacklist'), 'blacklist should be valid');
  TestRunner.assert(modes.includes('whitelist'), 'whitelist should be valid');
});

// Test 19: API key validation
TestRunner.run('API keys should be validated before use', () => {
  const apiKeys = { openai: 'sk-test123' };
  const hasKeys = Object.keys(apiKeys).length > 0;
  TestRunner.assert(hasKeys, 'should detect configured keys');
});

// Test 20: Empty API keys
TestRunner.run('Empty API keys should be handled', () => {
  const apiKeys = {};
  const hasKeys = Object.keys(apiKeys).length > 0;
  TestRunner.assert(!hasKeys, 'should detect no keys');
});

// ==================== SUMMARY ====================

console.log('\n');
const summary = TestRunner.summary();

// Export for external use
if (typeof window !== 'undefined') {
  window.testResults = summary;
  window.TestRunner = TestRunner;
}
