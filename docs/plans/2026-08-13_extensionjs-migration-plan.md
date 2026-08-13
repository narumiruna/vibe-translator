# Extension.js Full Migration Plan

## Goal

Migrate Vibe Translator from a directly loaded Manifest V3 source tree to a fully bundled Extension.js project while preserving Chrome behavior, permissions, storage, UI, and store-update compatibility.

The migration is complete when Extension.js owns development, production build, preview, logging, and ZIP creation; shipped JavaScript uses explicit ESM dependencies; content-script reinjection has a cleanup lifecycle; and automated tests run against the production artifact.

## Context

- The current extension ships raw files from `src/` and has no production build step.
- `src/background.js` is 1,277 lines and loads eleven helpers through `importScripts()`.
- `src/content.js` is 3,376 lines and depends on ordered `window.Translator*` globals.
- The options page loads nine classic scripts in a fixed order.
- General pages and embedded frames receive scripts dynamically after optional host permission is granted.
- YouTube receives the same content code through manifest registration and uses a Chromium `MAIN`-world script for captions.
- The E2E harness copies source files, patches a test manifest, and calls private service-worker globals.
- Extension.js 4.0.32 successfully built the current project in a temporary pilot.
- The pilot passed the complete mock smoke suite after the E2E harness loaded `dist/chrome` and used an explicit test hook.
- Extension.js currently reports four high-severity development-tool advisories through `less` and `image-size`, so cutover requires a documented disposition.

## Architecture

The final source layout should follow these responsibility boundaries.

```text
manifest.json
extension.config.mjs
src/
  background/
    index.js
    controller.js
    context-menus.js
    content-injection.js
    permissions.js
    page-translation.js
    selection-translation.js
    youtube.js
  content/
    index.js
    lifecycle.js
    page-session.js
    extraction/
    rendering/
    selection/
    youtube/
  options/
    index.html
    index.js
    styles.css
    appearance.js
  translation/
    api.js
    cache.js
    chunk-plan.js
    protected-fragments.js
    responses.js
  shared/
    appearance.js
    embedded-frames.js
    logger.js
    messages.js
    settings.js
    translation-session.js
```

`manifest.json` remains the reviewed source of truth for permissions and extension entrypoints.

The manifest declares one bundled content entry for YouTube.

Dynamic page and frame injection reads the emitted content-script filenames from `chrome.runtime.getManifest()` so the manifest and on-demand path cannot drift.

The background entrypoint registers browser listeners and delegates behavior to a testable controller.

The content entrypoint exports one mount function and returns one cleanup function for Extension.js reinjection.

Pure modules export ESM APIs directly and do not assign browser globals.

Options HTML loads one module entrypoint and lets Extension.js bundle its imports and CSS.

Background, content, and options logs share a redacted event shape with correlation identifiers.

## Tech Stack

- Pin `extension` to an exact reviewed version, starting with `4.0.32`.
- Keep plain JavaScript and Node's built-in test runner.
- Set `package.json` to ESM and convert tests and E2E utilities from `require()` to `import`.
- Keep Playwright for Chromium extension E2E tests.
- Keep Biome for formatting and linting.
- Disable Extension.js telemetry in repository commands and CI.

## Assumptions

- Chrome Manifest V3 remains the release target for this migration.
- Firefox production support is a separate compatibility project.
- Existing `chrome.*` behavior remains unchanged during this migration.
- The settings schema and stored key names remain unchanged.
- No store submission occurs until every completion gate passes.

## Non-Goals

- Do not redesign the options page or translation UI.
- Do not add React, Vue, Svelte, TypeScript, or another application framework.
- Do not change translation prompts, batching behavior, permissions, or supported sites.
- Do not claim Firefox runtime parity merely because `extension build --browser=firefox` succeeds.
- Do not automate Chrome Web Store submission in this migration.

## Execution Evidence

- `npm run check` passes 151 unit tests, builds `dist/chrome`, and verifies manifest parity, referenced files, one content bundle, production-only contents, and a 400 KB unpacked budget.
- `PLAYWRIGHT_HEADLESS=1 npm run e2e:mock` passed twice consecutively with independent temporary profiles on 2026-08-13.
- `npm run zip` produced and verified `dist/chrome/vibe-translator-0.1.3.zip` at about 82 KB.
- `npm run build:firefox` compiles with the expected Firefox data-consent warning; runtime parity remains a non-goal.
- `npm run dev -- --no-browser` reached the Extension.js ready state and emitted `dist/extension-js/chrome/ready.json`.
- `npm audit` still reports `GHSA-jmr9-qjv8-65gv` through the unused development-only store-import path; the latest reviewed Extension.js release has no patched chain yet, and the disposition is documented in `README.md`.

## Plan

### Phase 1: Freeze behavior and establish artifact contracts

