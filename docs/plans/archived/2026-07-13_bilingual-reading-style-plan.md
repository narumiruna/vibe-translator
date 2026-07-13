## Goal

Replace underline-heavy translation rendering with a polished, content-first bilingual reading style that clearly separates source and translation without resembling spellcheck or debug markup.

## Architecture

Keep host-page source typography untouched to avoid breaking arbitrary sites. Restyle extension-owned inline notes as responsive reading cards with a subtle surface, 3px accent rule, restrained label, readable serif-oriented font stack, bounded line measure, and dark-mode parity. Remove underline controls from the options UI while retaining storage normalization for backward compatibility with existing saved settings.

## Non-Goals

- Do not override host-page widths or source fonts globally.
- Do not add copy/retranslate controls until those actions exist.
- Do not introduce external fonts or dependencies.

## Plan

- [x] Add executable visual assertions that inline notes have no text decoration and use a surfaced accent treatment; the mock E2E failed on the previous transparent background before implementation.
- [x] Implement the responsive inline translation card and subtle target-language label, including pending, stale, code, mobile, dark-mode, and reduced-motion states; verified in desktop and 390px Antirez browser captures.
- [x] Remove obsolete underline controls and documentation while preserving stored-setting compatibility; options now show a static bilingual reading preview and legacy storage normalization remains intact.
- [x] Verify formatting, linting, unit tests, mock E2E, and live Antirez article/comment rendering at desktop and mobile widths; 105 tests and both mock E2E suites passed, with live 1280px and 390px captures.

## Completion Checklist

- [x] Inline translation text has no underline and is visually separated by background plus left accent, verified by computed-style E2E assertions.
- [x] Original and translated paragraphs remain individually paired rather than merging into a text wall, verified on the live Antirez page.
- [x] Translation measure, spacing, typography, dark mode, and reduced motion meet the documented reading style; the 52rem/44em bounds, WCAG-compliant colors, and media-query assertions are in place.
- [x] Options UI no longer advertises underline customization and shows the bilingual reading preview instead.
- [x] Automated checks and browser regressions pass, and the completed plan is archived.
