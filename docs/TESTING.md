# Manual Testing

## Test pages

1. Run `npm run build`, then load `dist/chrome` from `chrome://extensions/`
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
20. Select each **YouTube Subtitles → Display Mode** radio option with the keyboard and confirm its full label and description are announced by a screen reader
21. Save each YouTube subtitle display mode, reload Settings, and confirm the selected mode persists; confirm a profile without the setting opens as **Translation only**
22. Save disabled domains using mixed case and comma or newline separators, reload the page, and confirm they are normalized to lowercase hostnames with one hostname per line
23. Upgrade a profile containing only legacy underline settings and confirm it opens as Calm Reading without validation errors
24. Use Left/Right Arrow on the Setup, Appearance, Prompts, and Advanced tabs and confirm focus, selected state, and the visible panel move together without losing drafts
25. Use only the keyboard to edit each control, open and close every Appearance disclosure, reset prompts and appearance, run Test Connection, recover from an error, and save without a focus trap
26. Check Setup, Appearance, Prompts, and Advanced with a screen reader and confirm tabs, labels, descriptions, radio groups, selected states, validation errors, permission status, and connection status are announced with their controls
27. Review the options page in light and dark modes at 320 px, 390 px, 720 px, desktop width, 200% zoom, reduced motion, and forced colors; confirm there is no horizontal overflow or obscured save action
28. Enter a valid URL that omits `/v1`, submit, and confirm Base URL is marked invalid, references the visible error, and clears its invalid state after correction
29. Trigger Test Connection twice rapidly and confirm only one request runs while the button remains disabled until the operation settles
30. Simulate a connection failure, confirm the same status area provides actionable recovery, retry, and confirm success without reloading the page
31. Inspect the packaged options page network and console output and confirm it loads no remote UI resource, emits no page error, and never exposes the API key

## PDF translation

1. Build and load `dist/chrome`, configure the translation API, and open `https://www.cs.princeton.edu/~chazelle/courses/BIB/jeannette-wing.pdf`
2. Click the Vibe Translator toolbar action and approve only the PDF origin when Chrome requests permission
3. Confirm a new Vibe PDF Reader tab opens while the original PDF tab remains available
4. Confirm the reader URL contains only an extension launch token and not the source URL or its query parameters
5. Confirm all three original pages render, their text remains selectable, and page navigation and zoom work with mouse and keyboard
6. Confirm the translation pane starts with the visible page and nearby pages, then fills progressively without replacing the original PDF
7. Confirm page headers, footers, and page numbers are not translated as body paragraphs
8. Confirm the Princeton paper's multi-column text reads down the left column before continuing down the right column
9. Click a translated block and confirm its matching source lines are highlighted on the original page
10. Search translated text and use Copy page and Copy document after results are available
11. Click **Translate entire document**, review the character estimate, cancel once, then confirm and verify finite progress
12. Pause before scrolling to a new page and confirm no new page batch starts until Resume is selected
13. Simulate one failed API chunk, confirm successful blocks remain, click **Retry failed**, and confirm only failed blocks retry
14. Choose `test/fixtures/pdf/encrypted.pdf`, enter `vibe-test`, and confirm the local encrypted document opens without persisting the password
15. Choose `test/fixtures/pdf/malformed.pdf` and confirm an actionable error appears without replacing the current readable document
16. Choose a scanned PDF and confirm the reader reports that OCR is not supported when extractable text is insufficient
17. Test a PDF larger than the supported byte, page, or text limit and confirm it fails before unbounded rendering or translation work
18. Test a URL that redirects to another origin and confirm it offers local file selection rather than following an unauthorized source
19. Deny the source-origin permission and confirm the original PDF remains open and no reader session starts
20. Disable the PDF hostname in Settings and confirm translation is rejected for that source
21. Reload the PDF reader while translation is in progress and confirm it reconnects through the tab-bound launch token without duplicate visible results
22. Close the reader during translation and confirm late API results are suppressed without affecting another reader tab
23. Verify the reader at 320 px, 390 px, desktop width, 200% zoom, reduced motion, dark mode, and forced colors with no obscured controls or horizontal page UI overflow
24. Inspect extension logs and confirm they contain no PDF text, password, signed source URL, prompt, API key, authorization value, or API response
25. Run `PLAYWRIGHT_HEADLESS=1 npm run e2e:pdf` and confirm the local fixture, partial failure, retry, navigation, encrypted file, and cancellation checks pass without external network access

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