- [x] Capture the current normalized `manifest.json`, ZIP file list, ZIP size, and the result of `npm test`; store the non-secret baseline in a fixture used by build verification.
- [x] Add manifest-parity tests that require exact equality for permissions, host permissions, optional host permissions, action metadata, YouTube matches, and `run_at`; verify with `npm test`.
- [x] Add storage compatibility fixtures covering current defaults, legacy underline migration, appearance settings, disabled domains, and prompt templates; verify with `npm test`.
- [x] Record the existing mock E2E, YouTube, Antirez/Disqus, and Syosetu commands as migration gates in this plan without changing their expected behavior.
- [x] Add a ZIP inspection test that rejects source-only files, tests, credentials, nested ZIPs, development reload code, and duplicate content bundles; verify against a temporary current and pilot artifact.

### Phase 2: Introduce Extension.js without changing runtime behavior

- [x] Add an exact `extension` development dependency and ESM package configuration to `package.json`; verify a clean `npm ci` succeeds on Node 22 or newer.
- [x] Add `dev`, `build`, `preview`, `zip`, `build:firefox`, and `verify:build` scripts that use Extension.js and disable its telemetry; verify each command is non-interactive and documented.
- [x] Add `extension.config.mjs` with a persistent isolated Chrome development profile, bounded debug logging defaults, and no permission mutation; verify `extension dev --no-browser` reaches the documented ready state.
- [x] Add `dist/`, `.extension-js/`, generated profiles, `extension-env.d.ts`, and generated ZIPs to `.gitignore`; verify `git status --short` stays clean after a build.
- [x] Make `extension build --browser=chrome` emit `dist/chrome` and compare its normalized manifest to the baseline; verify only intentional entrypoint paths differ.
- [x] Determine and test the one-bundle strategy for manifest registration and dynamic injection by resolving the emitted content script through `chrome.runtime.getManifest()`; reject any build that also copies raw content helpers into the ZIP.
- [x] Run `npm audit` and either upgrade to an exact patched Extension.js release or document the reachability and ownership of every remaining development-only advisory; require no unreviewed high or critical finding before cutover.

### Phase 3: Convert shared translation logic to ESM

- [x] Move API request, response, protected-fragment, cache, and chunk-plan code into `src/translation/` with named ESM exports; verify their existing unit tests pass without browser globals.
- [x] Move settings, appearance, messages, embedded-frame rules, and translation-session code into `src/shared/` with named ESM exports; verify their existing unit tests pass.
- [x] Remove every `module.exports`, conditional `require()`, and `root.Translator*` assignment from migrated shared modules; verify with a repository `rg` assertion.
- [x] Convert all affected unit tests to ESM imports while retaining Node's built-in test runner; verify all 145 existing tests still pass or have one-to-one replacements.
- [x] Add circular-dependency and entrypoint-import checks that fail when a shared module imports background, content, or options code; verify with `npm run check`.

### Phase 4: Migrate the options entrypoint

- [x] Move the options surface to `src/options/index.html`, `index.js`, `styles.css`, and `appearance.js`; verify Extension.js emits one options JavaScript bundle and one CSS asset.
- [x] Replace ordered classic `<script>` tags with one `type="module"` entrypoint and explicit imports; verify no `Translator*` global is required by the page.
- [x] Preserve all field IDs, tab behavior, validation, permission requests, live previews, unsaved-state behavior, and connection tests; verify with options unit tests and the options smoke suite.
- [x] Resolve the options URL from the generated manifest in E2E code instead of hard-coding `src/options.html`; verify the test works after Extension.js rewrites the output path.
- [x] Verify the generated options page has no inline remote code and complies with the MV3 content security policy.

### Phase 5: Migrate and split the background entrypoint

- [x] Create `src/background/index.js` as the only background entrypoint and move all listener registration into one startup function; verify each Chrome event has exactly one listener after startup.
- [x] Replace `importScripts()` with explicit ESM imports and configure the manifest background as a module service worker; verify the production artifact contains no `importScripts(` call.
- [x] Extract context-menu sequencing into `context-menus.js` while preserving callback-wrapped `runtime.lastError` handling; verify duplicate-menu regression tests pass.
- [x] Extract host-permission and embedded-frame discovery into `permissions.js` and `content-injection.js`; verify optional origins never become required host permissions.
- [x] Extract page translation, selection translation, and YouTube orchestration into focused modules under 1,000 lines; verify existing queue, frame-routing, stale-request, and teardown tests pass.
- [x] Introduce a background controller whose public commands are used by toolbar clicks, context menus, runtime messages, and E2E; verify E2E no longer references private worker functions.
- [x] Add sender validation to internal runtime commands and accept commands only from this extension's own contexts; verified by `test/background-controller.test.js`.
- [x] Preserve service-worker restart behavior by keeping durable settings in storage and treating in-memory sessions as disposable; verify a worker restart does not corrupt later translations.

