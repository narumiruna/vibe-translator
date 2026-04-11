const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_PREFETCH_VIEWPORTS,
  getTranslationWindowPriority,
  isRectWithinTranslationWindow,
  normalizeViewportOptions,
  selectWindowCandidates
} = require('../content-viewport.js');

test('normalizeViewportOptions fills defaults', () => {
  assert.deepEqual(normalizeViewportOptions({ viewportHeight: 720 }), {
    viewportHeight: 720,
    prefetchViewports: DEFAULT_PREFETCH_VIEWPORTS,
    topPrefetchViewports: DEFAULT_PREFETCH_VIEWPORTS,
    topMargin: 96
  });
});

test('isRectWithinTranslationWindow includes visible and prefetched blocks', () => {
  const options = { viewportHeight: 800, prefetchViewports: 1, topMargin: 96 };

  assert.equal(isRectWithinTranslationWindow({ top: 20, bottom: 120 }, options), true);
  assert.equal(isRectWithinTranslationWindow({ top: 1200, bottom: 1300 }, options), true);
  assert.equal(isRectWithinTranslationWindow({ top: -700, bottom: -620 }, options), true);
  assert.equal(isRectWithinTranslationWindow({ top: 1700, bottom: 1800 }, options), false);
  assert.equal(isRectWithinTranslationWindow({ top: -1100, bottom: -1020 }, options), false);
});

test('selectWindowCandidates keeps viewport order', () => {
  const items = [
    { id: 'later', rect: { top: 400, bottom: 440 } },
    { id: 'early', rect: { top: 40, bottom: 80 } },
    { id: 'prefetch', rect: { top: 1000, bottom: 1050 } }
  ];

  assert.deepEqual(
    selectWindowCandidates(items, { viewportHeight: 700, prefetchViewports: 1 }).map(
      (item) => item.id
    ),
    ['early', 'later', 'prefetch']
  );
});

test('getTranslationWindowPriority prefers visible blocks over nearby offscreen blocks', () => {
  const options = { viewportHeight: 700, prefetchViewports: 2, topMargin: 96 };

  assert.ok(
    getTranslationWindowPriority({ top: 40, bottom: 90 }, options) <
      getTranslationWindowPriority({ top: 760, bottom: 820 }, options)
  );
  assert.ok(
    getTranslationWindowPriority({ top: 40, bottom: 90 }, options) <
      getTranslationWindowPriority({ top: -80, bottom: -20 }, options)
  );
});
