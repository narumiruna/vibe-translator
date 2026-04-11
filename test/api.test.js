const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildResponsesRequest,
  buildTranslationInput,
  chunkTranslationItems,
  clearTranslationCache,
  consumeProgressiveTranslations,
  createRecursiveChunkPlan,
  createProgressiveMergeState,
  extractOutputText,
  getIncompleteSegmentIds,
  maskProtectedFragments,
  mergeRecursiveTranslations,
  parseTranslationResponse,
  requestTranslations,
  requestTranslationsBatched,
  requestTranslationsBatchedProgressive,
  splitTextRecursively,
  unmaskProtectedFragments,
  validateProtectedFragments
} = require('../api.js');

function buildSettings(overrides) {
  return {
    apiKey: 'x',
    baseUrl: 'https://example.com/v1',
    model: 'demo',
    systemPromptTemplate: 'System template for {{targetLanguage}} ({{itemCount}} items).',
    userPromptTemplate: 'User template for {{itemKind}}.\n\n{{sourcePayload}}',
    targetLanguage: '台灣正體中文',
    ...overrides
  };
}

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

test('splitTextRecursively breaks a long text into bounded parts', () => {
  const parts = splitTextRecursively(
    'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda',
    12
  );

  assert.ok(parts.length > 1);
  assert.ok(parts.every((part) => part.text.length <= 12));
});

test('createRecursiveChunkPlan creates one request per non-oversized item', () => {
  const plan = createRecursiveChunkPlan(
    [
      { id: 'a', kind: 'paragraph', text: 'Alpha paragraph.' },
      { id: 'b', kind: 'paragraph', text: 'Beta paragraph.' },
      { id: 'c', kind: 'heading', text: 'Gamma heading' }
    ],
    200
  );

  assert.equal(plan.chunks.length, 3);
  assert.deepEqual(plan.chunks.map((chunk) => chunk.map((item) => item.id)), [
    ['a'],
    ['b'],
    ['c']
  ]);
});

test('createRecursiveChunkPlan splits oversized items and mergeRecursiveTranslations restores them', () => {
  const plan = createRecursiveChunkPlan(
    [
      {
        id: 'long',
        kind: 'paragraph',
        text: 'First sentence. Second sentence. Third sentence. Fourth sentence.'
      }
    ],
    24
  );

  assert.ok(plan.expandedItems.length > 1);
  assert.ok(plan.expandedItems.every((item) => item.text.length <= 24));
  assert.ok(plan.chunks.every((chunk) => chunk.length === 1));

  const merged = mergeRecursiveTranslations(plan, plan.expandedItems.map((item) => ({
    id: item.id,
    translation: `[${item.text}]`
  })));

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'long');
  assert.match(merged[0].translation, /^\[First sentence\./);
  assert.match(merged[0].translation, /Fourth sentence\.\]$/);
});

test('createRecursiveChunkPlan preserves pre-extracted math placeholders for DOM recomposition', () => {
  const plan = createRecursiveChunkPlan(
    [
      {
        id: 'math',
        kind: 'paragraph',
        text: 'The goal is __OT_MATH_1__ and the posterior is __OT_MATH_2__.',
        protectedFragments: [
          {
            placeholder: '__OT_MATH_1__',
            value: '$p^*(x)$',
            text: 'p*(x)',
            html: '<span class="katex">p*(x)</span>',
            preservePlaceholder: true
          },
          {
            placeholder: '__OT_MATH_2__',
            value: '\\(q_\\theta(x)\\)',
            text: 'q_theta(x)',
            html: '<span class="katex">q_theta(x)</span>',
            preservePlaceholder: true
          }
        ]
      }
    ],
    24
  );

  const merged = mergeRecursiveTranslations(plan, plan.expandedItems.map((item) => ({
    id: item.id,
    translation: item.text
  })));

  assert.equal(merged.length, 1);
  assert.equal(
    merged[0].translation,
    'The goal is __OT_MATH_1__ and the posterior is __OT_MATH_2__.'
  );
  assert.deepEqual(
    merged[0].protectedFragments,
    plan.items[0].protectedFragments
  );
});

test('unmaskProtectedFragments keeps preserved placeholders in translated text', () => {
  assert.equal(
    unmaskProtectedFragments('Before __OT_MATH_1__ after', [
      {
        placeholder: '__OT_MATH_1__',
        value: '$x$',
        preservePlaceholder: true
      }
    ]),
    'Before __OT_MATH_1__ after'
  );
});

