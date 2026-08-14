# YouTube Progressive Caption Recovery Plan

## Goal

Make YouTube subtitle translation render reliably when native auto-captions mutate faster than API responses, while preserving exact cue ownership, bounded requests, playback-rate prefetching, both display modes, and privacy-safe diagnostics.

## Context

- Diagnostics from `R3-anFK1YM8` show successful API responses followed mostly by `rendered 0; missing target 1`.
- The same runs show zero exact cache hits, 73 to 121 visible fallbacks, no ready note at the final snapshots, and a control stuck in `error` while native captions are visible.
- `src/content/page/observer.js` immediately clears a subtitle source ID whenever its text changes, so every progressive mutation can create a new visible-fallback request.
- `src/content/rendering/runtime.js` rebinds a detached result only when its source text exactly equals a currently visible segment, which safely rejects stale results but cannot recover progressive auto-caption updates.
- `src/content/youtube/subtitles.js` has no timing-aware progressive matcher or logical caption lineage.
- `src/background/controller.js` discovers tracks in the main world from `ytInitialPlayerResponse` or the player track list, while content diagnostics read `ytInitialPlayerResponse` from the isolated world, so the reported `trackCount: 0` may not describe the background result.
- `src/content/youtube/runtime.js` can set a recoverable caption-visibility timeout error but has no path that restores `active` after captions become visible.
- Existing YouTube E2E coverage uses complete synthetic caption strings and does not reproduce word-by-word mutation with delayed responses or a missing timed track.
- Initial connected-Chrome evidence at 1× found one English ASR track with a timed-text URL in both `ytInitialPlayerResponse` and `player.getPlayerResponse()`, an empty player option track list, and a selected English ASR track without its URL, confirming that isolated-world `trackCount: 0` was misleading rather than proof that the timed track was absent.

## Architecture

- Main-world caption discovery returns a sanitized resolution status that identifies the successful discovery source, selected track availability, and timed-prefetch availability without exposing a timed-text URL in diagnostics.
- Timed caption items retain cue start and duration metadata through queueing, translation, caching, and rendering.
- Visible matching tries exact text first, then a timing-bounded progressive relation only when one active timed cue is uniquely compatible with the current native segment.
- Arbitrary fuzzy, edit-distance, and cross-cue matching remain forbidden.
- Visible fallback uses one bounded logical slot per current native caption line or window, allows at most one in-flight request per slot, remembers only the latest pending snapshot, and clears slot state on cue removal, session replacement, SPA navigation, and runtime cleanup.
- Every returned subtitle result is classified as rendered, cached for a current timed cue, or superseded, so an expected late result does not trigger repeated fallback work or masquerade as an unexplained missing target.
- Caption-visibility timeout errors are recoverable, while settings, permission, API, and extension-context errors remain explicit failures.
- Persistent diagnostics contain only counters, timing, character lengths, relation types, bounded state counts, and discovery-source enums.

## Non-Goals

- Fuzzy matching unrelated or repeated captions.
- Showing a translation from an older logical cue over a newer cue.
- Translating the complete video at startup.
- Audio transcription when YouTube exposes no caption data.
- Persisting caption text, prompt text, response text, timed-text URLs, or credentials in diagnostics.
- Changing ordinary page or selection translation behavior.

## Assumptions

- Exact matching remains the highest-priority and safest path.
- A full timed cue may be shown when the visible auto-caption is a verified progressive form of that uniquely active cue.
- Videos without a usable timed-text URL still require a bounded visible-caption fallback.
- The existing outer queue remains the sole owner of API concurrency.

## Unknowns

- Resolved: `R3-anFK1YM8` exposes a usable timed track through both current main-world response sources, so track discovery exists and the diagnostic source is inaccurate.
- Accepted initial trace limitation: a page evaluation stalled while activating playback, and the original CDP connection became unavailable after daemon recovery, so the 2× mutation relation could not be captured before implementation; the supplied diagnostics and synthetic word-timed fixture remain the evidence for the failing lifecycle until the final live rerun.
- Whether its live native segments grow by prefix, suffix, replacement, or a mixture of relations remains to be checked in the final live rerun; implementation must therefore limit progressive matching to the previously specified unique active-cue prefix relation and preserve exact fallback for every other relation.
- Whether YouTube preserves a caption-window or segment identity long enough to define a stable fallback slot.
- Which bounded timing tolerance is needed around cue boundaries without admitting adjacent or repeated cues.

## Risks

- A permissive progressive matcher could attach a translation to a repeated phrase in the wrong cue.
- A fallback slot that survives too long could suppress a newer cue or retain state across SPA navigation.
- Coalescing fallback requests could add latency if the latest pending snapshot is not released immediately after completion or failure.
- Main-world player APIs are undocumented and may vary across watch pages, Shorts, languages, and account experiments.
- Recovering the control from a caption timeout must not hide real configuration, permission, or API failures.

