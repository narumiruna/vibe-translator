# Playwright E2E Smoke Test

This repository now includes a minimal Playwright smoke suite that loads the unpacked Chrome extension and exercises the real MV3 runtime.

## What It Covers

1. Opens the extension options page
2. Saves API settings from environment variables or `.env`
3. Pre-seeds the configured API origin and local fixture-page permissions in the Chromium test profile
4. Runs **Test Connection**
5. Opens `test/fixture-page.html`
6. Triggers full-page translation from the background service worker
7. Triggers selected-text translation from the background service worker
8. Saves screenshots in `e2e-artifacts/`

## Why It Uses the Background Service Worker

The smoke suite intentionally avoids Chrome's toolbar button and native context menu. Those browser UI entry points are harder to automate reliably than the extension's existing background functions.

The test still exercises the real extension stack:

1. MV3 service worker
2. Content script injection
3. `chrome.storage` settings
4. Host permission checks
5. Real API requests
6. DOM rendering on the target page

## Required Environment Variables

Put these in `.env` or export them in your shell:

```bash
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
TARGET_LANGUAGE=台灣正體中文
```

## Optional Environment Variables

```bash
PLAYWRIGHT_BROWSER_CHANNEL=chromium
PLAYWRIGHT_CHROME_EXECUTABLE=/custom/path/to/chrome
PLAYWRIGHT_USER_DATA_DIR=.e2e-user-data
PLAYWRIGHT_ARTIFACTS_DIR=e2e-artifacts
PLAYWRIGHT_HEADLESS=0
```

If `PLAYWRIGHT_USER_DATA_DIR` is unset, the suite uses a temporary Chromium profile and removes it after the run. Set `PLAYWRIGHT_USER_DATA_DIR=.e2e-user-data` when you want to keep the seeded permission and extension state between runs.

If `PLAYWRIGHT_HEADLESS` is not set, the script defaults to headed mode. Headless mode also works, because the test harness seeds the API origin permission before the main run.
If `PLAYWRIGHT_CHROME_EXECUTABLE` is unset, the suite uses Playwright's `chromium` channel because that is the supported path for loading unpacked extensions.

## Install

```bash
npm install
```

## Run

```bash
npm run e2e:smoke
```

Or, using the project command wrapper:

```bash
just e2e
```

## Notes

1. The suite is designed as a smoke test, not a full regression matrix.
2. The current `test/fixture-page.html` is short, so this suite does not fully validate scroll-driven queuing.
3. The harness seeds host permission in the test profile, so it does not rely on manually clicking Chrome's permission prompt.
