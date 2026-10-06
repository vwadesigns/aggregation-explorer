"""Rebuild the portable app and copy it to the GitHub Pages entry point.

No app source or model parameters are changed by this wrapper.
Python standard library only. This script makes no network requests.
"""
from pathlib import Path
import runpy


def main() -> None:
    root = Path(__file__).resolve().parent
    runpy.run_path(str(root / "build.py"), run_name="__main__")
    source = root / "Aggregation_Explorer.html"
    if not source.is_file():
        raise RuntimeError("The portable build did not produce its HTML output.")
    (root / "index.html").write_bytes(source.read_bytes())
    (root / ".nojekyll").touch()
    print("Updated index.html for GitHub Pages. Commit both HTML outputs.")


if __name__ == "__main__":
    main()
