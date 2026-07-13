## Goal

Add safe, detailed appearance customization for inline page translations and selection translation panels, with presets, separate light/dark colors, live preview, persistence, and backward-compatible defaults.

## Architecture

Create `src/translation-appearance.js` as the shared source of truth for presets, normalization, font mappings, color contrast, and safe CSS values. Store one nested `translationAppearance` object, forward it unchanged after normalization, and consume only its whitelisted enums, validated colors, and clamped numbers in extension-owned UI.

## Non-Goals

- No arbitrary CSS, arbitrary font names, host-source styling, dependencies, localization, or manifest version bump.
- Saved changes apply to the next translation; existing rendered notes are not proactively updated.

## Plan

- [x] Add failing unit specifications for presets, nested normalization, invalid/boundary values, legacy fallback, and contrast calculation; targeted tests first failed because the module/schema did not exist, then passed after implementation.
- [x] Implement the shared appearance module and migrate storage to the nested schema while silently dropping obsolete underline fields; 19 targeted appearance/storage tests pass.
- [x] Update worker/options/content load order and appearance payload flow; normalized settings now drive inline notes and selection panels while pending, stale, code, responsive, dark, and reduced-motion states remain covered by smoke tests.
- [x] Rebuild the Appearance options UI with presets, progressive advanced groups, separate theme preview, contrast feedback, Custom state, and appearance-only reset; options E2E verifies preset changes, warnings, reset isolation, and save/reload persistence.
- [x] Extend smoke E2E coverage for custom inline, selection, dark-mode, reduced-motion, and iframe rendering; mock smoke passes and Antirez/Disqus verifies all 20 loaded comments receive the custom appearance.
- [x] Update README and manual QA documentation with controls, migration behavior, accessibility feedback, and next-translation application timing.
- [x] Run formatting, lint, `npm run check`, mock smoke E2E, Antirez/Disqus E2E, and desktop/390px browser review; 111 tests pass, both E2E suites pass, packaging contains both new modules, and 390px checks report no horizontal overflow.

## Risks

- Large custom spacing could break narrow structural containers; clamp values and retain `max-width: 100%`/mobile constraints.
- Dynamic style interpolation could become an injection boundary; normalize every field in the shared module and map font enums to fixed stacks.
- Options may accidentally discard unrelated settings; Reset Appearance must mutate only appearance controls and save must include all existing form settings.

## Completion Checklist

- [x] Calm Reading exactly preserves the current default rendering and is used for missing/legacy settings, proven by preset unit assertions, storage migration tests, and default computed-style E2E assertions.
- [x] Presets, Custom state, theme preview, contrast warning, and Reset Appearance work and persist without altering unrelated settings, proven by options E2E including a save with sub-AA colors.
- [x] Inline and selection settings remain independent across page, iframe, light/dark, mobile, and reduced-motion cases, proven by separate computed styles, same-origin iframe checks, 20/20 Disqus comments, and 390px/desktop captures.
- [x] Invalid values and obsolete underline settings cannot inject CSS or escape documented bounds, proven by malformed enum/color/boolean/number and legacy migration unit tests.
- [x] All repository quality gates and documented E2E commands pass with `git diff --check`, Biome lint, 111 unit tests, mock smoke, Antirez/Disqus, and package-content verification.
