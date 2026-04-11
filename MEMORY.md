# Memory

## GOTCHA

- When the user explicitly specifies a command like `prek install`, run that exact command instead of guessing a similar but different command such as `pre-commit install`.
- During in-flight page translation, `chrome.tabs.sendMessage` can fail when the tab reloads, closes, or loses its content script; treat this as normal session teardown instead of logging a hard error.

## TASTE
- 
