# Vibe Translator

A Manifest V3 Chrome extension that translates web pages using an OpenAI-compatible API. Translations appear inline next to the original text so you can read both side by side.

## Features

- Click the extension icon or right-click a page and choose **Translate entire page**
- Select text, right-click, and choose **Translate selected text**; a compact status panel shows progress, the target language, and the result
- Translations are injected as sibling blocks — the original text is never removed on ordinary pages
- Visible content translates first; more is queued as you scroll
- Available YouTube captions, including auto-generated tracks, are pretranslated in a playback-rate-aware rolling window and shown in saved bilingual or translation-only mode
- Text-based PDFs open in a PDF.js reader with selectable original pages, synchronized progressive translations, page highlighting, search, copy, encrypted-file support, and explicit complete-document translation
- Large pages are split into batches and translated with bounded parallel requests; oversized blocks are broken down recursively
- Inline code, file paths, URLs, math expressions, and common technical terms are protected by placeholder substitution so they are never mangled
- Fully configurable: API key, base URL, model, target language, and prompt templates
- Translation appearance is customizable with three presets, safe typography/layout controls, separate light/dark colors, and live contrast feedback
- Individual domains can be disabled from the options page

## Project Structure

| File | Purpose |
|---|---|
| `manifest.json` | Manifest V3 configuration |
| `icons/` | Extension icon source and generated PNG sizes |
| `src/background/` | MV3 listener entrypoint, controller, permissions, injection, and orchestration |
| `src/content.js` | Bundled content entrypoint and lifecycle owner |
| `src/content/` | Extraction, viewport, rendering, selection, styling, and YouTube modules |
| `src/translation/` | API requests, cache, chunking, responses, and protected fragments |
| `src/shared/` | Settings, appearance, messages, frame rules, logging, and sessions |
| `src/options/` | React options application, Radix UI sections, state model, Chrome adapters, previews, and scoped styles |
| `src/pdf/` | PDF.js reader, source validation, text and layout analysis, rendering, and persistent translation cache |
| `extension.config.mjs` | Extension.js development profile and context logging configuration |
| `scripts/verify-build.mjs` | Production manifest, file-reference, content-bundle, and size checks |
| `test/` | Node unit tests and compatibility fixtures |
| `e2e/` | Playwright tests that load `dist/chrome` |
| `docs/TESTING.md` | Manual QA checklist |

## Installation

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Run `npm run build`
4. Click **Load unpacked** and select `dist/chrome`
4. Open the extension's **Details → Extension options** to configure the API before use

## Configuration

All settings are on the options page.

The options interface uses locally bundled React and Radix Themes, Colors, Icons, and interaction primitives, with native form controls retained where browser semantics are stronger.

| Setting | Description |
|---|---|
| API Key | Secret key sent in the `Authorization` header |
| Base URL | Root URL of any OpenAI-compatible API (default: `https://api.openai.com/v1`) |
| Model | Model name, e.g. `gpt-4.1-mini` |
| Target Language | Language to translate into (default: `台灣正體中文`) |
| System Prompt Template | Full system prompt; supports `{{targetLanguage}}`, `{{itemCount}}`, `{{itemKind}}` |
| User Prompt Template | Full user prompt; must include `{{sourcePayload}}` |
| Reading Appearance | Calm Reading, Minimal, and High Contrast presets plus font, size, spacing, surface, accent, label, animation, and separate light/dark colors |
| Selection Panel Appearance | Independent width, font size, line height, radius, opacity, position, and light/dark colors |
| YouTube Subtitle Display | **Original and translation** keeps each native cue visible with its matching translation; **Translation only** hides that cue after its translation is ready |
| Disabled Domains | One domain per line; translation is silently skipped on matching hostnames |

The Appearance tab previews changes without saving and warns when translation text/background contrast is below WCAG AA. An unsaved-state label distinguishes previewed values from applied settings. **Reset Appearance** changes only the preview until **Save Settings** is used. Saved appearance changes apply the next time a page or selection is translated; existing rendered translations are not updated proactively.

Older underline settings are ignored and safely migrate to the Calm Reading appearance. Arbitrary CSS and font names are not accepted.

YouTube subtitles default to **Translation only**, preserving the behavior of existing saved settings. The selected mode applies when subtitle translation next starts or an active session is restored.

The options page also shows a live prompt preview and a **Test Connection** button that sends a sample request to confirm the API is reachable.

The extension requests access to supported YouTube pages for its in-player subtitle control.
It separately requests API host permission only for the origin derived from your configured **Base URL**.
When opening a remote PDF reader, it also requests only that PDF source origin and keeps the original PDF tab open.
PDF bytes stay in the browser, while extracted text is sent to the configured translation provider.

