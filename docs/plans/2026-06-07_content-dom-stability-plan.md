## Goal

Make content-script DOM extraction and rendering stable on dynamic pages and complex layouts. Success means source IDs do not collide, table translations preserve table structure, site-owned classes are not mistaken for extension ownership, and benign mutations do not trigger unnecessary retranslation.

## Context

The review found dynamic `data-ot-source-id` reuse, table-cell note insertion that can add table columns, broad `.translation` ownership checks, class/style mutation churn, selection-panel measurement reuse issues, and viewport option zero-value normalization bugs.

## Architecture

- `content.js` owns source IDs, mutation observation, extraction lifecycle, note placement, and extension-owned DOM checks.
- `content-extraction.js` owns reusable selectors and candidate scoring helpers.
- `content-selection-panel.js` owns floating selection panel layout state.
- `content-viewport.js` owns viewport window option normalization and candidate ordering.

## Non-Goals

- Do not redesign candidate scoring except where `.translation` ownership affects eligibility.
- Do not change background orchestration or API validation in this slice.

## Plan

- [ ] Replace count-based source ID allocation in `content.js` with a monotonic page-level counter or max existing `ot-N` scanner so removed nodes cannot cause ID reuse; verify with a content unit/fixture test that removes an `ot-N` source and assigns a new higher ID.
- [ ] Change table-cell note placement in `content.js` so `td` and `th` translations render inside the source cell or another structure-preserving target instead of sibling cells; verify with a DOM fixture asserting table column count is unchanged after placeholder and ready rendering.
- [ ] Replace generic `.translation` ownership checks in `content.js` and `content-extraction.js` with extension-specific markers such as `data-ot-role`, while retaining styling classes only for extension nodes; verify with a content extraction regression where site content under a `.translation` container remains eligible and extension-owned `data-ot-role` nodes remain skipped.
- [ ] Narrow mutation stale handling in `content.js` so class/style/attribute changes compare current extracted text to last translated text before marking a source stale; verify with a fixture test where toggling a class leaves an existing ready note intact and does not queue a duplicate item.
- [ ] Fix `content-selection-panel.js` expandability measurement so reused panels reset to collapsed layout before measuring new content; verify with `test/content-selection-panel.test.js` for expanded-to-short-content reuse.
- [ ] Fix `content-viewport.js` and the fallback viewport helper in `content.js` so explicit `0` for `prefetchViewports`, `topPrefetchViewports`, and `topMargin` is preserved; verify with `test/content-viewport.test.js` zero-value cases.
- [ ] Run focused checks for this slice with `node --test test/content.test.js test/content-selection-panel.test.js test/content-viewport.test.js`; verify all tests pass.

## Unknowns

- Whether appending table-cell translations inside the cell is visually acceptable on representative sites; resolve with a fixture screenshot or manual QA note before closing the table-cell task.

## Risks

- Text comparison during mutation handling may add cost on highly dynamic pages; mitigate by limiting comparison to affected source elements and using existing debounced observer timers.
- Replacing `.translation` ownership checks could accidentally include old extension notes if marker matching is incomplete; mitigate with tests that extension-owned `data-ot-role` nodes are still skipped.

## Completion Checklist

- [ ] Source IDs remain monotonic across node removal, verified by a content regression test.
- [ ] Table translations preserve table structure, verified by a DOM fixture with unchanged column count.
- [ ] Site-owned `.translation` content is extractable while extension-owned nodes are skipped, verified by content extraction regression tests.
- [ ] Benign class/style mutations do not stale or requeue unchanged text, verified by a mutation fixture test.
- [ ] Selection panel reuse and viewport zero options are fixed, verified by `test/content-selection-panel.test.js` and `test/content-viewport.test.js`.
- [ ] The content DOM slice passes focused checks, verified by `node --test test/content.test.js test/content-selection-panel.test.js test/content-viewport.test.js` output.
