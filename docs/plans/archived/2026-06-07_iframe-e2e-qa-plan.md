## Goal

Add iframe selection coverage, align CI/local quality gates, and update QA documentation for the fixed review issues. Success means selection translation works in the selected frame, CI checks the same shipped scripts as local checks, mock e2e can run in a prepared environment, and manual QA covers the new regressions.

## Context

The review found that `frameId` is used for selection anchor lookup but not for injection or render messages. Local e2e mock execution is currently blocked until Playwright dependencies are installed. CI syntax checks only a subset of shipped scripts compared with `npm run check`.

## Architecture

- `background.js` must route iframe selection injection and render messages consistently with MV3 `frameId` semantics.
- `e2e/extension-smoke.js` and fixtures exercise extension behavior in real Chromium.
- `.github/workflows/ci.yml`, `package.json`, and `justfile` define quality gates.
- `docs/TESTING.md` owns manual QA coverage.

## Non-Goals

- Do not solve page translation inside arbitrary cross-origin iframes beyond what the selection iframe regression requires.
- Do not add continuous e2e to CI unless a separate decision accepts the runtime cost.

## Unknowns

- Whether `chrome.tabs.sendMessage(tabId, message, { frameId })` and targeted `chrome.scripting.executeScript({ target: { tabId, frameIds: [...] } })` are sufficient for all selected iframe scenarios; resolve with an early same-origin iframe fixture before broader handling.
- Whether mock e2e can run in the current local environment after `npm ci`; if browser binaries or Chrome are unavailable, document the exact command blocker.

## Plan

- [x] Add a same-origin iframe fixture under `test/` or extend `test/fixture-page.html` so selection text exists inside an iframe; verify by loading the fixture in Playwright and reading non-empty selected iframe text.
- [x] Confirm MV3 targeted frame messaging behavior for selection translation by routing content script injection and render messages through `frameId` when present; verify with an iframe e2e/helper assertion that the selection panel appears in the iframe document and not in the top document.
- [x] Extend `e2e/extension-smoke.js` or add a focused e2e script for iframe selection translation; verify with `npm run e2e:mock` after dependencies are installed.
- [x] Update `.github/workflows/ci.yml` so syntax coverage matches shipped scripts, preferably by running `npm run check` after dependency installation or by matching its full `node --check` list; verify by inspecting the workflow and running `npm run check` locally.
- [x] Confirm `package.json` and `justfile` stay aligned for shipped script checks after any CI change; verify by comparing the check command lists or by replacing duplicated lists with `npm run check` where feasible.
- [x] Install dev dependencies if absent with `npm ci` and run `npm run e2e:mock`; verify smoke output passes, or record the exact environment blocker if browser/runtime prerequisites are unavailable.
- [x] Update `docs/TESTING.md` with manual QA entries for iframe selection, table-cell translation, partial API failure UI, and dynamic class-toggle behavior; verify the named checklist entries exist.
- [x] Run final project gates after all split plans are implemented: `biome format --write && biome lint --write`, `npx biome lint .`, `npm run check`, and `npm run e2e:mock`; verify command outputs are captured for completion review.

## Risks

- Iframe routing may behave differently for cross-origin frames; mitigate by documenting same-origin automated coverage and a bounded manual cross-origin check if available.
- Installing Playwright may require browser binaries or system Chrome; if unavailable, record the blocker rather than treating e2e as silently skipped.
- CI simplification could accidentally require dev dependencies before they are installed; mitigate by keeping setup-node/install ordering explicit.

## Completion Checklist

- [x] Iframe selection translation is verified by a same-origin iframe e2e test where the panel renders in the iframe document.
- [x] CI syntax coverage matches local shipped-script checks, verified by `.github/workflows/ci.yml` inspection and `npm run check` output.
- [x] Local mock e2e status is known, verified by `npm ci` if needed and `npm run e2e:mock` pass output or a documented concrete environment blocker.
- [x] Manual QA documentation covers iframe selection, table cells, partial API failures, and dynamic mutation behavior, verified by `docs/TESTING.md` entries.
- [x] Final quality gates are recorded, verified by `biome` being unavailable locally, the successful `npx biome format --write --files-ignore-unknown=true ...` / `npx biome lint .` fallback, `npm run check`, and `npm run e2e:mock` outputs.
