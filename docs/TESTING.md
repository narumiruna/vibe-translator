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
10. Select **Calm Reading**, **Minimal**, and **High Contrast** and confirm every related inline control and the live preview update; confirm the save bar reports unsaved preview changes
11. Change any Typography, Layout, or color field and confirm the preset changes to **Custom**
12. Toggle the Light/Dark preview and confirm each mode uses its independent saved colors
13. Set text and background to the same color and confirm a WCAG warning appears without blocking Save
14. Disable the translation background and confirm the contrast status says host-page contrast cannot be verified
15. Customize the selection panel width, typography, radius, opacity, and colors and confirm its independent preview updates
16. Click **Reset Appearance** and confirm only appearance controls return to Calm Reading; API, prompts, target language, and disabled domains remain unchanged
17. Save custom appearance settings, confirm the save bar reports no unsaved changes, reload options, and confirm every inline and selection value persists
18. Change **Selection Panel** to **Near selected text**, save, reload, and confirm the selection is preserved
19. Change **Selection Panel** to **Bottom-right corner**, save, reload, and confirm the selection is preserved
20. Save disabled domains using mixed case and comma or newline separators, reload the page, and confirm they are normalized to lowercase hostnames with one hostname per line
21. Upgrade a profile containing only legacy underline settings and confirm it opens as Calm Reading without validation errors

## Entire page translation

1. Open the long article-style test page
2. Click the extension icon
3. Confirm only visible content and roughly the next two viewports begin with shimmer placeholders
4. Confirm deeper content below that window does not start translating yet
5. Confirm each completed translation is inserted after the source block instead of replacing the original text
6. Confirm headings remain headings, list items remain list items, and table cells remain table cells
7. On `test/fixture-page.html`, confirm table-cell translations render inside cells and do not add extra table columns
8. Confirm translations use the saved preset or Custom inline font, width, spacing, surface, accent, radius, label, animation, and active light/dark colors
9. Save a different appearance while the article remains open and confirm existing notes stay unchanged until the page is translated again
10. Confirm the action badge changes from empty to a numeric count as page translations complete
11. Scroll downward and confirm newly visible blocks are queued and translated automatically
12. Right-click a blank area and choose **Translate entire page** again
13. Confirm existing notes are updated in place instead of duplicated and now use the latest saved appearance
14. Test zero spacing/padding and maximum legal spacing/width in a table, list, `pre`, and narrow viewport; confirm there is no horizontal page overflow
15. Confirm there is no per-block display toggle UI and no page-level display mode toolbar

## Selection translation

1. Select a sentence on any supported page
2. Right-click the selected text
3. Choose **Translate selected text**
4. With **Selection Translation Panel** set to **Near selected text**, confirm a floating selection translation panel appears near the selected text and stays within the viewport
5. Confirm the panel first shows `Translating to …` with a three-line shimmer state and then atomically replaces it with translated text
6. Confirm the short `Translation` title, full target-language chip, and close control remain visible without ambiguous truncation
7. Confirm the original page content stays unchanged and no redundant success toast appears
8. Confirm the panel uses its independent saved width, font size, line height, radius, opacity, and active light/dark colors rather than inline-card spacing or fonts
9. Use a long result and confirm **Show more**/**Show less** changes only panel height, never its configured width
10. Resize to a 320px viewport and confirm the panel reflows inside the viewport without horizontal overflow
11. Use Tab to confirm visible controls have a focus indicator, then press `Escape` and confirm the panel is removed
12. Dismiss a panel while it is still translating and confirm the completed result does not reopen it
13. Run selection translation again and confirm the panel can be reopened normally
14. Confirm the action badge shows `TR` after a successful selection translation
15. Switch **Selection Panel** to **Bottom-right corner** and confirm the panel opens near the bottom-right instead
16. Select text inside the iframe on `test/fixture-page.html` and confirm the panel appears inside that iframe, not in the top page, with the same panel-specific appearance
17. Enable reduced motion and confirm panel entrance and shimmer animations are disabled

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
4. Confirm toggling a class or style without changing text does not make the previous translation note stale or re-queue the block
5. Confirm the changed block is translated again once it is within the active translation window
6. Confirm newly inserted readable blocks are picked up when they scroll into view

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
7. Simulate one failed page-translation API chunk and confirm successful translations remain while a partial-failure toast is shown
8. Simulate a selected-text API failure after loading starts and confirm the same panel shows an actionable alert with **Try again**
9. Restore the API, click **Try again**, and confirm the control is disabled during loading and the panel reaches the ready state
10. Trigger two selection requests in quick succession and confirm a late result from the older request cannot replace the newer result or badge state
11. Open `chrome://extensions/` and confirm translation is rejected safely without injecting UI