test('maskProtectedFragments preserves code paths urls and tech terms', () => {
  const masked = maskProtectedFragments(
    'Run `npm run dev` in src/bot/ and open https://example.com/docs for the GitHub API guide.'
  );

  assert.notEqual(masked.maskedText.includes('`npm run dev`'), true);
  assert.ok(masked.tokens.length >= 4);

  const restored = unmaskProtectedFragments(masked.maskedText, masked.tokens);

  assert.equal(
    restored,
    'Run `npm run dev` in src/bot/ and open https://example.com/docs for the GitHub API guide.'
  );
});

test('maskProtectedFragments preserves latex math expressions', () => {
  const masked = maskProtectedFragments(
    'The goal is $p^*(x)$ while \\(q_\\theta(x)\\) approximates the posterior.'
  );

  assert.ok(masked.tokens.some((token) => token.value === '$p^*(x)$'));
  assert.ok(masked.tokens.some((token) => token.value === '\\(q_\\theta(x)\\)'));
  assert.equal(
    unmaskProtectedFragments(masked.maskedText, masked.tokens),
    'The goal is $p^*(x)$ while \\(q_\\theta(x)\\) approximates the posterior.'
  );
});

test('buildTranslationInput renders prompt templates with source payload', () => {
  const input = buildTranslationInput({
    ...buildSettings(),
    items: [{ id: '1', kind: 'heading', text: 'Hello' }]
  });

  assert.equal(input.length, 2);
  assert.equal(input[0].role, 'system');
  assert.match(input[0].content, /台灣正體中文/);
  assert.match(input[0].content, /1 items/);
  assert.equal(input[1].role, 'user');
  assert.match(input[1].content, /User template for heading/);
  assert.match(input[1].content, /"targetLanguage":"台灣正體中文"/);
  assert.match(input[1].content, /"id":"1"/);
  assert.match(input[1].content, /"kind":"heading"/);
  assert.match(input[1].content, /"text":"Hello"/);
  assert.doesNotMatch(input[1].content, /"items":\[/);
});

test('buildResponsesRequest uses responses api shape', () => {
  const payload = buildResponsesRequest(
    buildSettings(),
    [{ id: '1', kind: 'heading', text: 'Hello' }]
  );

  assert.equal(payload.model, 'demo');
  assert.equal(payload.input.length, 2);
  assert.equal(payload.text.format.type, 'json_schema');
  assert.equal(payload.text.format.name, 'translation_result');
  assert.equal(payload.text.format.strict, true);
  assert.deepEqual(payload.text.format.schema.required, ['translations']);
});

test('parseTranslationResponse reads output_parsed translations', () => {
  const parsed = parseTranslationResponse({
    output_parsed: {
      translations: [{ id: '1', translation: '你好' }]
    }
  });

  assert.deepEqual(parsed, [{ id: '1', translation: '你好' }]);
});

test('extractOutputText aggregates output text content', () => {
  const text = extractOutputText({
    output: [
      {
        type: 'message',
        content: [
          { type: 'output_text', text: '{"translations":' },
          { type: 'output_text', text: '[{"id":"1","translation":"你好"}]}' }
        ]
      }
    ]
  });

  assert.equal(text, '{"translations":\n[{"id":"1","translation":"你好"}]}');
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
            output: [{ type: 'message', content: [{ type: 'output_text', text: 'not-json' }] }]
          })
      };
    }

    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          output_parsed: {
            translations: [{ id: '1', translation: '你好' }]
          }
        })
    };
  };

  const result = await requestTranslations({
    settings: buildSettings(),
    items: [{ id: '1', text: 'Hello' }],
    fetchImpl: fakeFetch
  });

  assert.equal(calls, 2);
  assert.deepEqual(result, [{ id: '1', translation: '你好' }]);
});

test('requestTranslations reuses cached translations for identical text and settings', async () => {
  clearTranslationCache();

  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;

    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          output_parsed: {
            translations: [{ id: '1', translation: '你好' }]
          }
        })
    };
  };
  const settings = buildSettings({ model: 'demo-cache' });

  const first = await requestTranslations({
    settings,
    items: [{ id: '1', kind: 'paragraph', text: 'Hello' }],
    fetchImpl: fakeFetch
  });
  const second = await requestTranslations({
    settings,
    items: [{ id: '2', kind: 'paragraph', text: 'Hello' }],
    fetchImpl: fakeFetch
  });

  assert.equal(calls, 1);
  assert.deepEqual(first, [{ id: '1', translation: '你好' }]);
  assert.deepEqual(second, [{ id: '2', translation: '你好' }]);
});

test('validateProtectedFragments rejects missing placeholders', () => {
  assert.throws(() => {
    validateProtectedFragments(
      [
        {
          id: '1',
          text: '__OT_TOKEN_1__ hello',
          protectedFragments: [{ placeholder: '__OT_TOKEN_1__', value: '`npm run dev`' }]
        }
      ],
      [{ id: '1', translation: '你好' }]
    );
  }, /Protected placeholder/);
});

