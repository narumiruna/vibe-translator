## Goal

Move shipped extension source files out of the repository root into `src/` without changing runtime behavior.

## Architecture

Keep the current small, flat module set intact under `src/`. Keep repository metadata, tests, E2E harnesses, documentation, and `manifest.json` at the root. This avoids an unrelated module-boundary refactor while giving shipped code one clear home.

## Plan

- [x] Move runtime JavaScript and options UI files into `src/`; verified by `find src -maxdepth 1 -type f` and the root now has no shipped `.js`, `.html`, or `.css` files.
- [x] Update manifest, injection paths, test imports, E2E packaging, scripts, zip recipe, and documentation to use `src/`; verified by repository-wide `rg` review and a package archive containing `src/background.js`, `src/options.html`, and `docs/TESTING.md` without root source files.
- [x] Format and lint the moved sources, then run `npm run check` and mock extension E2E; `npm run check` passed 96 tests and the headed-independent mock E2E passed all six smoke flows.

## Risks

- MV3 service-worker and `chrome.scripting` paths resolve differently: keep `importScripts` and options-relative paths local to `src/`, but make injected script paths explicitly extension-root-relative (`src/...`).
- Chrome Web Store archives could omit moved files: verify the zip recipe includes the complete `src/` tree.

## Completion Checklist

- [x] All shipped source is under `src/`, verified by an empty root-source `find` result and `manifest.json` paths.
- [x] Unit and syntax checks pass via `npm run check` with 96 passing tests.
- [x] The unpacked extension passes `PLAYWRIGHT_MOCK_API=1 PLAYWRIGHT_HEADLESS=1 npm run e2e:mock`, including options, page, selection, iframe, partial-failure, and selection-failure flows.
- [x] Packaging references include `src/` and contain no stale root source paths; `just zip` produced a valid archive with `src/background.js`, `src/options.html`, and `docs/TESTING.md`.
