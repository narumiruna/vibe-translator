# Vibe Translator

A Manifest V3 Chrome extension that translates web pages with the OpenAI `Responses API` while keeping the original text visible and the translation shown inline.

## Features

- Click the extension icon to translate the current page
- Right-click on a page and choose **Translate entire page**
- Select text, right-click, and choose **Translate selected text**
- Keep original text untouched and inject a sibling translation block below each source segment
- Preserve inline code, paths, URLs, and common technical terms through placeholder protection
- Allow problematic domains to be disabled from the options page
- Configure `API Key`, `Base URL`, `Model`, full prompt templates, and `Target Language`
- Split large pages into batches, recursively break oversized blocks, and translate them with bounded parallel requests
- Translate visible content first, then continue as you scroll
- Uses `/responses` with structured JSON schema output

## Project Structure

- `manifest.json`: Manifest V3 configuration
- `background.js`: Action click, context menus, permission flow, and API calls
- `content-viewport.js`: Visible-window selection for progressive page translation
- `content.js`: DOM extraction, progressive translation orchestration, and note rendering
- `storage.js`: Settings validation and persistence
- `api.js`: Responses API request building and response parsing
- `options.html`, `options.css`, `options.js`: Settings page
- `test/`: Node unit tests
- `docs/TESTING.md`: Manual test checklist

## Installation

1. Open `chrome://extensions/`
2. Turn on **Developer mode**
3. Choose **Load unpacked**
4. Select this directory
5. Open the extension's **Details** page and use **Extension options** to configure the API settings

## Settings

The options page lets you configure:

- `API Key`
- `OpenAI Base URL`
- `Model`
- `Target Language`
- `System Prompt Template`
- `User Prompt Template`

The extension requests permission only for the API origin derived from your configured `Base URL`.

## Translation Flow

### Entire page

1. Open a normal `http://` or `https://` page
2. Click the extension icon, or right-click a blank area and choose **Translate entire page**
3. The extension extracts readable text blocks near the viewport first
4. The translation is inserted after each original block
5. More content is translated as it enters the prefetch window while you scroll

### Selected text

1. Highlight text on the page
2. Right-click the selection
3. Choose **Translate selected text**
4. The translation appears near the selected content as an inline bilingual note

## Development

```bash
just check
just test
just zip
```

## Notes

- The extension does not auto-translate on navigation
- Unsupported pages such as `chrome://` are rejected safely
- Dynamic sites continue queuing visible content as the page changes, but you can retrigger translation if needed
