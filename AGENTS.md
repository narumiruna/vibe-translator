# Repository Guidelines

## Project Structure & Module Organization

This repository is a bundled Manifest V3 Chrome extension built with Extension.js. Source lives in `src/`: `background/` owns listeners and orchestration; `content.js` and `content/` own lifecycle, extraction, and rendering; `translation/` owns OpenAI-compatible requests and chunking; and `shared/` owns settings and cross-context contracts. The options UI is in `src/options/`. Generated artifacts live in `dist/` and must not be edited. Tests are in `test/`, with manual QA notes in `docs/TESTING.md`.

## Build, Test, and Development Commands

- `just check`: runs module syntax checks, unit tests, a production build, and artifact verification.
- `just test`: runs `node --test test/*.test.js`.
- `just zip`: creates and verifies the versioned Extension.js Chrome Web Store zip.
- `just clean`: removes generated `chrome-translator-*.zip` archives.
- When code changes are made, run `biome format --write && biome lint --write`.

Use `npm run dev` for development. For manual production checks, run `npm run build`, then use **Load unpacked** on `dist/chrome`.

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
