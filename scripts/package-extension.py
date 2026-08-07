#!/usr/bin/env python3

import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent.parent
PACKAGE_PATHS = (
    Path("manifest.json"),
    Path("icons"),
    Path("src"),
    Path("README.md"),
    Path("docs/TESTING.md"),
)


def iter_files(path: Path):
    resolved = ROOT / path

    if resolved.is_dir():
        yield from sorted(candidate for candidate in resolved.rglob("*") if candidate.is_file())
        return

    yield resolved


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: package-extension.py <output.zip>")

    output = ROOT / sys.argv[1]

    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        for package_path in PACKAGE_PATHS:
            for file_path in iter_files(package_path):
                archive.write(file_path, file_path.relative_to(ROOT))


if __name__ == "__main__":
    main()
