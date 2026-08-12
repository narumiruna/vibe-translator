# YouTube Subtitle Translation Plan

## Goal

Translate available native YouTube captions into the configured target language and replace the visible original caption.

## Assumptions

- This supports caption tracks exposed by YouTube, including available auto-generated captions.
- Videos without a usable caption track remain unsupported; audio transcription and OCR are non-goals.
- Translation originally started through whole-page translation; a later follow-up added an in-player YouTube control while preserving toolbar behavior.

## Plan

- [x] Add a strict, persistent YouTube caption profile and focused tests for its extraction contract; verified by `test/content-site-profiles.test.js`.
- [x] Add subtitle-specific lifecycle and rendering behavior so changing cues cannot display stale translations or reading-card placeholders; verified by `test/content-subtitles.test.js` and `npm run e2e:youtube`.
- [x] Keep empty YouTube sessions active until captions appear, and report a useful ready state; verified by `test/page-translation-session.test.js` and the persistent YouTube profile.
- [x] Document YouTube behavior and add manual regression coverage in `README.md`, `docs/TESTING.md`, and `docs/E2E.md`.
- [x] Format, lint, run focused tests, run `npm run check`, and exercise a YouTube caption fixture in Chrome; Biome passed, 137 unit tests passed, and `PLAYWRIGHT_HEADLESS=1 npm run e2e:youtube` passed.

## Completion Checklist

- [x] The translated subtitle replaces the visible original caption in the YouTube player; verified by `e2e/youtube-subtitles.js`.
- [x] Newly appearing cues continue to queue without retriggering translation; verified by the mutation-driven E2E cue update.
- [x] Late results for replaced cues are ignored; verified with delayed mock responses in `e2e/youtube-subtitles.js`.
- [x] Videos without active captions do not cause unrelated YouTube page text to be translated; verified by the required caption root in the YouTube profile.
- [x] All automated checks pass and browser evidence is recorded.
