## Goal

Make translation API response handling and persisted settings loading strict, normalized, and retry-safe. Success means incomplete or malformed model responses never silently render or cache partial results, and runtime settings are normalized before use.

## Context

The review found that missing translation IDs are silently accepted and that `getSettings()` returns migrated but unnormalized stored values. These defects can produce disappearing translations, bad cache entries, or malformed API URLs.

## Architecture

- `api-responses.js` parses and validates raw Responses API output.
- `api.js` owns retry, cache split/merge, and batched request orchestration.
- `storage.js` owns persisted settings migration and normalization.

## Non-Goals

- Do not change prompt templates or extraction behavior.
- Do not add a new API provider abstraction.

## Plan

- [x] Add exact response ID coverage validation in `api-responses.js` so every requested item receives exactly one translation and unknown or duplicate IDs are rejected; verify with new `test/api.test.js` cases for missing, duplicate, and unknown IDs.
- [x] Update `api.js` retry behavior so coverage-validation failures retry once like malformed JSON and do not cache incomplete results; verify with `node --test test/api.test.js` using a first incomplete response followed by a complete response.
- [x] Keep `mergeTranslationsInItemOrder()` order-preserving while ensuring its inputs have already passed strict coverage validation; verify with existing and new `test/api.test.js` order/caching assertions.
- [x] Normalize loaded stored settings in `storage.js` after migration while preserving first-run defaults for the options page; verify with `test/storage.test.js` cases for untrimmed base URL/model/target language and legacy prompt fields.
- [x] Run focused checks for this slice with `node --test test/api.test.js test/storage.test.js`; verify all tests pass.

## Risks

- Stricter response validation may reject real model responses that previously rendered partially; mitigate with one retry and clear error propagation to the background failure plan.
- Normalizing loaded settings could alter whitespace in stored values; this is intended for URL/model/language fields but prompt behavior must remain validated by tests.

## Completion Checklist

- [x] API response coverage rejects missing, duplicate, and unknown IDs, verified by passing `node --test test/api.test.js` regression cases.
- [x] Coverage-validation failures retry once and avoid incomplete cache entries, verified by passing `node --test test/api.test.js` retry/cache cases.
- [x] Loaded settings are normalized after migration, verified by passing `node --test test/storage.test.js` regression cases.
- [x] The API/storage slice passes focused checks, verified by `node --test test/api.test.js test/storage.test.js` output.
