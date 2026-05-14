set shell := ["bash", "-euo", "pipefail", "-c"]

default:
    @just help

help:
    @echo "Available recipes:"
    @echo "  just check  - Run JavaScript syntax checks and unit tests"
    @echo "  just e2e    - Run Playwright extension smoke tests"
    @echo "  just e2e-syosetu - Run Syosetu directory regression test"
    @echo "  just format - Run Biome formatter with writes enabled"
    @echo "  just lint   - Run Biome lint with safe fixes"
    @echo "  just test   - Run unit tests"
    @echo "  just zip    - Create a zip for Chrome Web Store upload"
    @echo "  just clean  - Remove generated zip files"

format:
    @biome format --write --files-ignore-unknown=true .

lint:
    @biome lint --write --files-ignore-unknown=true .

check:
    @node --check background.js
    @node --check content-viewport.js
    @node --check content-selection-panel.js
    @node --check content-extraction.js
    @node --check content.js
    @node --check page-translation-session.js
    @node --check storage.js
    @node --check api-protected-fragments.js
    @node --check api-cache.js
    @node --check api-chunk-plan.js
    @node --check api-responses.js
    @node --check api.js
    @node --check translator-messages.js
    @node --check options.js
    @just test

test:
    @node --test test/*.test.js

e2e:
    @node e2e/extension-smoke.js

e2e-syosetu:
    @node e2e/syosetu-directory.js

zip:
    @version="$$(grep -o '"version": "[^"]*"' manifest.json | cut -d'"' -f4)"; \
    zip_name="chrome-translator-$$version.zip"; \
    if [[ -e "$$zip_name" ]]; then \
      echo "Error: $$zip_name already exists. Run 'just clean' first."; \
      exit 1; \
    fi; \
    zip "$$zip_name" \
      manifest.json \
      background.js \
      content-viewport.js \
      content-selection-panel.js \
      content-extraction.js \
      content.js \
      page-translation-session.js \
      storage.js \
      api-protected-fragments.js \
      api-cache.js \
      api-chunk-plan.js \
      api-responses.js \
      api.js \
      translator-messages.js \
      options.html \
      options.css \
      options.js \
      README.md \
      docs/TESTING.md; \
    echo "Created $$zip_name"

clean:
    @rm -f chrome-translator-*.zip
