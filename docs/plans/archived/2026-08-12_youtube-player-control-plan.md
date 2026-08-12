# YouTube Player Control Plan

## Goal

Add a Vibe Translator icon to YouTube’s in-player control bar that starts subtitle translation, including auto-generated captions, while preserving the browser-toolbar action’s existing whole-page behavior.

## Assumptions

- The control is icon-only but has an accessible label and tooltip.
- Clicking it starts translation and turns on available native captions when possible.
- YouTube is the only site receiving automatic content-script injection.

## Plan

- [x] Add tested player-control state, placement, native-caption activation, and runtime-message behavior in `src/youtube-player-control.js`, `src/content-subtitles.js`, and `src/translator-messages.js`; verified by focused unit tests.
- [x] Declare YouTube-only automatic content-script injection in `manifest.json` and keep `chrome.action.onClicked` unchanged.
- [x] Make the control survive YouTube DOM replacement and reset on SPA navigation through the content observer and `yt-navigate-finish` handling.
- [x] Update the YouTube E2E to click the in-player icon on `g7AxxkywiFI` and verify player bounds, accessibility, active state, auto-caption metadata, cue updates, and stale-result rejection.
- [x] Update user documentation and run formatting, linting, unit, packaging, and browser checks; Biome, 137 unit tests, package inspection, and `npm run e2e:youtube` pass.

## Completion Checklist

- [x] The Vibe Translator icon appears inside the YouTube bottom control bar without crossing player bounds; asserted by Playwright and recorded in `e2e-artifacts/youtube-subtitle-translation.png`.
- [x] Clicking it starts translation for native and auto-generated captions; verified by unit track-selection coverage and the in-player E2E click.
- [x] Toolbar-icon behavior remains unchanged; the existing action listener still calls whole-page `translatePage`.
- [x] The button has idle, loading, active, and recoverable error states with accessible labels; verified by state tests and missing-settings E2E coverage.
- [x] Automated checks and browser verification pass.
