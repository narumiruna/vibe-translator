# Selection Panel Redesign Plan

## Goal

Redesign the selected-text translation panel into a compact, stable, accessible result surface with explicit loading, success, empty, error, retry, dismiss, and stale-request behavior while preserving existing appearance settings, positions, iframe rendering, and stored data.

## Architecture

- `src/content-selection-panel.js` owns panel DOM, request lifecycle state, retry/dismiss behavior, expansion, positioning, and accessibility semantics.
- `src/content.js` integrates the renderer and injects isolated responsive styles derived from validated appearance settings.
- `src/background.js` and `src/translator-messages.js` carry request IDs, render in-panel failures, and accept explicit retry requests from the originating frame.
- `src/options-appearance.js` and `src/options.html` keep the selection preview visually aligned with the shipped success panel; saving remains the only apply action.
- Existing storage keys and appearance schemas remain unchanged.

## Non-Goals

- Adding copy, source-text, pinning, history, or arbitrary CSS features.
- Redesigning the full options-page information architecture.
- Changing page-translation card behavior.

## Plan

- [x] Add focused lifecycle tests in `test/content-selection-panel.test.js` for request normalization, stale-result rejection, dismiss suppression, stable-width expansion, error/retry semantics, and accessible state updates; the focused run initially failed on five intended missing behaviors, then passed 12/12 panel/message tests.
- [x] Update `src/content-selection-panel.js`, `src/translator-messages.js`, and `src/background.js` to implement request-scoped loading/success/error/retry/dismiss behavior; verified by focused tests and mock extension smoke coverage.
- [x] Redesign selection-panel styles and markup integration in `src/content.js` for stable width, responsive controls, host-style isolation, visible state labels, dark mode, focus visibility, reduced motion, and contrasting retry text; verified by unit tests, syntax checks, screenshots, and mock E2E.
- [x] Align the live selection preview and unsaved-preview messaging in `src/options.html`, `src/options.css`, `src/options-appearance.js`, and `src/options.js`; verified by options smoke assertions for preview labels, dirty state, save state, persistence, and mobile bounds.
- [x] Expand `e2e/extension-smoke.js` coverage for loading-to-success, stable expansion, dismiss, failure state, retry, responsive bounds, and accessibility attributes; `npm run e2e:mock` passed all smoke stages and regenerated desktop/mobile screenshots.
- [x] Update `README.md` and `docs/TESTING.md` to describe the final panel states, dismiss/retry behavior, stable expansion, and preview/save distinction.
- [x] Run `biome format --write`, `biome lint --write`, `just check`, and the relevant mock E2E smoke suite; all checks passed, `git diff --check` passed, and the final working tree contains only intended redesign files plus this plan.

## Completion Checklist

- [x] The latest non-dismissed selection request is the only request allowed to update the panel.
- [x] Loading, success, empty, error, disabled/preflight, and partial/atomic behavior match the approved design.
- [x] Expand/collapse never changes the configured panel width and remains viewport-safe.
- [x] Keyboard, focus, ARIA live-region, target size, dark mode, reduced-motion, and narrow-layout requirements are covered.
- [x] Existing position modes, custom appearance values, protected fragments, and iframe placement remain compatible.
- [x] Appearance preview remains non-persistent until Save Settings, with visible unsaved-state feedback.
- [x] Tests, formatting, linting, documentation, and final diff audit are complete.
