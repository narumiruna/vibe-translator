# Repository Guidelines

## Project Structure & Module Organization

This repository is a plain Manifest V3 Chrome extension with a small file set at the repo root. Core runtime files are `background.js` (action, context menus, permissions, orchestration), `content.js` (DOM extraction and inline bilingual rendering), `api.js` (OpenAI-compatible request logic and chunking), and `storage.js` (settings validation and persistence). Options UI lives in `options.html`, `options.css`, and `options.js`. Tests are in `test/`, with manual QA notes in `docs/TESTING.md`.

## Build, Test, and Development Commands

- `just check`: runs JavaScript syntax checks for all shipped scripts, then runs unit tests.
- `just test`: runs `node --test test/*.test.js`.
- `just zip`: creates a versioned Chrome Web Store zip from the extension files.
- `just clean`: removes generated `chrome-translator-*.zip` archives.

Load the extension through `chrome://extensions/` with **Developer mode** enabled, then use **Load unpacked** on this directory.

## Coding Style & Naming Conventions

Use plain JavaScript and keep modules focused; avoid adding dependencies unless there is a concrete need. Follow existing style: 2-space indentation, semicolons, camelCase for variables/functions, and concise imperative helper names such as `renderPageTranslationUpdates`. Keep files bounded and split logic before a file becomes difficult to navigate. Prefer data attributes like `data-translate-*` for extension-owned DOM markers.

## Testing Guidelines

Unit tests use Node’s built-in test runner. Add or update tests in `test/*.test.js` when changing chunking, storage validation, masking, or merge behavior. Prefer targeted fixture-based cases over broad mocks. For UI and injection changes, also run the manual checklist in [docs/TESTING.md](/home/narumi/workspace/chrome-translator/docs/TESTING.md).

## Commit & Pull Request Guidelines

Match the current history: short imperative subjects such as `Add OpenAI-compatible page translator extension` or `Improve progressive page translation rendering`. Keep commits scoped to one change. For pull requests, include:

- a brief problem/solution summary
- test evidence (`just check`)
- screenshots or a short recording for rendering/UI changes
- notes about permission, API, or domain-behavior changes

## Security & Configuration Tips

Never hardcode API keys or commit real credentials. Keep API access constrained to the configured base URL origin, and preserve the current behavior of skipping unsupported or risky pages rather than forcing translation.

## MEMORY.md

- `MEMORY.md` is not auto-loaded. Check it before non-trivial debugging or design work when prior project context may matter.
- Keep entries short and reusable. Use `GOTCHA` for recurring pitfalls and `TASTE` for stable preferences.
- After a non-trivial error or discovery, adding one concise entry if it will help future work.