## YouTube subtitle translation

1. Open an auto-caption watch page, including `https://www.youtube.com/watch?v=R3-anFK1YM8`
2. Confirm the Vibe Translator icon appears beside YouTube’s caption control and remains inside the video frame
3. In Settings, choose **Translation only**, then click the in-player icon and confirm its diagnostic panel immediately reports that the click was received
4. Confirm the icon turns active, the diagnostic panel reports startup progress, and available native captions are enabled
5. Confirm the panel records sanitized track source, timed-prefetch availability, caption extraction, queueing, playback rate, window placement, cache path, fallback coalescing, API completion or failure, and render outcomes
6. Use **Copy diagnostics** and confirm the report contains player/control/caption pipeline state but no API key, prompt, source caption text, API response text, or timed-caption URL
7. At 1×, confirm diagnostics report `rate=1`, a 60,000 ms window, front placement at startup, and back placement for rolling refills
8. Play the video and confirm each completed prefetched translation appears immediately; allow the original caption to remain while the initial API batch is still warming up
9. Change playback to 1.5× and confirm diagnostics report a 90,000 ms window without restarting translation
10. Change playback to 2× and confirm diagnostics report a 120,000 ms window without restarting translation
11. Watch consecutive cues at each speed and confirm prefetched cues do not enter visible-caption fallback after the rate-specific window is ready
12. On `R3-anFK1YM8`, confirm progressive fragments produce exact or `timed-prefix` hits only while their unique timed cue is active, with no repeated unexplained missing targets
13. On a video where timed prefetch is unavailable, confirm diagnostics show at most one active visible fallback per caption slot and coalesce later mutations to the latest pending text
14. Let the initial caption-visibility timeout appear before playback, then play until native captions appear and confirm the icon returns from the recoverable error to active without another click
15. In **Translation only**, confirm only the native segment owned by the current translation is hidden; sibling native segments remain visible until their own translations are ready
16. Confirm translated subtitles use the compact player style without the reading-card label or shimmer placeholder
17. Change Settings to **Original and translation**, restart subtitle translation, and confirm each native cue remains visible with its matching translated line directly below it
18. Watch several consecutive cues, including cumulative auto-generated captions, and confirm each old translation disappears in the same cue transition instead of surviving over newer native text
19. Find a caption window with multiple simultaneous segments and confirm each translation stays attached to its exact source while removing one segment leaves valid siblings intact
20. Continue playing for more than one real-time minute at 1×, 1.5×, and 2× and confirm rolling tail refills do not overtake nearer pending cues
21. Seek forward to an untranslated position and confirm the new window uses front placement before its matching cue appears
22. Seek backward while translation is pending and confirm an older result is classified as superseded and never replaces the current cue
23. Confirm a caption segment replaced by YouTube while its translation is pending still renders when the visible source text is identical
24. Enter and leave fullscreen in each display mode and confirm the icon, native captions required by the mode, and translated subtitles remain readable and inside the player
25. Navigate to another YouTube video without reloading and confirm the icon returns to idle, caption-slot state is cleared, and the saved display mode is retained when translation restarts
26. Click the pinned Chrome toolbar icon and confirm its existing whole-page translation behavior is unchanged
27. Open a video where YouTube exposes a caption track but renders no native caption text, click the in-player icon, wait about five seconds, and confirm the icon and diagnostic panel report that captions are not visible instead of staying falsely active
28. Clear required API settings, click the in-player icon, and confirm the icon visibly enters a non-recoverable error state, the diagnostic panel shows the failure, and Settings opens instead of appearing inert

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

## Extension.js development and reinjection

1. Run `npm run dev` and confirm Extension.js reports background, content, options, and page contexts with timestamps
2. Open `dist/extension-js/chrome/ready.json` and confirm the development build reaches a ready state
3. Start page translation, edit a content entry module, and confirm one reload occurs without duplicate notes, runtime responses, observers, or API requests
4. On YouTube, edit a content or control module and confirm only one Vibe Translator control and one delegated click handler remain
5. Open and dismiss a selection panel, trigger reinjection, and confirm `Escape` and resize behavior run once
6. Filter development logs by context label, URL, tab, and event name and confirm API keys, authorization values, prompts, selected text, source text, and response bodies are absent
7. Run `PLAYWRIGHT_HEADLESS=1 npm run e2e:mock` twice with temporary profiles and confirm both runs pass

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