test('requestTranslationsBatched runs chunks in parallel and preserves chunk order', async () => {
  clearTranslationCache();

  let inFlight = 0;
  let maxInFlight = 0;
  const delays = {
    a: 50,
    b: 10,
    c: 30
  };
  const fakeFetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const item = JSON.parse(body.input[1].content.split('\n\n').at(-1));

    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, delays[item.id]));
    inFlight -= 1;

    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          output_parsed: {
            translations: [{ id: item.id, translation: `translated-${item.id}` }]
          }
        })
    };
  };

  const result = await requestTranslationsBatched({
    settings: buildSettings(),
    chunks: [
      [{ id: 'a', kind: 'paragraph', text: 'A', protectedFragments: [] }],
      [{ id: 'b', kind: 'paragraph', text: 'B', protectedFragments: [] }],
      [{ id: 'c', kind: 'paragraph', text: 'C', protectedFragments: [] }]
    ],
    concurrency: 2,
    fetchImpl: fakeFetch
  });

  assert.equal(maxInFlight, 2);
  assert.deepEqual(result, [
    { id: 'a', translation: 'translated-a' },
    { id: 'b', translation: 'translated-b' },
    { id: 'c', translation: 'translated-c' }
  ]);
});

test('consumeProgressiveTranslations only emits a split segment after all parts are available', () => {
  const plan = createRecursiveChunkPlan(
    [
      {
        id: 'long',
        kind: 'paragraph',
        text: 'First sentence. Second sentence. Third sentence. Fourth sentence.'
      }
    ],
    24
  );
  const state = createProgressiveMergeState(plan);
  const earlyParts = plan.expandedItems.slice(0, -1);
  const finalPart = plan.expandedItems.at(-1);

  const partial = consumeProgressiveTranslations(
    plan,
    state,
    earlyParts.map((item, index) => ({
      id: item.id,
      translation: `第${index + 1}段。`
    }))
  );

  assert.deepEqual(partial, []);

  const completed = consumeProgressiveTranslations(plan, state, [
    { id: finalPart.id, translation: '最後一段。' }
  ]);

  assert.equal(completed.length, 1);
  assert.equal(completed[0].id, 'long');
  assert.equal(getIncompleteSegmentIds(plan, state).length, 0);
});

test('requestTranslationsBatchedProgressive emits chunks in completion order', async () => {
  clearTranslationCache();

  const completionOrder = [];
  const fakeFetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const item = JSON.parse(body.input[1].content.split('\n\n').at(-1));
    const delays = { a: 40, b: 5, c: 20 };

    await new Promise((resolve) => setTimeout(resolve, delays[item.id]));

    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          output_parsed: {
            translations: [{ id: item.id, translation: `translated-${item.id}` }]
          }
        })
    };
  };

  const result = await requestTranslationsBatchedProgressive({
    settings: buildSettings(),
    chunks: [
      [{ id: 'a', kind: 'paragraph', text: 'A', protectedFragments: [] }],
      [{ id: 'b', kind: 'paragraph', text: 'B', protectedFragments: [] }],
      [{ id: 'c', kind: 'paragraph', text: 'C', protectedFragments: [] }]
    ],
    concurrency: 3,
    fetchImpl: fakeFetch,
    onChunkResolved: async ({ chunkItems }) => {
      completionOrder.push(chunkItems[0].id);
    }
  });

  assert.deepEqual(completionOrder, ['b', 'c', 'a']);
  assert.equal(result.failures.length, 0);
  assert.equal(result.successes.length, 3);
});

test('requestTranslationsBatchedProgressive sends one item per request for normal items', async () => {
  clearTranslationCache();

  const plan = createRecursiveChunkPlan(
    [
      { id: 'a', kind: 'paragraph', text: 'Alpha' },
      { id: 'b', kind: 'paragraph', text: 'Beta' }
    ],
    200
  );
  const requestPayloadIds = [];
  const fakeFetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const payload = JSON.parse(body.input[1].content.split('\n\n').at(-1));

    requestPayloadIds.push([payload.id]);

    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          output_parsed: {
            translations: [{ id: payload.id, translation: `translated-${payload.id}` }]
          }
        })
    };
  };

  const result = await requestTranslationsBatchedProgressive({
    settings: buildSettings(),
    chunks: plan.chunks,
    concurrency: 2,
    fetchImpl: fakeFetch
  });

  assert.deepEqual(requestPayloadIds, [['a'], ['b']]);
  assert.equal(result.failures.length, 0);
  assert.equal(result.successes.length, 2);
});
