const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_SETTINGS,
  getApiPermissionPattern,
  normalizeDisabledDomains,
  normalizeBaseUrl,
  validateSettings
} = require('../storage.js');

test('normalizeBaseUrl trims trailing slash', () => {
  assert.equal(normalizeBaseUrl('https://example.com/v1///'), 'https://example.com/v1');
});

test('validateSettings rejects incomplete settings', () => {
  const result = validateSettings({
    apiKey: '',
    baseUrl: 'nope',
    model: '',
    targetLanguage: ''
  });

  assert.equal(result.isValid, false);
  assert.ok(result.errors.length >= 3);
});

test('validateSettings merges defaults', () => {
  const result = validateSettings({
    apiKey: 'sk-demo',
    baseUrl: 'https://example.com/v1',
    model: 'gpt-demo',
    targetLanguage: '日本語'
  });

  assert.equal(result.isValid, true);
  assert.equal(result.settings.instructions, DEFAULT_SETTINGS.instructions);
  assert.equal(
    DEFAULT_SETTINGS.instructions,
    'Preserve meaning, tone, and technical accuracy in translation.'
  );
});

test('getApiPermissionPattern derives origin wildcard', () => {
  assert.equal(
    getApiPermissionPattern('https://api.openai.com/v1'),
    'https://api.openai.com/*'
  );
});

test('normalizeDisabledDomains normalizes separators and casing', () => {
  assert.equal(
    normalizeDisabledDomains('Chat.OpenAI.com, example.com\nsub.example.com'),
    'chat.openai.com\nexample.com\nsub.example.com'
  );
});
