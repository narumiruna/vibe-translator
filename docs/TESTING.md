# Manual Testing

## Setup

1. Load the extension from `chrome://extensions/`
2. Open the extension options page
3. Save a valid API key, base URL, model, target language, and instructions
4. Confirm the API origin permission is granted

## Entire page translation

1. Open `test/fixture-page.html` in a local HTTP server or use a normal article page
2. Click the extension icon
3. Confirm the page shows translation notes below the original blocks
4. Right-click a blank area and choose **Translate entire page**
5. Confirm a second run updates existing notes instead of duplicating them

## Selection translation

1. Select a sentence on the page
2. Right-click the selected text
3. Choose **Translate selected text**
4. Confirm the translation appears near the selected block or as a toast fallback

## Error handling

1. Clear the API key and click the extension icon
2. Confirm the options page opens instead of a failing request
3. Use an invalid base URL and confirm validation fails on save
4. Deny API origin permission and confirm translation shows an error toast
5. Open `chrome://extensions/` and confirm translation is rejected safely
