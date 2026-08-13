set shell := ["bash", "-euo", "pipefail", "-c"]

default:
    @just help

help:
    @echo "Available recipes:"
    @echo "  just check  - Run module checks, unit tests, build, and artifact verification"
    @echo "  just e2e    - Run Playwright extension smoke tests"
    @echo "  just e2e-mock - Run Playwright extension smoke tests with mock API"
    @echo "  just e2e-antirez - Run Antirez article and Disqus comment regression test"
    @echo "  just e2e-syosetu - Run Syosetu directory regression test"
    @echo "  just e2e-youtube - Run YouTube subtitle translation regression test"
    @echo "  just format - Run Biome formatter with writes enabled"
    @echo "  just lint   - Run Biome lint with safe fixes"
    @echo "  just test   - Run unit tests"
    @echo "  just zip    - Create and verify a Chrome Web Store zip"
    @echo "  just clean  - Remove generated builds and zip files"

format:
    @biome format --write --files-ignore-unknown=true .

lint:
    @biome lint --write --files-ignore-unknown=true .

check:
    @npm run check

test:
    @node --test test/*.test.js

e2e:
    @npm run e2e:smoke

e2e-mock:
    @npm run e2e:mock

e2e-antirez:
    @npm run e2e:antirez

e2e-syosetu:
    @npm run e2e:syosetu

e2e-youtube:
    @npm run e2e:youtube

zip:
    @npm run zip

clean:
    @rm -rf dist/chrome dist/firefox
    @rm -f chrome-translator-*.zip vibe-translator-*.zip
