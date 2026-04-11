set shell := ["bash", "-euo", "pipefail", "-c"]

default:
    @just help

help:
    @echo "Available recipes:"
    @echo "  just check  - Run JavaScript syntax checks and unit tests"
    @echo "  just test   - Run unit tests"
    @echo "  just zip    - Create a zip for Chrome Web Store upload"
    @echo "  just clean  - Remove generated zip files"

check:
    @node --check background.js
    @node --check content.js
    @node --check storage.js
    @node --check api.js
    @node --check options.js
    @just test

test:
    @node --test test/*.test.js

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
      content.js \
      storage.js \
      api.js \
      options.html \
      options.css \
      options.js \
      README.md \
      docs/TESTING.md; \
    echo "Created $$zip_name"

clean:
    @rm -f chrome-translator-*.zip
