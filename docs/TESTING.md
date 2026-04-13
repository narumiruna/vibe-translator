# Manual Testing

## Test pages

1. Load the extension from `chrome://extensions/`
2. Serve `test/fixture-page.html` from a local HTTP server and open it in Chrome
3. Prepare one additional article-style page with more content than one viewport so scroll-triggered queuing is easy to verify
4. Prepare one page containing inline code, file paths, URLs, or math so protected fragment rendering can be checked

## Options page

1. Open the extension options page
2. Save a valid API key, base URL, model, target language, system prompt template, and user prompt template
3. Confirm the API origin permission status reflects the configured base URL origin
4. Click **Test Connection** and confirm the status shows a sample translation
5. Edit the target language and confirm both prompt preview panes update immediately
6. Edit the system prompt template and confirm the system preview updates immediately
7. Edit the user prompt template and confirm the user preview updates immediately
8. Click **Reset System Template** and confirm the template and preview return to the default value
9. Click **Reset User Template** and confirm the template and preview return to the default value
10. Change the underline color, style, thickness, and offset and confirm the live sample updates immediately
11. Change **Selection Translation Panel** to **Near selected text**, save, reload the options page, and confirm the selection is preserved
12. Change **Selection Translation Panel** to **Bottom-right corner**, save, reload the options page, and confirm the selection is preserved
13. Save disabled domains using mixed case and comma or newline separators, reload the page, and confirm they are normalized to lowercase hostnames with one hostname per line

## Entire page translation

1. Open the long article-style test page
2. Click the extension icon
3. Confirm only visible content and roughly the next two viewports begin with shimmer placeholders
4. Confirm deeper content below that window does not start translating yet
5. Confirm each completed translation is inserted after the source block instead of replacing the original text
6. Confirm headings remain headings, list items remain list items, and table cells remain table cells
7. Confirm translations use the saved underline appearance settings
8. Confirm the action badge changes from empty to a numeric count as page translations complete
9. Scroll downward and confirm newly visible blocks are queued and translated automatically
10. Right-click a blank area and choose **Translate entire page** again
11. Confirm existing notes are updated in place instead of duplicated
12. Confirm there is no per-block display toggle UI and no page-level display mode toolbar

## Selection translation

1. Select a sentence on any supported page
2. Right-click the selected text
3. Choose **Translate selected text**
4. With **Selection Translation Panel** set to **Near selected text**, confirm a floating selection translation panel appears near the selected text and stays within the viewport
5. Confirm the panel first shows a pending shimmer state and then the translated text
6. Confirm the original page content stays unchanged
7. Confirm the panel title includes the current target language
8. Confirm the translated text uses the saved underline appearance settings
9. Click the panel close button and confirm the panel is removed
10. Run selection translation again and confirm the panel can be reopened normally
11. Confirm the action badge shows `TR` after a successful selection translation
12. Switch **Selection Translation Panel** to **Bottom-right corner** and confirm the panel opens near the bottom-right instead

## Protected fragments

1. Open a page containing inline code, file paths, URLs, or math expressions
2. Run page translation or selection translation on text that includes those fragments
3. Confirm inline code is still rendered as code instead of plain translated prose
4. Confirm URLs, file paths, commands, identifiers, and common product names remain unchanged in the translated result
5. Confirm math content stays intact and is not replaced with broken placeholder text

## Dynamic content

1. Start page translation on a page that can be edited or updated after translation begins
2. Change the text of an already translated block, or use a page that injects additional readable content dynamically
3. Confirm the previous translation note becomes visually stale before the updated content is re-queued
4. Confirm the changed block is translated again once it is within the active translation window
5. Confirm newly inserted readable blocks are picked up when they scroll into view

## Disabled domains

1. Add the current test page hostname to **Disabled Domains** and save
2. Return to that page and click the extension icon
3. Confirm page translation is blocked and an error toast is shown
4. Select text on the same page and choose **Translate selected text**
5. Confirm selection translation is also blocked
6. Remove the hostname from **Disabled Domains**, save again, and confirm both page and selection translation work normally

## Session teardown

1. Start translating a longer page
2. While translations are still appearing, reload the tab
3. Confirm translation stops quietly, pending placeholders disappear with the reload, and the action badge is cleared
4. Start another page translation run and confirm it works normally after the reload
5. Start translating again and close the tab before the run finishes
6. Confirm the extension does not show a hard failure for the closed tab and other tabs continue working normally

## Error handling

1. Clear the API key and click the extension icon
2. Confirm the options page opens instead of sending a translation request
3. Use an invalid base URL and confirm save validation fails
4. Remove `{{sourcePayload}}` from the user prompt template and confirm save validation fails
5. Click **Test Connection**, deny the API origin permission request, and confirm the options page shows a permission-related error state
6. Deny API origin permission during page or selection translation and confirm an error toast is shown on the page
7. Open `chrome://extensions/` and confirm translation is rejected safely without injecting UI
