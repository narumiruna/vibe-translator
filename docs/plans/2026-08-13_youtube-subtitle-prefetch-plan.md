# YouTube Subtitle Prefetch Plan

## Goal

Prefetch and translate the next 60 seconds of timed YouTube captions so a cached translation can replace each visible caption immediately, while preserving live DOM translation as a fallback.

## Architecture

- The background controller reads the selected YouTube caption track, fetches its timed JSON transcript, and owns the rolling prefetch window for the active translation session.
- Timed caption cues enter the existing page translation queue as subtitle items with stable cue IDs.
- The content runtime stores early subtitle results by exact source text and consumes them when YouTube later inserts the matching caption segment.
- The YouTube runtime reports playback progress after startup, seeking, and playback so the background can keep the next 60 seconds queued.

## Assumptions

- YouTube caption tracks expose a usable `baseUrl` in the player response or caption track list.
- A cue that starts inside `[current time, current time + 60 seconds)` belongs to the active prefetch window.
- If the timed track cannot be obtained or parsed, current mutation-driven visible-caption translation remains active.

## Non-Goals

- Downloading or translating an entire long video at startup.
- Audio transcription, OCR, or support for videos without YouTube caption tracks.
- Persisting timed subtitle translations across browser restarts.

## Plan

- [x] Add pure timed-caption parsing and 60-second window selection behavior; verify with focused unit tests using JSON3 fixtures.
- [x] Add subtitle-result caching and cached-item matching behavior; verify that exact matching returns render-ready translations and does not consume unrelated cues.
- [x] Extend background YouTube startup and progress handling to fetch a timed track and enqueue stable subtitle cue items for the rolling window; verify with controller tests for startup, refill, deduplication, and fallback.
- [x] Extend the content and YouTube runtimes to cache early results, render cached captions before queueing misses, and report playback progress; verify with focused content/runtime tests.
- [x] Format and lint changed JavaScript with Biome; verify `biome format --write` and `biome lint --write` complete successfully.
- [x] Run focused tests, `just check`, and `just e2e-youtube`; all checks passed.
- [ ] Commit the intended paths, push `agent/prefetch-youtube-subtitles`, and open a draft pull request with the implementation and verification evidence.

## Risks

- YouTube may change caption response fields or reject a timed-text request; retain mutation-driven translation and expose a bounded diagnostic event.
- Auto-generated captions may split visible text differently from transcript cues; use exact source matching so a wrong translation is never displayed, then fall back to visible-caption translation on a miss.
- Seek events can request overlapping windows; stable cue IDs plus translation queue deduplication must prevent duplicate API work.

## Completion Checklist

- [x] Starting subtitle translation queues only cues in the current 60-second window when a timed track is available.
- [x] Continued playback or seeking queues the corresponding new 60-second window without retranslating completed cue IDs.
- [x] A prefetched translation is cached before its caption DOM exists and renders immediately when an exact matching caption appears.
- [x] Missing, malformed, or changed YouTube timed-caption data leaves the current visible-caption translation path working.
- [ ] Focused tests, the repository check, branch push, and draft pull request all succeed.
