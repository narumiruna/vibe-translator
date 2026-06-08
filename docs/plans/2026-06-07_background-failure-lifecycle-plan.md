## Goal

Make background orchestration and translation session lifecycle failures visible, recoverable, and non-stalling. Success means page chunk failures, selection API failures, and synchronous queue errors do not leave hidden failures or stuck UI.

## Context

The review found that page translation ignores `requestTranslationsBatchedProgressive()` failures, selection failures leave the floating panel pending, and synchronous `processBatch` throws can stall the page translation queue.

## Architecture

- `background.js` owns action/context-menu orchestration, page chunk callbacks, badges, toasts, and selection translation flow.
- `page-translation-session.js` owns queue concurrency, pending IDs, translated IDs, and in-flight accounting.
- `translator-messages.js` and `content.js` must share any new selection-panel clear/error message contract.

## Non-Goals

- Do not redesign batching or introduce persistent retry queues.
- Do not change iframe routing in this slice; iframe work is covered by the iframe/e2e plan.

## Plan

- [ ] Capture the result of `TranslatorApi.requestTranslationsBatchedProgressive()` in `background.js` and treat `failures.length > 0` as a user-visible partial failure while preserving successful translations; verify with a background-path unit test or mock harness that forces one chunk to fail and asserts toast/badge/error evidence.
- [ ] Clear placeholders for incomplete page segment IDs after chunk failures and leave already rendered translations intact; verify with the same partial-failure test by checking successful IDs remain marked translated and failed IDs are cleared.
- [ ] Add a selection-panel clear or error message to `translator-messages.js` and handle it in `content.js` so a pending selection panel can be removed or changed to an error state; verify with `test/translator-messages.test.js` and `test/content-selection-panel.test.js`.
- [ ] Update `background.js` selection failure handling so after `renderSelectionPlaceholder` any API or merge failure sends the new selection clear/error message before showing the existing toast/badge error; verify with a background failure-path test that the pending panel is not left in `data-state="pending"`.
- [ ] Wrap `processBatch` invocation in `page-translation-session.js` with `Promise.resolve().then(...)` or equivalent so synchronous throws still run cleanup; verify with `test/page-translation-session.test.js` that in-flight count decrements and later queued work runs.
- [ ] Run focused checks for this slice with `node --test test/page-translation-session.test.js test/translator-messages.test.js test/content-selection-panel.test.js`; verify all tests pass.

## Risks

- Showing an error for every failed chunk can spam users on large pages; mitigate by aggregating failures per batch/session into one toast or badge state.
- Removing the selection panel on failure loses context; an error state may be better UX if tests can verify it reliably.

## Completion Checklist

- [ ] Page chunk failures are visible and do not remove successful translations, verified by the new partial-failure test evidence.
- [ ] Selection API failures clear or replace pending selection UI, verified by selection-panel and background-path tests.
- [ ] Queue synchronous errors do not stall later work, verified by `test/page-translation-session.test.js`.
- [ ] The lifecycle slice passes focused checks, verified by `node --test test/page-translation-session.test.js test/translator-messages.test.js test/content-selection-panel.test.js` output.
