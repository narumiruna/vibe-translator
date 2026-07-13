## Goal

Translate readable comments embedded in cross-origin discussion frames when translating a supported article page, starting with the Disqus comments on `https://antirez.com/news/169`.

## Architecture

Keep one page-translation session per tab frame. The background discovers and injects only frame URLs declared by the top-page site profile, requests the corresponding optional host permission from the user gesture, and routes extraction, placeholders, updates, and dynamic queue messages to the originating frame. A Disqus profile limits extraction to comment message paragraphs and excludes discussion controls and metadata.

## Plan

- [x] Add site-profile metadata for Antirez’s Disqus embed and Disqus comment selectors; verified by `test/content-site-profiles.test.js`.
- [x] Make page-translation sessions frame-aware and isolate duplicate DOM source IDs across frames; verified by `test/page-translation-session.test.js`, including duplicate IDs, per-frame removal, tab teardown, and aggregate badge counts.
- [x] Discover permitted embedded frames, start translation in each frame, and route rendering and dynamic queue messages by frame ID; verified by `e2e/antirez-comments.js` against the live cross-origin Disqus embed with both mock and configured APIs.
- [x] Run formatting, linting, `npm run check`, mock E2E, and a live Antirez regression using the configured endpoint; 105 tests passed, all smoke flows passed, and both mock and configured API runs translated 20/20 loaded Disqus paragraphs.

## Risks

- Cross-origin injection requires a separate optional host permission; denial must preserve top-page translation without exposing unrelated frames.
- Different frames generate overlapping `ot-*` source IDs; queue state and rendering must remain isolated by frame.
- Disqus contains extensive controls and metadata; extraction must target only comment message paragraphs.

## Completion Checklist

- [x] Antirez article prose and Disqus comment paragraphs both receive inline translations in a live browser run: configured API result reported 20 comment notes and 8 article notes with zero pending.
- [x] Permission denial or unavailable frames does not prevent top-page translation, verified by the injected-boundary unit test in `test/embedded-frames.test.js`.
- [x] Unit, syntax, and mock E2E checks pass: `npm run check` reported 105 tests and both E2E suites passed.
- [x] The completed plan is archived under `docs/plans/archived/`.