### Phase 6: Migrate and split the content entrypoint

- [x] Create `src/content/index.js` as the only content entrypoint and import extraction, rendering, selection, viewport, message, appearance, and YouTube modules explicitly.
- [x] Export a default mount function compatible with Extension.js content-script wrapping; verify one initial injection starts one runtime message listener and one page lifecycle.
- [x] Add `src/content/lifecycle.js` to own event listeners, observers, timers, animation frames, and teardown callbacks; verify cleanup removes every owned resource.
- [x] Return a cleanup function from the content entrypoint that stops observers, timers, scroll handlers, YouTube controls, diagnostics panels, and pending UI work without deleting host-page content.
- [x] Replace the `window.__OPENAI_TRANSLATOR_CONTENT__` guard with lifecycle-managed idempotency; verify repeated injection and HMR never duplicate notes, listeners, controls, or requests.
- [x] Split page extraction, page-session queueing, note rendering, selection rendering, and YouTube behavior into focused files below 1,000 lines; verify source snapshots and DOM behavior remain unchanged.
- [x] Remove all `window.Translator*`, conditional `require()`, and content helper load-order assumptions; verify with a repository `rg` assertion and production bundle inspection.
- [x] Preserve frame-aware source identities, `allFrames` discovery, frame-targeted messaging, and optional-permission behavior; verify iframe and Disqus regressions pass.
- [x] Preserve Chromium `world: "MAIN"` YouTube caption activation as an explicit browser-specific adapter; verify the generated Chrome manifest gains no new permission.
- [ ] Add reinjection tests that edit the content entry during `extension dev` and prove the old lifecycle is disposed before the new lifecycle mounts.

### Phase 7: Add debugging and observability as first-class behavior

- [x] Add `src/shared/logger.js` with structured `debug`, `info`, `warn`, and `error` events carrying component, event, session ID, request ID, tab ID, frame ID, and bounded numeric summaries; verified by `test/logger.test.js`.
- [x] Redact API keys, authorization headers, prompts, selected text, full page text, and raw response bodies before any log call; verify with logger unit tests using known secret fixtures.
- [ ] Instrument action/menu invocation, settings load, permission checks, injection, extraction totals, queue transitions, API attempts, cache results, render totals, stale results, teardown, and failures; action/menu, page-batch, page-start, selection-start, render-complete, and failure events are present, but full settings/permission/cache/teardown coverage remains.
- [ ] Reuse page, selection, and YouTube correlation IDs across background and content messages; page session and selection request IDs cross context boundaries, but YouTube diagnostics are not yet unified with the structured logger.
- [x] Configure documented Extension.js context logging for background, content, page, and options surfaces; verify `npm run dev` shows labeled logs from each context.
- [x] Add documented recipes for filtering logs by context, URL, and tab and for reading Extension.js readiness metadata; verify each recipe against a running development build.
- [ ] Preserve the in-player YouTube diagnostics panel and make it consume the same redacted lifecycle events where practical; verify copied diagnostics contain no secret fixture.

### Phase 8: Move E2E to production artifacts

- [x] Change the Playwright harness to run `npm run build` and copy `dist/chrome` into a temporary extension-under-test directory; verify source files are never loaded directly.
- [x] Patch only temporary test host permissions and never mutate `dist/chrome/manifest.json`; verify the original artifact hash is unchanged after E2E.
- [x] Replace `EXTENSION_FILES` with recursive artifact copying and an explicit exclusion for ZIPs and Extension.js metadata; verify the loaded directory matches the verified build.
- [x] Replace worker-global calls with the validated background controller runtime commands; verify page and selection smoke tests exercise the same orchestration as user entrypoints.
- [x] Replace background, content, and options global-presence assertions with health responses that report mounted modules and build version; verify no production global exposure is needed.
- [x] Make options and background URLs derive from the generated manifest and service-worker discovery; verify tests do not contain Extension.js output paths except the artifact root.
- [x] Run the complete mock smoke suite twice consecutively to detect lifecycle and profile leakage; verify both runs pass with independent temporary profiles.
- [ ] Run YouTube, Antirez/Disqus, and Syosetu regressions against `dist/chrome`; YouTube passes after a bundled-runtime timing assertion was made multi-note-safe, while live Antirez/Disqus and Syosetu currently reach their pages but do not complete translations and remain open for investigation.
- [ ] Add an E2E assertion that content-script reinjection does not duplicate controls, notes, observers, or runtime responses; the smoke suite now verifies health, no duplicate notes, and no extra API request after production-bundle reinjection, while control/observer counts still need explicit assertions.

### Phase 9: Replace packaging and CI

