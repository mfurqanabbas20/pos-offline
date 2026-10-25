"""Flatten Next.js prefetch segment files after a static export built on Windows.

Next.js names each segment file by joining the segment path with dots, e.g.
    returns/__next.!KGFwcCk.returns.__PAGE__.txt
and the browser requests exactly that name. On Windows the exporter's internal paths use
backslashes, which are not converted, so it writes nested folders instead:
    returns/__next.!KGFwcCk/returns/__PAGE__.txt
This script moves every such file to the flat name the browser asks for. Safe to run twice.

    python fix_export.py <path to frontend/out>
"""

import shutil
import sys
from pathlib import Path


def flatten(out_dir: Path) -> int:
    moved = 0
    # Deepest first, and only real directories named "__next.*".
    for seg_dir in sorted((p for p in out_dir.rglob('__next.*') if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
        for file in sorted(f for f in seg_dir.rglob('*') if f.is_file()):
            relative = file.relative_to(seg_dir)
            flat = seg_dir.parent / '.'.join([seg_dir.name, *relative.parts])
            if flat.exists():
                flat.unlink()
            file.replace(flat)
            moved += 1
        shutil.rmtree(seg_dir)
    return moved


if __name__ == '__main__':
    target = Path(sys.argv[1]).resolve()
    if not (target / 'index.html').is_file():
        sys.exit(f'{target} does not look like a Next.js export (no index.html).')
    print(f'Flattened {flatten(target)} prefetch files in {target}')
