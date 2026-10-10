# Upstream source

The `web/` directory is based on
[`basketikun/infinite-canvas`](https://github.com/basketikun/infinite-canvas)
commit `e6d0911e9d509d00150eaab02f9ca05be94ffc46` (`v0.19.0`).

The upstream author is basketikun. The original code is MIT-licensed; see
`LICENSE` in this directory, which must be kept unmodified together with the
original author attribution.

PicPocket's modifications to this snapshot (extension build, MV3 compatibility,
integration with PicPocket data, credit display, and further changes) are
distributed under GPL-3.0-only together with the rest of this repository; see
the top-level `LICENSE`. MIT is compatible with GPL-3.0, so upstream MIT changes
can be merged in, but PicPocket's modifications are not MIT-licensed.

Local changes to this snapshot go beyond the PicPocket extension build and will
keep growing. Compare against the pinned commit before pulling further upstream
updates, and keep this file in sync when the scope of changes changes.

## Local changes outside `web/src/integrations/picpocket/`

Beyond the extension build wiring, these upstream files carry PicPocket-specific
changes. Re-check them when merging upstream:

- `web/src/pages/canvas/project.tsx`: restores PicPocket generation tasks and
  resets orphaned loading nodes on open; places inserted nodes in free space and
  reveals their prompt panel; measures the canvas container after the project
  loads (the original `[]`-deps effect never ran, leaving `size` at its
  placeholder); keeps the MCP command effect free of unstable callbacks.
- `web/src/components/canvas/infinite-canvas.tsx`: wheel zoom uses
  `wheelZoomFactor` (trackpad pinch gets its own curve; Ctrl + mouse wheel keeps
  the 10% notch).
- `web/src/components/layout/user-status-actions.tsx`,
  `web/src/components/canvas/canvas-top-bar.tsx`: the extension build hides the
  upstream docs, GitHub and version entries (the version check requested
  `raw.githubusercontent.com` on every canvas load).
- `web/src/components/canvas/canvas-node-hover-toolbar.tsx`: in builds without
  media generation (the extension), only image nodes offer "save to assets";
  text and video nodes would land in the upstream asset store, which is not
  visible there.
- `web/src/i18n/locales/en-US.ts`, `web/src/i18n/locales/zh-CN.ts`: "My Assets"
  entries renamed to "My Pocket" / 「我的口袋」, plus a dedicated insert-failure
  message and folder-deletion wording.
- `web/src/types/canvas.ts`: `CanvasAssistantImage` gains an optional `title`
  so pocket assets keep their name when inserted.
- `web/bunfig.toml`, `web/tests/setup.ts`: bun test preloads `fake-indexeddb`
  for the PicPocket integration tests.
- `web/src/services/api/image.extension.ts`: generation registry cleanup and
  live-task tracking.