## Usage

### Translate a page

1. Open any `http://` or `https://` page
2. Click the extension icon, or right-click a blank area and choose **Translate entire page**
3. Translations appear below each original text block as the content enters the viewport

### Translate a PDF

1. Open a text-based HTTP or HTTPS PDF in Chrome
2. Click the extension icon and approve access to that PDF origin if Chrome asks
3. Read the selectable original pages beside progressive translations in the Vibe PDF Reader tab
4. Navigate or scroll to prioritize nearby pages, or choose **Translate entire document** after reviewing its character estimate
5. Use **Choose PDF** as a fallback for a local, authenticated, redirected, or encrypted file

Scanned image-only documents report that OCR is not supported.
Formula-heavy and uncertain structured regions remain visible in the original PDF instead of being translated as prose.
The reader never modifies the source PDF and does not export a translated PDF.

### Translate YouTube subtitles

1. Open a YouTube video that provides native or auto-generated captions
2. Click the Vibe Translator icon inside the video’s bottom control bar; it turns on available captions and starts subtitle translation
3. In Settings, choose **Original and translation** for a bilingual view or **Translation only** to hide each matched native cue after its translation is ready
4. Play the video; the extension keeps about 60 seconds of real-time lead by requesting 60 seconds at 1×, 90 seconds at 1.5×, and 120 seconds at 2×
5. Continue playing, change speed, or seek elsewhere; rate changes resize the rolling window, seeks prioritize the new position, and visible-caption translation remains the fallback when timed captions are unavailable

The first captions after startup can remain native while the initial API batch finishes.
Progressive auto-caption fragments use a translation only when they uniquely match the active timed cue; arbitrary fuzzy matching is never used.
When timed captions are unavailable, each visible caption slot keeps one request active and coalesces further mutations to its latest text.
Consecutive short cues share bounded requests, and total subtitle API concurrency stays at five or fewer.

Clicking the in-player icon opens a diagnostic panel that records sanitized track discovery, prefetch availability, cache paths, fallback coalescing, API progress, and render outcomes.
A temporary “captions not visible” error returns to active automatically when native captions appear.
Use **Copy diagnostics** to share a report; API keys, caption text, prompts, responses, and timed-caption URLs are not included.

The pinned Chrome toolbar icon keeps its original whole-page translation behavior.

Videos without an available YouTube caption track are not transcribed from audio.

### Translate selected text

1. Highlight text on the page
2. Right-click the selection and choose **Translate selected text**
3. A compact floating panel near the selected content shows the target language and translation progress
4. Read the result, use **Show more** for long translations, or dismiss the panel with its close button or `Escape`
5. If an initiated request fails, use **Try again** in the panel; dismissing a pending panel keeps its eventual result hidden

## Development

```bash
npm install       # install exact development dependencies and the Husky hook
npm run dev       # Extension.js development build with labeled context logs
npm run build     # production Chrome artifact in dist/chrome
npm run preview   # preview the production Chrome build
npm run check     # module checks, unit tests, production build, artifact verification
npm run e2e:mock  # production-artifact Playwright smoke suite with a local API
npm run e2e:pdf   # PDF reader Playwright smoke suite with local PDF and API fixtures
npm run zip       # production build plus dist/chrome/vibe-translator-<version>.zip
npm run icons     # regenerate extension icon PNGs from icons/icon.svg
```

Extension.js telemetry is disabled by every repository command.
Development uses the isolated persistent profile at `dist/extension-profile-chrome` and labels background, content, options, and page logs.
Use `dist/extension-js/chrome/ready.json` for readiness metadata and filter terminal output by the context label, tab URL, or event name.

The Husky pre-commit hook formats, lints, and organizes imports in staged supported files with Biome.
For manual production testing, load `dist/chrome` from `chrome://extensions/`.
Do not load the repository root because source modules are not the store artifact.

`npm audit` currently reports one transitive advisory as four high-severity dependency paths: `extension` → `extension-develop` → `extension-from-store` → `extract-zip` (`GHSA-jmr9-qjv8-65gv`).
Extension.js 4.0.32 is the latest reviewed release, and its store-download helper invokes the vulnerable extractor only when importing third-party store archives.
This project does not use that feature in `dev`, `build`, `preview`, `zip`, or CI; upgrade when Extension.js publishes a patched dependency chain.

## Notes

- The extension never auto-translates on navigation; it must be triggered manually each time
- `chrome://` and other non-HTTP pages are rejected without making any request
- On dynamic pages, visible content continues to queue as the DOM changes; retrigger translation if needed after significant page updates
