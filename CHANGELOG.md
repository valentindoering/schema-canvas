# Changelog

## 0.2.1

- Expose a canvas ref with `getSaveState`, `flushSaves`, and `whenSavesIdle`,
  plus immediate `onSaveStateChange` notifications for navigation guards.
- Drain queued layout and annotation edits on unmount instead of cancelling
  the debounce timer and dropping outstanding writes.
- Keep queues stable across save callback changes. Retain failed values for
  explicit retry and preserve revision ordering through successor writes.

Existing layout and annotation files need no migration. Hosts should await
`flushSaves` before route exit and warn on hard-page unload while dirty;
unmount flushing alone cannot guarantee delivery after a page closes.

## 0.2.0

- Use the unscoped npm package name `schema-canvas`.
- Display discriminated-union branches and branch-specific foreign-key arrows.
- Preserve aggregate arrow settings as inherited defaults for branch arrows.
- Resolve imported validators within their source modules and reject unresolved
  table declarations and field spreads.
- Stage tables without saved coordinates in a vertical column to the right of
  saved tables and annotations. Keep saved positions unchanged.
- Keep newly positioned tables at their displayed coordinates when editing
  their appearance or arrows.
- Disable automatic arrangement by default. Hosts must explicitly enable it.
  Add `navigationControls` to hide the zoom/fit controls independently.
- Keep resize handles outside clipped annotation content. Preserve image aspect
  ratios on resize, allow image replacement, and show image-upload failures.
- Preserve host-provided image data URLs up to 8 MiB.

Existing layout and annotation files need no migration. The normalized schema
graph gains optional union metadata; newly detected branch arrows accept older
aggregate layout keys.
