# YouTube Subtitle Playback-Rate Plan

## Goal

Keep translated YouTube captions ready and synchronized during continuous playback at 1×, 1.5×, and 2×, while preserving exact cue ownership, bounded API concurrency, visible-caption fallback, and the existing bilingual and translation-only modes.

## Context

- `src/content/youtube/runtime.js` currently reports only `currentTimeMs`, refills after each 10 seconds of media progress, and does not listen for `ratechange`.
- `src/background/youtube-caption-prefetch.js` always requests a fixed 60-second media window, so 2× playback reduces the real-time lead to 30 seconds.
- `src/translation/chunk-plan.js` emits one API chunk per expanded item; with five page batches and five inner workers, subtitle startup can create up to 25 concurrent API requests.
- The current queue prepends every refill, so newly discovered tail cues can overtake nearer pending cues.
- `requestedCueIds` prevents a failed timed cue from being offered to the queue again, even though the queue already deduplicates pending and completed timed cue IDs.
- Subtitle cache lookup and note reconciliation use exact visible text. Real auto-caption JSON3 includes word offsets, while the parser retains only each completed cue text.
- A bounded transcript sample from the existing YouTube E2E video contains 33 completed cues, 1,205 source characters, and 223 timed word segments in its first 60 seconds.
- With a local 500 ms mock response, the current singleton path used 33 requests, reached 21 concurrent requests, and completed in about 1,017 ms; grouping up to eight cues used five requests, reached five concurrent requests, and completed in about 614 ms.

## Architecture

- The content runtime sends `{ currentTimeMs, playbackRate, reason }` on startup, material playback progress, seeking, and playback-rate changes.
- The background computes a rate-aware media window as `clamp(60_000 * max(1, playbackRate), 60_000, 180_000)`, preserving approximately 60 seconds of real-time lead through 2× playback without translating an entire video.
- Initial and seek windows enter the front of the pending queue; ordinary rolling tail refills enter the back. Existing visible-caption fallback and ordinary page behavior retain their current front-of-queue behavior.
- Subtitle-only page batches group up to eight expanded cues within the existing character limit into one Responses API request. The outer page queue remains the only concurrency owner, capping active subtitle requests at five.
- Stable timed cue IDs plus the queue's pending/completed deduplication replace permanent `requestedCueIds` suppression, allowing failed cues to be retried by a later refill.
- Exact source-text cache matching remains the default. A bounded live trace determines whether progressive auto-caption text needs a second, timing-constrained match path.
- If required by that trace, a timed-prefix match is accepted only when the visible normalized text is a unique prefix of one active cached cue and the video clock is within that cue's bounded interval. Arbitrary fuzzy matching is not allowed.
- Diagnostics record playback rate, requested media window, queue placement, cue count, exact-cache hits, optional timed-prefix hits, visible fallbacks, and API failures without recording source text, prompts, responses, or credentials.

## Non-Goals

- Translating the complete video at startup.
- Automatically pausing or changing the user's playback speed.
- Replacing YouTube's native timing engine with an extension-owned subtitle player.
- Audio transcription for videos without YouTube captions.
- User-configurable timing offsets or buffer sizes.
- Changing batching or ordering for ordinary page and selection translation beyond the queue API compatibility needed by YouTube.

## Assumptions

- The maximum rate-aware window is 180 seconds of media time; unsupported or invalid playback rates normalize to 1×.
- Eight short subtitle cues fit safely within the existing structured-output contract and 5,000-character request limit.
- The existing exact source snapshot and stale-note protections remain mandatory in both subtitle display modes.
- Provider latency and rate limits vary, so deterministic tests prove scheduling and request bounds rather than promising a universal network latency.

## Unknowns

- Live trace resolution: the connected Chrome played `g7AxxkywiFI`, but YouTube marked its caption track `is_servable=false`; 28 media seconds at 1× and 33 media seconds at 2× produced zero native caption segments, so exact-hit, fallback, and progressive-source counts could not be measured.
- Bounded transcript evidence: yt-dlp returned 33 completed cues, 1,205 characters, and 223 word-timed segments for the first 60 seconds, and VTT exposed progressive word timestamps; this does not prove the live DOM mutation shape.
- Decision: keep exact matching and do not add the riskier timed-prefix path without a servable live-caption trace; deterministic E2E covers 1×→2×, seeking, overlapping cues, both display modes, and exact stale-note safety.
- Accepted environment limitation: native-caption, fullscreen, and SPA timing remain manual checks on a browser where YouTube serves caption DOM.

## Risks

- A malformed multi-item API response can fail several cues together; retain strict ID coverage validation, bounded batch size, later refill retry, and visible-caption fallback.
- A larger high-speed window increases up-front translation work; cap the window and enqueue rolling tail work behind nearer cues.
- Prefix matching could attach a translation to the wrong repeated phrase; require one unique active cue, bounded timing, normalized prefix matching, and exact cleanup tests.
- Old in-flight work cannot be cancelled after a seek; place the new seek window first and rely on exact cue matching so old results can only populate cache, never replace a current cue.
- Time-based E2E assertions can be flaky on CI; assert queue/request bounds and cue-to-note ordering deterministically, using only a generous bounded render-lag threshold where ordering alone is insufficient.
- Concurrent timed-prefetch and visible-fallback results initially produced duplicate notes by stealing an already claimed source identity; the renderer now adopts the claimed identity instead of replacing it, with unit and repeated E2E regression coverage.

