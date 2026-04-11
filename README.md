# Vibe Translator

A Manifest V3 Chrome extension that translates web pages using an OpenAI-compatible API. Translations appear inline next to the original text so you can read both side by side.

## Features

- Click the extension icon or right-click a page and choose **Translate entire page**
- Select text, right-click, and choose **Translate selected text**
- Translations are injected as sibling blocks — the original text is never removed
- Visible content translates first; more is queued as you scroll
- Large pages are split into batches and translated with bounded parallel requests; oversized blocks are broken down recursively
- Inline code, file paths, URLs, math expressions, and common technical terms are protected by placeholder substitution so they are never mangled
- Fully configurable: API key, base URL, model, target language, and prompt templates
- Translation underline appearance (color, style, thickness, offset) is adjustable
- Individual domains can be disabled from the options page

## Project Structure

| File | Purpose |
|---|---|
| `manifest.json` | Manifest V3 configuration |
| `background.js` | Action click, context menus, permission flow, session orchestration |
| `content-viewport.js` | Viewport measurement for progressive page translation |
| `content.js` | DOM extraction, translation rendering, scroll-driven queuing |
| `api.js` | Responses API requests, chunking, placeholder masking, and caching |
| `storage.js` | Settings validation, normalization, and persistence |
| `options.html/css/js` | Settings page UI |
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
| Translation Appearance | Underline color, style (`solid`/`dashed`/`dotted`), thickness, and offset |
| Disabled Domains | One domain per line; translation is silently skipped on matching hostnames |

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
3. The translation appears as an inline note near the selected content

## Development

```bash
just check   # syntax check + unit tests
just test    # unit tests only
just zip     # build a Chrome Web Store zip
just clean   # remove generated zips
```

Load the extension from `chrome://extensions/` using **Load unpacked** on this directory.

## Notes

- The extension never auto-translates on navigation; it must be triggered manually each time
- `chrome://` and other non-HTTP pages are rejected without making any request
- On dynamic pages, visible content continues to queue as the DOM changes; retrigger translation if needed after significant page updates
