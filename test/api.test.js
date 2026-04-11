const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildChatCompletionRequest,
  chunkTranslationItems,
  parseTranslationResponse,
  requestTranslations
} = require('../api.js');

test('chunkTranslationItems splits by character limit', () => {
  const chunks = chunkTranslationItems(
    [
      { id: 'a', text: '1234' },
      { id: 'b', text: '1234' },
      { id: 'c', text: '1234' }
    ],
    8
  );

  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks[0].map((item) => item.id), ['a', 'b']);
  assert.deepEqual(chunks[1].map((item) => item.id), ['c']);
});

test('buildChatCompletionRequest uses chat completions shape', () => {
  const payload = buildChatCompletionRequest(
    {
      apiKey: 'x',
      baseUrl: 'https://example.com/v1',
      model: 'demo',
      instructions: 'Translate carefully.',
      targetLanguage: '繁體中文'
    },
    [{ id: '1', text: 'Hello' }],
    false
  );

  assert.equal(payload.model, 'demo');
  assert.equal(payload.stream, false);
  assert.equal(payload.messages.length, 2);
  assert.match(payload.messages[0].content, /Return only valid JSON/);
});

test('parseTranslationResponse accepts fenced JSON', () => {
  const parsed = parseTranslationResponse(
    '```json\n[{"id":"1","translation":"你好"}]\n```'
  );

  assert.deepEqual(parsed, [{ id: '1', translation: '你好' }]);
});

test('requestTranslations retries once when first response is invalid JSON', async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;

    if (calls === 1) {
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: 'not-json' } }]
          })
      };
    }

    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: '[{"id":"1","translation":"你好"}]' } }]
        })
    };
  };

  const result = await requestTranslations({
    settings: {
      apiKey: 'x',
      baseUrl: 'https://example.com/v1',
      model: 'demo',
      instructions: 'Translate carefully.',
      targetLanguage: '繁體中文'
    },
    items: [{ id: '1', text: 'Hello' }],
    fetchImpl: fakeFetch
  });

  assert.equal(calls, 2);
  assert.deepEqual(result, [{ id: '1', translation: '你好' }]);
});
