# Changelog

## 0.5.0

- Decide suggestion staleness per field. An operation is blocked only when the
  field it writes changed since the suggestion (or its target is gone). Moving a
  table, edits elsewhere on the board, table renames and view changes no longer
  block. Markdown edited by both sides is merged line by line when the edits do
  not overlap; merged changes are marked, and acceptance is bound to the exact
  merged result. Blocked cards list the conflicting fields.
- Make decisions optimistic: a card leaves at once and decisions save one at a
  time in the background, so the canvas and other cards stay usable. A failed
  decision returns its card with the error. Open reviews refresh quietly after
  canvas saves instead of flagging every save as stale.
- Reopening a review with a valid receipt no longer writes the ledger, and
  decided proposals drop their baseline document (about 1 MB each on a
  200-table schema). In a measured large-schema ledger this halved the time of
  each review call.
- Let an agent list its own proposals and withdraw its own pending ones
  (`withdrawn` status, MCP `list_canvas_proposals` and
  `withdraw_canvas_proposal`). Acceptance stays human-only.
- Teach proposing agents the rules through `canvasAgentPolicy`, the MCP tool
  descriptions and the README: one proposal per table note or annotation, real
  table names, withdraw obsolete proposals.
- Tab and Shift+Tab indent and outdent list items in the Markdown editor and no
  longer move focus out of a list.
- Center the expanded Markdown editor even when the host resets dialog margins
  (for example Tailwind's preflight).

Stored ledgers need no migration: existing files load unchanged, and decided
proposals lose their baseline on the next write. `StoredCanvasProposal.baseDocument`
is now optional, `CanvasProposal.status` adds `"withdrawn"`, and reviews add an
optional `conflicts` list.

## 0.4.0

- Show source and target tables in arrow details, with direct canvas navigation.
- Label the Add menu and its annotation actions.
- Add a lazy-loaded Tiptap editor for table, note, and text Markdown, with source
  editing and an expanded view. Opening an editor preserves exact saved Markdown.
- Export AI context as Markdown, structured JSON, and matching diagrams. Query by
  table, relationships, frame, view, selection, or bounds. Include distant region
  documentation and hidden relationships without treating placement as ownership.
- Add MCP read/proposal tools, durable review storage, and CLI agent support.
  Agent transports cannot approve or apply changes. Hosts own authentication and
  filesystem isolation.
- Display pending suggestions in an open, collapsible panel with unified diffs,
  compact position changes, navigation, focused previews, and explicit human
  acceptance or rejection. Independent suggestions can be accepted separately;
  conflicting edits remain blocked.
- Add a fictional 96-table playground with eight separated regions and an agent
  reading exercise.

Existing layout and annotation files need no migration. The optional review
ledger is a new, explicitly initialized store. Consumers enabling agent access
must bind human review callbacks to authenticated host endpoints.

## 0.3.3

- Preserve Markdown whitespace in note and text annotations so Enter and
  Shift+Enter can add lines at the end of the editor. Keep indentation,
  trailing spaces and blank lines through saves.

Existing layout and annotation files need no migration.

## 0.3.2

- Render Markdown bullets and numbers visibly in note and text annotations.
- Add a manual light and dark theme switch.

Existing layout and annotation files need no migration.

## 0.3.1

- Ignore the old text editor's generic `Text` label when converting an
  annotation that already has body content to Markdown. This prevents the
  placeholder from appearing above migrated text.

Run `schema-canvas migrate-annotations --annotations <file>` on original
legacy annotation files when upgrading from 0.2.x. Files already converted by
0.3.0 should be reviewed before removing any visible `Text` line, because
Markdown may intentionally start with that word.

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
