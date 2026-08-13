# Vibe Translator

A Manifest V3 Chrome extension that translates web pages using an OpenAI-compatible API. Translations appear inline next to the original text so you can read both side by side.

## Features

- Click the extension icon or right-click a page and choose **Translate entire page**
- Select text, right-click, and choose **Translate selected text**; a compact status panel shows progress, the target language, and the result
- Translations are injected as sibling blocks — the original text is never removed on ordinary pages
- Visible content translates first; more is queued as you scroll
- Available YouTube captions, including auto-generated tracks, are pretranslated in a rolling 60-second window and replaced inside the player
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
| `src/options/` | Options module entrypoint, HTML, CSS, and appearance controls |
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
| Disabled Domains | One domain per line; translation is silently skipped on matching hostnames |

The Appearance tab previews changes without saving and warns when translation text/background contrast is below WCAG AA. An unsaved-state label distinguishes previewed values from applied settings. **Reset Appearance** changes only the preview until **Save Settings** is used. Saved appearance changes apply the next time a page or selection is translated; existing rendered translations are not updated proactively.

Older underline settings are ignored and safely migrate to the Calm Reading appearance. Arbitrary CSS and font names are not accepted.

The options page also shows a live prompt preview and a **Test Connection** button that sends a sample request to confirm the API is reachable.

The extension requests access to supported YouTube pages for its in-player subtitle control.
It separately requests API host permission only for the origin derived from your configured **Base URL**.

## Usage

### Translate a page

1. Open any `http://` or `https://` page
2. Click the extension icon, or right-click a blank area and choose **Translate entire page**
3. Translations appear below each original text block as the content enters the viewport

### Translate YouTube subtitles

1. Open a YouTube video that provides native or auto-generated captions
2. Click the Vibe Translator icon inside the video’s bottom control bar; it turns on available captions and starts subtitle translation
3. Play the video; the next 60 seconds are translated ahead and each cached line replaces its original native caption immediately
4. Continue playing or seek elsewhere; the rolling window refills automatically, with visible-caption translation as a fallback when timed captions are unavailable

Clicking the in-player icon opens a diagnostic panel that records extraction, queueing, API, rendering progress, and errors.
Use **Copy diagnostics** to share a report; API keys are not included.

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
npm run check     # module checks, 151 unit tests, production build, artifact verification
npm run e2e:mock  # production-artifact Playwright smoke suite with a local API
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
