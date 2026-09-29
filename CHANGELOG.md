# Changelog

## 0.3.0

- Add source-definition inspection with syntax highlighting, Markdown notes,
  Markdown text, and table descriptions.
- Improve automatic arrow ports, drag targets, distance-muted arrows, zoom,
  keyboard editing, multi-selection, and compact canvas controls.
- Read one-table-per-file PostgreSQL directories, including foreign keys
  declared in separate files.
- Add `schema-canvas/server/annotations` and the
  `schema-canvas migrate-annotations --annotations <file>` command.

Existing layout files remain valid; table Markdown and explicit arrow muting are
additive fields. Existing note and text `label`/`text` values render as Markdown
on read. The migration command converts those values to a single `markdown`
field while preserving geometry, order, and other stored fields. It writes
atomically, checks for concurrent edits, and rejects malformed or ambiguous
records. Hosts choose when to run it because the package cannot know their
annotation file paths.

## 0.2.4

- Place compact zoom in, zoom out, and fit controls at the lower center of the
  canvas when navigation controls are enabled.
- Keep the controls clear of the search button and mobile annotation actions.

Existing layout and annotation files need no migration.

## 0.2.3

- Add a compact, debounced table search that finds labels and IDs across views,
  selects and focuses a result, and notifies the host for route updates.
- Switch to the matching view when a host changes `initialTableId`.

Existing layout and annotation files need no migration.

## 0.2.2

- Let trackpad pinch gestures zoom the canvas over note annotations while
  retaining ordinary wheel scrolling inside long notes.

Existing layout and annotation files need no migration.

## 0.2.1

- Preserve line breaks and long identifiers in note and text annotations. Keep
  constrained notes scrollable without letting their wheel events zoom the
  canvas.
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
