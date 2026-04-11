# Manual Testing

## Setup

1. Load the extension from `chrome://extensions/`
2. Open the extension options page
3. Save a valid API key, base URL, model, target language, and instructions
4. Confirm the API origin permission is granted

## Entire page translation

1. Open `test/fixture-page.html` in a local HTTP server or use a normal article page
2. Click the extension icon
3. Confirm only the visible area and roughly the next screenful start showing placeholders/translations
4. Confirm deeper content below that window does not start translating yet
5. Scroll down and confirm the next group of blocks starts translating after it enters the prefetch window
6. Confirm the page shows translation notes as sibling blocks instead of nested inside headings or list items
7. Confirm headings and list items keep their original structure and ordering
8. Confirm completed translations stay visible inline with the original text
9. Confirm there is no display mode toolbar on the page
10. Right-click a blank area and choose **Translate entire page**
11. Confirm a second run updates existing notes instead of duplicating them
12. Confirm there are no per-block “顯示翻譯” or “收起翻譯” buttons

## Selection translation

1. Select a sentence on the page
2. Right-click the selected text
3. Choose **Translate selected text**
4. Confirm the translation appears as a sibling note near the selected block or as a toast fallback
5. Confirm selection translation keeps the original text visible

## Error handling

1. Clear the API key and click the extension icon
2. Confirm the options page opens instead of a failing request
3. Use an invalid base URL and confirm validation fails on save
4. Deny API origin permission and confirm translation shows an error toast
5. Open `chrome://extensions/` and confirm translation is rejected safely
