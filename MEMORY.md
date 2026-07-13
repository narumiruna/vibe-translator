# Memory

## GOTCHA

- When the user explicitly specifies a command like `prek install`, run that exact command instead of guessing a similar but different command such as `pre-commit install`.
- During in-flight page translation, `chrome.tabs.sendMessage` can fail when the tab reloads, closes, or loses its content script; treat this as normal session teardown instead of logging a hard error.
- The sandbox may not have the `just` binary installed even when `/home/runner/work/vibe-translator/vibe-translator/justfile` exists, so run the equivalent `node --check ... && node --test test/*.test.js` commands directly when needed.
- Symptom: `just` recipes expand `$$name` to a PID plus literal text. Cause: unlike Make, just recipes pass `$name` directly to the shell. Fix: use `$name` and `$(...)` in recipes.
- Chrome context menu click handlers do not expose page click coordinates, so selection-adjacent UI should anchor to the current DOM selection range instead.
- Symptom: `Cannot create item with duplicate id ...` runtime errors during menu setup. Cause: `chrome.contextMenus.create`/`removeAll` need callback-wrapped sequencing and `runtime.lastError` consumption. Fix: use the existing context menu promise helpers instead of raw `await chrome.contextMenus.*`.
- For fixed overlays that switch from corner anchoring to explicit `top`/`left` positioning, also clear the opposite edges with `right: auto` and `bottom: auto`; otherwise the box can stretch to the viewport edge.
- When a message payload adds new UI state like selection anchors or display mode, verify those fields are forwarded through every render wrapper, not just the background-to-content send.
- Reusing a Playwright Chromium persistent profile after a crashed run can leave `Singleton*` lock files behind; clear them before the next `launchPersistentContext` or Chromium may exit immediately.
- Chrome for Testing may store unpacked extension metadata in `Secure Preferences`, making direct host-permission seeding unreliable. For extension e2e, load a temporary copy of the extension manifest with required `host_permissions` instead of editing profile preferences.
- Symptom: X/Twitter post pages show no translatable text or cannot render a note. Cause: tweet bodies may be either `div[data-testid="tweetText"]` or `article[data-tweet-id] div[dir="auto"].whitespace-pre-wrap`, and X may wrap them in an identity CSS transform. Fix: treat tweet text variants as readable direct note targets and allow identity transforms in note insertion checks.
- Symptom: Threads post pages show no inline page translations. Cause: post bodies are `div[lang]` blocks with `span[dir="auto"]`, include a nested native `Translate` button, and may sit inside a `perspective: 1px` scroll region. Fix: treat those language blocks as social text, skip interactive descendants during extraction, and do not treat ancestor perspective alone as unsafe for note insertion.
- Symptom: scrolling sometimes does not queue newly visible paragraphs. Cause: element-level `scroll` events from nested overflow containers do not bubble to a normal window listener. Fix: register the window scroll listener in capture mode while keeping it passive.

## TASTE
- Selection translation UI should default to a compact tooltip-sized card; long content can expand, but the default should prefer density over empty space.
