set shell := ["bash", "-euo", "pipefail", "-c"]

default:
    @just help

help:
    @echo "Available recipes:"
    @echo "  just check  - Run JavaScript syntax checks and unit tests"
    @echo "  just e2e    - Run Playwright extension smoke tests"
    @echo "  just e2e-mock - Run Playwright extension smoke tests with mock API"
    @echo "  just e2e-antirez - Run Antirez article and Disqus comment regression test"
    @echo "  just e2e-syosetu - Run Syosetu directory regression test"
    @echo "  just e2e-youtube - Run YouTube subtitle translation regression test"
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
    @for file in src/*.js; do node --check "$file"; done
    @just test

test:
    @node --test test/*.test.js

e2e:
    @node e2e/extension-smoke.js

e2e-mock:
    @PLAYWRIGHT_MOCK_API=1 node e2e/extension-smoke.js

e2e-antirez:
    @node e2e/antirez-comments.js

e2e-syosetu:
    @node e2e/syosetu-directory.js

e2e-youtube:
    @PLAYWRIGHT_MOCK_API=1 node e2e/youtube-subtitles.js

zip:
    @version="$(grep -o '"version": "[^"]*"' manifest.json | cut -d'"' -f4)"; \
    zip_name="chrome-translator-$version.zip"; \
    if [[ -e "$zip_name" ]]; then \
      echo "Error: $zip_name already exists. Run 'just clean' first."; \
      exit 1; \
    fi; \
    python3 scripts/package-extension.py "$zip_name"; \
    echo "Created $zip_name"

clean:
    @rm -f chrome-translator-*.zip
