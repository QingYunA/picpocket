# Third-party notices

PicPocket is distributed under the GNU General Public License v3.0 only (see [`LICENSE`](./LICENSE)).
It includes or depends on the following third-party software.

## Infinite Canvas (bundled, modified)

- Project: [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas)
- Location: [`vendor/infinite-canvas/`](./vendor/infinite-canvas/)
- Based on: `v0.19.0` (commit `e6d0911e9d509d00150eaab02f9ca05be94ffc46`)
- Original license: MIT — Copyright (c) 2026 basketikun
- The original license text is kept unmodified in [`vendor/infinite-canvas/LICENSE`](./vendor/infinite-canvas/LICENSE).
- PicPocket's modifications to this code are distributed under GPL-3.0-only (see [`vendor/infinite-canvas/UPSTREAM.md`](./vendor/infinite-canvas/UPSTREAM.md)).

## npm dependencies

The extension and the bundled canvas depend on open source packages installed through `bun`.
Their production dependencies are licensed under MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0,
MPL-2.0, 0BSD, BlueOak-1.0.0, CC0-1.0, CC-BY-4.0 (data), Unlicense and similar terms, all of which are
compatible with GPL-3.0. Each package keeps its own license file inside `node_modules`.

To regenerate the list:

```bash
bun x license-checker-rseidelsohn --production --summary --start .
cd vendor/infinite-canvas/web && bun x license-checker-rseidelsohn --production --summary --start .
```
