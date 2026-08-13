# YouTube Subtitle Sync and Display Modes Plan

## Goal

Keep each YouTube translation attached to the exact native caption cue currently on screen, and add two saved display modes: show the original with its translation, or show only the translation.

## Context

- The current renderer attaches a translated note beside each visible `.ytp-caption-segment` and identifies prefetched results by exact text.
- YouTube can expose cumulative auto-caption events and can mutate, replace, append, or remove multiple visible caption segments independently.
- The current replacement state is set on the insertion target, while cleanup and cache matching are primarily source-element based; this can let an older translated note outlive the native cue it represents.
- Subtitle display mode is not currently part of normalized settings, session payloads, rendering state, or the options UI.

## Architecture

- `src/shared/settings.js` owns a normalized `youtubeSubtitleDisplayMode` enum with `bilingual` and `translation-only`; existing users migrate to `translation-only` to preserve current behavior.
- Background session and render payloads forward the normalized mode to the YouTube content runtime without affecting ordinary page or selection translation.
- Subtitle rendering stores the source snapshot and display mode on the extension-owned note and applies original visibility to the actual caption segment, not an unrelated ancestor.
- The YouTube observer reconciles every caption mutation synchronously: a note remains visible only while its bound source still exists and still has the same normalized text.
- Prefetch remains an optimization. Exact source matching remains mandatory, and live visible-caption translation remains the fallback when timed-track cue boundaries do not match the DOM.

## Non-Goals

- User-configurable millisecond offsets.
- Audio transcription for videos without YouTube captions.
- Replacing YouTube’s native caption timing engine with an extension-owned subtitle player.
- Changing ordinary page translation appearance or selection-panel behavior.

## Assumptions

- “Original and translation at the same time” means the native YouTube caption stays visible with the translated line directly below it.
- “Translation only” means the matched native caption segment is hidden only after its translation is ready.
- Display mode is a global saved preference and takes effect the next time subtitle translation starts or a session is restored.

## Risks

- Auto-generated captions may expose transcript cues whose text boundaries differ from visible DOM segments; exact matching avoids wrong text but may use the slower visible-caption fallback.
- YouTube may display multiple segments in one caption window; source-bound cleanup must not remove a still-valid sibling translation.
- Hiding an ancestor caption container can desynchronize source and translation; translation-only mode must hide only the source segment bound to the rendered note.

## Plan

- [x] Add failing tests in `test/storage.test.js` for `youtubeSubtitleDisplayMode` defaults, accepted values, invalid-value fallback, and migration to `translation-only`; verified with `node --test test/storage.test.js`.
- [x] Add the normalized setting and enum in `src/shared/settings.js`, then add an accessible two-option control under a YouTube Subtitles section in `src/options/index.html` and wire load/save behavior in `src/options/index.js`; focused storage tests pass.
- [x] Add failing payload tests in `test/background-controller.test.js` for startup, render updates, and reinjection carrying the normalized subtitle display mode; verified with `node --test test/background-controller.test.js`.
- [x] Forward `youtubeSubtitleDisplayMode` through `src/background/platform.js`, `src/background/controller.js`, and content session state so every subtitle render uses one explicit mode while non-YouTube rendering stays unchanged; focused controller tests pass.
- [x] Add failing subtitle tests in `test/content-subtitles.test.js` and observer tests in `test/page-observer.test.js` proving bilingual mode preserves the matched native segment, translation-only mode hides only that segment, and removed or text-changed sources synchronously remove their exact stale notes.
- [x] Refactor `src/content/youtube/subtitles.js`, `src/content/rendering/runtime.js`, `src/content/page/observer.js`, and `src/content/styles.js` to bind each note to its source snapshot, reconcile source/note lifetime synchronously, and apply the chosen visibility mode to the bound segment; focused subtitle and observer tests pass.
- [x] Add timed-caption fixtures in `test/youtube-timed-captions.test.js` and `test/youtube-caption-prefetch.test.js` for cumulative auto-generated events and overlapping active cues; existing parsing preserved exact visible boundaries, so no parser change was needed, and both focused test files pass.
- [x] Extend `e2e/youtube-subtitles.cjs` to timestamp native cue mutations and translated-note mutations for multiple consecutive cues, assert no stale translation survives the source cue, and exercise both display modes; `npm run e2e:youtube` passes.
- [x] Update `README.md` and `docs/TESTING.md` with both modes, the preserved default, and manual checks for consecutive cues, seeks, multiple simultaneous segments, fullscreen, and SPA navigation.
- [x] Run `npx --no-install biome format --write` and `npx --no-install biome lint --write` on changed JavaScript, then run `npm run check` and `npm run e2e:youtube`; both pass. Real-YouTube limitation: the deterministic E2E uses a live watch page but injects controlled caption segments and a mock API, so native cue timing plus manual seek, fullscreen, and SPA checks remain browser QA.

## Completion Checklist

- [x] Bilingual mode keeps the exact native caption visible with its matching translation and removes both translated state and note when that cue disappears or changes.
- [x] Translation-only mode hides only the native segment whose matching translation is ready; it never leaves an old translation visible over a newer native cue.
- [x] Existing stored settings preserve the current translation-only behavior, invalid stored values normalize safely, and the options control uses an accessible radio-group structure with keyboard-native inputs.
- [ ] Startup, prefetch cache hits, visible-caption fallback, seeking, multiple caption segments, fullscreen, and YouTube SPA navigation retain correct source-to-translation pairing. Automated startup, prefetch, fallback, seeking logic, and multiple-segment checks pass; manual fullscreen and SPA checks remain.
- [ ] Focused tests, `npm run check`, `npm run e2e:youtube`, and documentation updates pass; manual verification against YouTube's native caption timing remains.
