## Goal

Introduce internal site profiles so DOM extraction and note insertion can use site-specific rules for X/Twitter and Threads while all other sites continue to use a safe default profile. Success means X and Threads selectors are isolated from generic extraction, no user-facing settings are added, empty profile selector groups cannot throw DOM selector errors, and existing page translation behavior remains covered by tests.

## Context

The current social selectors lived directly in `content-extraction.js`. This fixed recent X and Threads regressions, but the rules were mixed into the generic readable block selector. X has at least two post body variants: `div[data-testid="tweetText"]` and `article[data-tweet-id] div[dir="auto"].whitespace-pre-wrap:has(> span)`. Threads uses `div[lang]:has(> div > span[dir="auto"])` and needs interactive descendants such as native Translate buttons skipped during extraction.

## Architecture

Implemented an internal profile layer, not storage-backed user settings. `content-site-profiles.js` exposes browser globals and CommonJS exports for tests, including:

- `normalizeHostname(hostname)` to lowercase and strip trailing dots.
- `resolveSiteProfile(hostname)` to return `default`, `x`, or `threads` without reading global `location`.
- `getActiveSiteProfile(locationLike)` to adapt runtime `window.location` to the pure resolver.
- `buildProfileSelectors(...)` / `buildSelector(...)` helpers that filter empty selectors and return `:not(*)` when a selector group would otherwise be empty.

Profiles are internal code data:

- `default` profile: generic article/document selectors and no site-only social selectors.
- `x` profile: exact host matching for X/Twitter and X post body direct note targets.
- `threads` profile: exact host matching for Threads and Threads post body direct note targets.

`content-extraction.js` keeps its public extraction API stable for `content.js`, but exported selector constants are built from the default rules plus the active profile. Injection, syntax-check, release packaging, and E2E temp extension file lists include `content-site-profiles.js` before `content-extraction.js`.

## Non-Goals

- Do not add options UI, storage fields, or user-editable site profile settings.
- Do not change API prompt settings, host permissions, or translation caching.
- Do not add broad social-network heuristics beyond the verified X and Threads selectors in this phase.
- Do not require generating a release zip during normal development verification unless packaging itself is being released.

## Plan

- [x] Add `content-site-profiles.js` with browser global and CommonJS exports for `normalizeHostname`, `resolveSiteProfile`, `getActiveSiteProfile`, and selector-builder helpers; verified by `node --check content-site-profiles.js` through `npm run check` and `test/content-site-profiles.test.js`.
- [x] Define safe host matching for X/Twitter and Threads profiles, including `x.com`, `www.x.com`, `twitter.com`, `www.twitter.com`, `mobile.twitter.com`, `threads.net`, and `www.threads.net`; verified by resolver tests including `notx.com`, `x.com.evil.example`, and `threads.net.evil.example` negatives.
- [x] Implement selector-building so empty selector lists are filtered and never passed directly to `matches()` or `querySelectorAll()`; verified by `buildProfileSelectors` tests returning the safe `:not(*)` selector.
- [x] Move the existing X/Twitter and Threads social text selectors out of generic selector definitions in `content-extraction.js` and into their profiles; verified by default-profile selector tests and profile-specific selector tests.
- [x] Keep `content-extraction.js` exports stable for `content.js` by exporting active-profile selector constants with the same names (`READABLE_BLOCK_SELECTOR`, `DIRECT_NOTE_TARGET_SELECTOR`, `SOCIAL_TEXT_BLOCK_SELECTOR`, etc.); verified by `npm run check` passing all consumers.
- [x] Add regression coverage for the current X post body selector and the Threads post body selector using profile-specific selector tests; verified by named tests in `test/content.test.js` and `test/content-site-profiles.test.js`.
- [x] Expose the active profile id in extraction debug data as `debug.profileId` and render it in the debug panel when debug mode is enabled; verified by `test/content.test.js` checking the debug profile label.
- [x] Update loading, E2E temp-copy, and packaging lists in `background.js`, `e2e/lib/extension-test-helpers.js`, `e2e/extension-smoke.js`, `package.json`, and `justfile` so `content-site-profiles.js` is injected before `content-extraction.js`, syntax-checked by `npm run check`, included in release zip file lists, and available to smoke tests; verified by `rg -n "content-site-profiles|TranslatorContentSiteProfiles|content-extraction" background.js justfile package.json e2e` plus `npm run check` and `PLAYWRIGHT_HEADLESS=1 npm run e2e:mock`.
- [x] Run formatting and linting for touched files with `biome format --write --files-ignore-unknown=true <files>` and `biome lint --write --files-ignore-unknown=true <files>`; verified by both commands completing without remaining fixes.

## Risks

- Loading order mistakes could make `content-extraction.js` initialize without profile data; mitigated by adding `content-site-profiles.js` before extraction in `background.js` and providing a CommonJS/browser fallback path for tests.
- Selector merging could accidentally make default extraction too narrow or too broad; mitigated with explicit default-profile tests and existing article/content tests.
- Unsafe host matching could apply X rules to unrelated domains; mitigated with exact host tests and deceptive-domain negative tests.
- Empty selector groups could throw DOM exceptions if passed to DOM APIs; mitigated with selector-builder tests before changing extraction logic.

## Completion Checklist

- [x] Built-in site profiles exist and are verified by `test/content-site-profiles.test.js` for default, X/Twitter, and Threads host resolution, including `www`/mobile variants and deceptive-domain negatives.
- [x] Selector-builder helpers are verified to filter empty entries and avoid DOM selector exceptions for empty profile selector groups by `buildProfileSelectors([], []) === ":not(*)"` in `test/content-site-profiles.test.js`.
- [x] X/Twitter and Threads selectors are no longer hard-coded into the generic default selector set, verified by default-profile selector assertions in `test/content.test.js` and `test/content-site-profiles.test.js`.
- [x] Page extraction still recognizes the current X post body selector and Threads post body selector, verified by regression tests in `test/content.test.js` and `test/content-site-profiles.test.js`.
- [x] The active profile id is available in extraction debug output and rendered when debug mode is enabled, verified by `test/content.test.js` checking `debugInfo.profileId` and `Profile: default` / `Profile: x` labels.
- [x] The new module is loaded, syntax-checked, packaged, and copied into E2E extension fixtures, verified by `background.js`, `package.json`, `justfile`, `e2e/lib/extension-test-helpers.js`, `e2e/extension-smoke.js`, `rg -n "content-site-profiles|TranslatorContentSiteProfiles|content-extraction" background.js justfile package.json e2e`, `npm run check`, and `PLAYWRIGHT_HEADLESS=1 npm run e2e:mock`.
- [x] No user-facing site profile settings were added, verified by `git diff -- storage.js options.html options.js` producing no output and `npm run check` passing 94 tests.