## Plan

- [x] Add a bounded auto-caption fixture and trace helper covering cue start, duration, word offsets, visible source mutations, video time, playback rate, and rendered-note mutations; `test/fixtures/youtube-auto-caption.json` and bounded/redacted trace tests pass.
- [x] Attempt the bounded trace on `g7AxxkywiFI` at 1× and 2×; YouTube returned `is_servable=false` and zero caption segments at both rates, so the accepted limitation and exact-only decision are recorded under Unknowns.
- [x] Extend `test/youtube-timed-captions.test.js`, `test/youtube-runtime.test.js`, and `test/translator-messages.test.js` for normalized playback rates, the 60–180 second rate-aware window, `ratechange`, seek, cleanup, and reason-bearing progress payloads; focused tests pass.
- [x] Update `src/content/youtube/timed-captions.js`, `src/content/youtube/runtime.js`, `src/shared/messages.js`, and startup capture in `src/background/controller.js` to send and normalize playback telemetry; focused playback telemetry tests pass.
- [x] Add queue-order tests in `test/page-translation-session.test.js` proving front placement preserves visible and seek priority while back placement preserves chronological rolling refills; focused queue tests pass.
- [x] Extend `src/shared/translation-session.js`, `src/background/controller.js`, and `src/background/youtube-caption-prefetch.js` with explicit front/back enqueue placement so initial and seek windows lead, rolling tails do not overtake pending cues, and non-YouTube callers retain current behavior; focused queue and prefetch tests pass.
- [x] Add prefetch tests in `test/youtube-caption-prefetch.test.js` proving 1× requests 60 seconds, 1.5× requests 90 seconds, 2× requests 120 seconds, invalid rates use 60 seconds, and failed cue IDs can be offered again without duplicating pending or completed work; focused tests pass.
- [x] Update `src/background/youtube-caption-prefetch.js` to use the rate-aware window and queue deduplication instead of permanent `requestedCueIds`; focused prefetch tests pass.
- [x] Add API/controller tests proving an all-subtitle batch of up to eight cues produces one multi-item request, 33 representative cues need at most five requests, results still merge by ID, and active requests never exceed the outer concurrency limit of five; focused tests pass.
- [x] Update the subtitle-only path in `src/background/controller.js` to group expanded items by the existing character limit while preserving singleton recursive parts, one inner subtitle worker, and current ordinary-page behavior; focused API/controller tests pass.
- [x] Not applicable: the live trace could not obtain servable caption DOM, so progressive exact-cache misses were not confirmed and the riskier timed-prefix contract was not introduced.
- [x] Not applicable: exact source matching remains mandatory until a future servable live-caption trace proves a unique timed-prefix path is necessary and safe.
- [x] Extend bounded YouTube diagnostics in `src/content/youtube/diagnostics.js`, `src/content/youtube/runtime.js`, and background events with playback rate, window length, placement, cache path, queue count, and failure count; bounded, immutable, malformed-input, and redaction tests pass.
- [x] Extend `e2e/youtube-subtitles.cjs` with a deterministic timeline that runs consecutive and overlapping cues at 1×, changes to 2×, seeks to a new window, and uses a delayed mock API; two consecutive `npm run e2e:youtube` runs passed with no prefetched fallback, stale notes, or concurrency above five.
- [x] Update `README.md` and `docs/TESTING.md` with playback-rate-aware buffering, startup expectations, rate changes, seek behavior, fallback behavior, diagnostics, and manual 1×/1.5×/2× checks.
- [x] Run formatting, linting, `npm run check`, `npm run e2e:youtube`, and `git diff --check`; the first `npm run check` found one import-order issue, `biome check --write` fixed it, the final rerun passed 188 tests plus build verification, and two final YouTube E2E runs passed.
- [x] Accepted environment limitation: connected Chrome played the live auto-caption video at 1× and 2× but exposed no servable caption DOM, so native-caption, fullscreen, and SPA checks remain in `docs/TESTING.md`; deterministic production-artifact E2E verified 1×→2×, seek, overlapping cues, both display modes, cache/fallback behavior, and stale-note safety.

## Completion Checklist

- [x] A valid 1×, 1.5×, or 2× playback rate produces a 60-, 90-, or 120-second media prefetch window, and invalid rates safely produce 60 seconds.
- [x] Rolling refills cannot overtake nearer pending cues, while seek and visible-caption fallback work remains urgent.
- [x] Up to eight short timed cues share one API request, 33 representative cues require no more than five requests, and active subtitle requests never exceed five.
- [x] Failed timed cues can be retried by a later refill without duplicating pending or completed cue work.
- [x] The progressive-caption unknown has a recorded environment limitation and explicit exact-only disposition; no unverified timed-prefix behavior was introduced.
- [x] Deterministic 1×→2× playback and seek E2E checks show only current-cue translations, no steady-state visible fallback for prefetched cues, and zero stale notes.
- [x] Both YouTube subtitle display modes retain exact source ownership through rate changes, seeks, overlapping cues, concurrent prefetch/fallback completion, and node replacement.
- [x] Focused tests, `npm run check`, two consecutive `npm run e2e:youtube` runs, formatting, linting, and `git diff --check` pass.
- [x] Live auto-caption attempts and their `is_servable=false` limitation are recorded; unavailable native-caption, fullscreen, and SPA checks remain explicit in the manual checklist and PR risk notes.
