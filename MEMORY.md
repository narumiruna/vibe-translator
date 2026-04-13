# Memory

## GOTCHA

- When the user explicitly specifies a command like `prek install`, run that exact command instead of guessing a similar but different command such as `pre-commit install`.
- During in-flight page translation, `chrome.tabs.sendMessage` can fail when the tab reloads, closes, or loses its content script; treat this as normal session teardown instead of logging a hard error.
- The sandbox may not have the `just` binary installed even when `/home/runner/work/vibe-translator/vibe-translator/justfile` exists, so run the equivalent `node --check ... && node --test test/*.test.js` commands directly when needed.
- Chrome context menu click handlers do not expose page click coordinates, so selection-adjacent UI should anchor to the current DOM selection range instead.
- For fixed overlays that switch from corner anchoring to explicit `top`/`left` positioning, also clear the opposite edges with `right: auto` and `bottom: auto`; otherwise the box can stretch to the viewport edge.
- When a message payload adds new UI state like selection anchors or display mode, verify those fields are forwarded through every render wrapper, not just the background-to-content send.
- Reusing a Playwright Chromium persistent profile after a crashed run can leave `Singleton*` lock files behind; clear them before the next `launchPersistentContext` or Chromium may exit immediately.

## TASTE
- Selection translation UI should default to a compact tooltip-sized card; long content can expand, but the default should prefer density over empty space.
