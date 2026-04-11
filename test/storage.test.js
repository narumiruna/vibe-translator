const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_SETTINGS,
  getApiPermissionPattern,
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
});

test('getApiPermissionPattern derives origin wildcard', () => {
  assert.equal(
    getApiPermissionPattern('https://api.openai.com/v1'),
    'https://api.openai.com/*'
  );
});
