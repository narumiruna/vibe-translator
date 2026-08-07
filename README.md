# Vibe Translator

A Manifest V3 Chrome extension that translates web pages using an OpenAI-compatible API. Translations appear inline next to the original text so you can read both side by side.

## Features

- Click the extension icon or right-click a page and choose **Translate entire page**
- Select text, right-click, and choose **Translate selected text**; a compact status panel shows progress, the target language, and the result
- Translations are injected as sibling blocks — the original text is never removed
- Visible content translates first; more is queued as you scroll
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
| `src/background.js` | Action click, context menus, permission flow, session orchestration |
| `src/content-viewport.js` | Viewport measurement for progressive page translation |
| `src/content-selection-panel.js` | Floating selected-text translation panel rendering and positioning |
| `src/translation-appearance.js` | Appearance presets, validation, contrast calculation, and safe style mappings |
| `src/content-extraction.js` | Page content selector, scoring, and extraction helper logic |
| `src/content.js` | DOM extraction, translation rendering, scroll-driven queuing |
| `src/translator-messages.js` | Shared background/content message types and message builders |
| `src/api-protected-fragments.js` | Placeholder masking and protected fragment validation |
| `src/api-cache.js` | Translation cache keying and LRU cache helpers |
| `src/api-chunk-plan.js` | Chunk planning, recursive split, and progressive merge helpers |
| `src/api-responses.js` | Responses API prompt rendering, request building, and response parsing |
| `src/api.js` | Translation request caching, retry, and batched request orchestration |
| `src/storage.js` | Settings validation, normalization, and persistence |
| `src/options.html/css/js` | Settings page UI |
| `src/options-appearance.js` | Appearance controls, preset behavior, and live previews |
| `test/` | Node unit tests |
| `docs/TESTING.md` | Manual QA checklist |

## Installation

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this directory
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

The extension requests host permission only for the origin derived from your configured **Base URL**.

## Usage

### Translate a page

1. Open any `http://` or `https://` page
2. Click the extension icon, or right-click a blank area and choose **Translate entire page**
3. Translations appear below each original text block as the content enters the viewport

### Translate selected text

1. Highlight text on the page
2. Right-click the selection and choose **Translate selected text**
3. A compact floating panel near the selected content shows the target language and translation progress
4. Read the result, use **Show more** for long translations, or dismiss the panel with its close button or `Escape`
5. If an initiated request fails, use **Try again** in the panel; dismissing a pending panel keeps its eventual result hidden

## Development

```bash
npm install  # install development dependencies and the Husky Git hook
npm run icons # regenerate extension icon PNGs from icons/icon.svg
just check   # syntax check + unit tests
just test    # unit tests only
just zip     # build a Chrome Web Store zip
just clean   # remove generated zips
```

The Husky pre-commit hook formats, lints, and organizes imports in staged supported files with Biome.

Load the extension from `chrome://extensions/` using **Load unpacked** on this directory.

## Notes

- The extension never auto-translates on navigation; it must be triggered manually each time
- `chrome://` and other non-HTTP pages are rejected without making any request
- On dynamic pages, visible content continues to queue as the DOM changes; retrigger translation if needed after significant page updates
