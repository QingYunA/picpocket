# Infinite Canvas migration

## Decision

Infinite Canvas is the source of the full-page creative app. PicPocket remains
the owner of browser capture, the local pocket, folders, reverse-prompt records,
and extension settings. The side panel and canvas are two views of one product.

Upstream: `basketikun/infinite-canvas` at `e6d0911` (`v0.19.0`). Keep its MIT
license and original attribution. Do not develop against the ignored `dist/canvas`
bundle. Remote JavaScript plugins are not supported in the MV3 extension build.

## Delivery gates

1. **Source and build:** Track the upstream source and pin its revision. Build a
   self-contained extension page from source, without fetching executable code.
   Keep the existing `workbench.html` available until all later gates pass.
2. **One pocket:** The full-page app browses the same PicPocket image records and
   nested folders as the side panel. A launch from a pocket item passes its ID;
   the canvas resolves its original image and existing reverse-prompt record.
   Opening the canvas prepares generation but never submits a paid request.
3. **One save path:** Saving a generated image offers a destination folder and
   uses PicPocket's existing asset writer. The saved item is immediately visible
   in either view. Keep upstream's canvas-only text/video assets separate unless
   explicitly migrated.
4. **Non-destructive project migration:** Convert existing PicPocket canvas
   projects to upstream project nodes once, with a versioned marker and a backup.
   Never delete the previous project data. Test repeat runs and partial failures.
5. **One external agent surface:** The extension build hides Infinite Canvas's
   separate Canvas Agent panel and keeps PicPocket MCP as the only visible entry.
   Add canvas operations to that interface before replacing its bridge; do not
   start two owners for one connection.
6. **Cutover:** Only switch the side-panel launcher after typecheck, tests,
   production extension build, and the repository's two-axis review pass.
   Verify old assets and projects remain readable after switching.

## Initial execution

Pin and build upstream in parallel with the current workbench. Discover MV3
incompatibilities before changing navigation or persistent data. Work through
the gates in order and report any gate not yet met explicitly.