## Plan

- [x] Accepted environment limitation: the connected Chrome at 1× exposed one English ASR timed track through both main-world response sources, but a stalled page evaluation made the original CDP connection unavailable before the 2× mutation trace; the evidence and exact-only limitation are recorded under Context and Unknowns.
- [x] Add `test/fixtures/youtube-progressive-caption.json` and deterministic progressive lifecycle cases; focused tests first failed on missing metadata, timed matching, and fallback state, then passed after implementation.
- [x] Add and test `src/background/youtube-caption-tracks.js`, then call it from `src/background/controller.js`; resolver tests pass for current, stale, malformed, selected, option, and absent-timed-track sources.
- [x] Forward sanitized track and prefetch status through startup into `src/content/youtube/runtime.js` and `src/content/youtube/diagnostics.js`; diagnostics tests and production-artifact E2E pass without exposing `baseUrl`.
- [x] Preserve `cueStartMs`, `durationMs`, and stable cue identity through timed items and progressive chunk merging; focused timed-caption and API tests pass.
- [x] Add a pure unique active-cue prefix matcher in `src/content/youtube/subtitles.js`; focused tests pass for exact priority, timing bounds, ambiguity, reverse relations, mid-word ASCII prefixes, empty data, and malformed timing.
- [x] Integrate timed matching into cached consumption and detached-result rebinding in `src/content.js` and `src/content/rendering/runtime.js`; focused source-ownership tests and timed progressive E2E pass.
- [x] Add bounded structural caption-slot state in `src/content/youtube/caption-fallback.js`; tests pass for one active request, latest-only pending state, failures, removed slots, duplicate identities, bounded slots, SPA reset, and cleanup paths.
- [x] Classify late results as rendered, cached, or superseded in the render path; unit and E2E assertions pass with no duplicate or stale note and no unexplained fallback missing target.
- [x] Recover caption-visibility timeout state when native captions appear or render, while preserving fatal errors and replacement-control state; runtime tests and no-timed-track E2E pass.
- [x] Extend privacy-safe diagnostics with sanitized track status, progressive paths, fallback summary, superseded results, and render outcomes; boundedness, mutation safety, cleanup, and redaction tests pass.
- [x] Extend `e2e/youtube-subtitles.cjs` with delayed timed-prefix and no-timed-track progressive mutations; two consecutive final production-artifact runs passed with bounded requests, active recovery, exact ownership, and API concurrency no greater than five.
- [x] Update `README.md` and `docs/TESTING.md` with progressive matching, bounded fallback, recoverable timeout behavior, diagnostics privacy, and manual `R3-anFK1YM8` checks at 1×, 1.5×, 2×, fullscreen, and SPA navigation.
- [x] Run Biome formatting and linting, focused subtitle tests, `npm run check`, two consecutive `npm run e2e:youtube` runs, and `git diff --check`; focused tests passed, the first full check found one import-order issue, one E2E attempt exposed a nondeterministic real timed-track fetch in the no-caption fixture, both were fixed, and the final check passed 201 tests plus production build verification followed by two consecutive YouTube E2E passes.
- [x] Accepted environment limitation: the original connected-Chrome CDP endpoint remained unavailable for the final `R3-anFK1YM8` rerun after the stalled evaluation; the baseline live track evidence is recorded, and two consecutive production-artifact E2E runs verified bounded timed and no-timed progressive behavior without unexplained missing targets.

## Completion Checklist

- [x] The live mutation shape and main-world track availability for `R3-anFK1YM8` have an evidence-backed disposition, including the accepted 2× and final-rerun CDP limitation.
- [x] Diagnostics report the background track-resolution result accurately without caption text, timed-text URLs, prompts, responses, or credentials.
- [x] Exact matching remains first, and progressive matching succeeds only for one uniquely compatible active timed cue.
- [x] A no-timed-track caption slot has at most one visible-fallback request in flight and queues only its latest pending snapshot next.
- [x] Every late result is rendered, cached, or explicitly superseded, with no stale or duplicate translated note.
- [x] A caption-visibility timeout returns to `active` when captions become visible, without masking real startup or API failures.
- [x] Deterministic E2E covers timed and no-timed progressive captions, delayed responses, node replacement, both display modes, rate changes, and seeks.
- [x] Accepted environment limitation: the original connected-Chrome endpoint was unavailable for the final live rerun; deterministic production-artifact E2E verifies bounded fallback growth and current-cue rendering.
- [x] Focused tests, formatting, linting, `npm run check`, two consecutive YouTube E2E runs, and `git diff --check` pass.