- [x] Replace `scripts/package-extension.py` and the custom `just zip` recipe with `extension build --browser=chrome --zip`; verify the output name includes manifest version `0.1.3` or the current release version.
- [x] Add `scripts/verify-build.mjs` to validate manifest parity, referenced-file existence, ZIP contents, no duplicate bundles, and an agreed size budget; verify it fails on a deliberately corrupted artifact.
- [x] Update `npm run check` and `just check` to run syntax or module checks, unit tests, a production build, and build verification in a deterministic order.
- [x] Update GitHub Actions to run `npm ci`, Biome, unit tests, Extension.js production build, build verification, and headless mock E2E with an installed Playwright Chromium.
- [ ] Upload the verified Chrome ZIP and E2E diagnostics as CI artifacts without publishing them; workflow is configured in `.github/workflows/ci.yml`, but a hosted pull-request run is still required.
- [x] Run `biome format --write` and `biome lint --write` after code changes, then rerun the complete check pipeline; focused Biome checks and `npm run check` pass.
- [x] Delete the obsolete Python packager only after the Extension.js ZIP and rollback artifact have both been verified.

### Phase 10: Documentation, upgrade rehearsal, and cutover

- [x] Update `README.md` with Extension.js install, dev, log, build, preview, test, and ZIP commands; verify every documented command succeeds from a clean checkout.
- [x] Update `docs/E2E.md` to describe production-artifact testing, controller commands, temporary permissions, and Extension.js readiness metadata.
- [x] Update `docs/TESTING.md` with an HMR/reinjection checklist and a structured-log debugging checklist.
- [x] Update `AGENTS.md` to describe the new entrypoints, generated output, required format/lint/build commands, and artifact verification.
- [ ] Rehearse updating from the last released extension to the migrated build with unchanged settings and permissions; verify stored configuration loads and Chrome shows no unexpected permission prompt.
- [x] Compare old and new normalized production manifests and obtain explicit review for every difference.
- [ ] Run the complete manual checklist on the migrated production build, including reload and tab-close teardown scenarios.
- [ ] Keep the last known-good store ZIP and migration commit available as rollback artifacts before publishing.
- [ ] Bump the extension version only after migration acceptance, then create the final verified Extension.js ZIP without submitting it automatically.

## Risks

- Extension.js content-script HMR can duplicate long-lived resources unless cleanup ownership is complete.
- Bundling can hide service-worker functions that current E2E reaches as globals, so controller commands must replace that coupling.
- Manifest rewriting changes output paths, so tests and runtime injection must derive paths rather than hard-code them.
- Keeping both manifest content scripts and traced runtime files can duplicate the content payload and increase store ZIP size.
- A service-worker module changes loading semantics, so code with runtime side effects must be moved into explicit startup functions.
- Extension.js is actively changing, so exact version pinning and build-artifact tests are required.
- Current Extension.js transitive development advisories require a visible disposition before adoption.
- Successful Firefox compilation does not prove Firefox API, permission, or YouTube `MAIN`-world compatibility.

## Rollback / Recovery

The migration should land in phase-sized commits that each leave tests and the Chrome production artifact usable.

Keep the old packaging path until the new production-artifact E2E and ZIP verification pass.

Do not change storage keys or delete migration readers, so reverting the extension code does not require user-data rollback.

If the migrated store candidate requests new permissions, duplicates injected UI, or fails the update rehearsal, stop the release and restore the last known-good ZIP.

## Completion Checklist

- [x] Extension.js is the only development, build, preview, and ZIP tool.
- [x] The exact Extension.js version is pinned and all high or critical advisories have a reviewed disposition.
- [x] Production source uses ESM and contains no `importScripts()`, `module.exports`, conditional `require()`, or `window.Translator*` globals.
- [x] Background and content files are split below the repository's 1,000-line limit.
- [ ] Content mount and cleanup pass repeated injection and HMR tests.
- [x] Generated permissions and host permissions are semantically identical to the pre-migration manifest.
- [x] All existing unit behaviors have passing ESM tests.
- [ ] Mock smoke, YouTube, Antirez/Disqus, and Syosetu tests load `dist/chrome` and pass; mock smoke and YouTube pass, but the two live-site suites remain unresolved.
- [ ] Structured cross-context logs trace page, selection, and YouTube requests without leaking secrets or source text.
- [x] Production ZIP verification passes and finds no duplicate content payload or development-only file.
- [ ] Clean-checkout CI produces a verified Chrome ZIP and passing headless mock E2E evidence; local commands pass and workflow is configured, but hosted evidence is pending.
- [ ] Upgrade rehearsal preserves settings and introduces no unexpected permission prompt.
- [x] README, E2E, manual testing, and repository guidance describe the Extension.js workflow.
- [ ] A last known-good rollback ZIP is retained before the first migrated release.
