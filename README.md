# Schema Canvas

Schema Canvas is a reusable React canvas for inspecting and arranging a database
schema. It keeps routes, access rules, navigation, persistence policy, and
translations in the host application.

Schema Canvas is published under the [MIT License](LICENSE). Release candidates
are packed, tested, inspected, and consumer-verified before publication.

## Capabilities

- A framework-neutral graph, layout, annotation, and view model.
- Discriminated-union branches with member fields and branch-specific foreign-key arrows.
- A React Flow canvas with table selection, focus, minimap, fit view, grid
  snapping, and optional ELK layout.
- Full and concise field views, temporary expansion, field highlights, table
  appearance, eight edge ports, straight and elbow routing, automatic and
  explicit edge muting, and edge visibility controls.
- Source definition popup with syntax highlighting for TypeScript, JavaScript,
  SQL, JSON, HTML, CSS, YAML, shell, and Python files.
- Frames, Markdown notes, Markdown text, and image annotations with direct on-canvas
  resize. Their numeric dimensions remain part of the serialized model.
- Image replacement, visible upload errors, and aspect-ratio-preserving image resize.
- Read-only and writable modes controlled by the host.
- Debounced, serialized, latest-value save queues with optional opaque
  revisions.
- Strict Convex TypeScript and declarative PostgreSQL source adapters.
- Atomic JSON persistence with optimistic revision checks.
- Plain CSS with variables and no dependency on a host UI kit or utility-CSS
  scanner.

## Package boundary

Schema Canvas owns the normalized graph, layout rules, canvas, editors,
annotation model, and save coordination. A host application owns its route,
authentication, authorization, navigation, persistence policy, translations,
and deployment-specific read/write rules.

The exports are:

```text
schema-canvas/core
schema-canvas/react
schema-canvas/server/convex
schema-canvas/server/postgres
schema-canvas/server/json-store
schema-canvas/server/layout
schema-canvas/server/annotations
schema-canvas/styles.css
```

Browser exports do not import Node.js modules. Source parsing and filesystem
persistence are available only through `server/*` subpaths.

## React usage

```tsx
import { SchemaCanvas } from "schema-canvas/react";
import "schema-canvas/styles.css";

export function Diagram({ graph, layout, writable }) {
  return (
    <SchemaCanvas
      graph={graph}
      layout={layout}
      writable={writable}
      onSaveLayout={async ({ value, expectedRevision }) => {
        const response = await saveLayout({ value, expectedRevision });
        return { value: response.layout, revision: response.revision };
      }}
      onSelectedTableChange={(tableId) => {
        updateRoute(tableId);
      }}
      onLoadTableDefinition={async (table) => {
        const response = await fetch(
          `/api/schema-source/${encodeURIComponent(table.id)}`,
        );
        if (!response.ok)
          throw new Error(`Source request failed: ${response.status}`);
        return response.json(); // { path: string, source: string }
      }}
    />
  );
}
```

The host can provide custom views, labels, feature switches, image upload and
resolution callbacks, default field density, and save callbacks. It remains
responsible for deciding who may load or edit the diagram.

Changing `initialTableId` selects and focuses that table without remounting the
canvas or discarding pending saves, so hosts can use it for route navigation.
The host maps a table name or ID in its URL to `initialTableId`. The compact
search button at the upper left finds tables by label or ID across views,
selects and focuses the chosen table, and calls `onSelectedTableChange` so the
host can update its route. Search works in read-only and writable modes.

Every table in `graph` renders immediately. Tables without saved coordinates
appear in a vertical column to the right of the saved diagram, with spacing
based on their height. Existing table and annotation positions stay untouched.
These fallback positions are not saved until the table is edited or moved.
Tables can be dragged when `writable` is true. The default canvas has no
permanent action toolbar or new-table tray.
Table and edge editors appear after selection. A plus button opens icon-only
annotation actions at the lower left. Selected annotations resize through
drag handles on the canvas. Hosts can enable the optional canvas toolbar or
unpositioned-table tray through feature switches when their route needs them.
In writable mode, a brief hint appears while dragging to show that Shift-click
adds tables to the selection. A regular click selects one table.
Automatic arrangement requires explicit `autoLayout: true`; it is disabled by
default. Search, undo, and redo share the upper-left dock. Compact zoom in,
zoom out, and fit controls stay at the lower left beside Add; set
`navigationControls: false` to hide the zoom controls.

In writable mode, canvas focus supports Cmd/Ctrl+D to duplicate a selected
annotation, Cmd/Ctrl+C and Cmd/Ctrl+V to copy and paste annotations, and
Cmd/Ctrl+Z or Cmd/Ctrl+Shift+Z to undo or redo canvas edits. Ctrl+Y also
redoes. The clipboard and history belong to the current canvas session.
Shortcuts leave inputs and Markdown editors alone. Delete/Backspace never
removes annotations; use the explicit delete action in the editor.

Notes and text annotations use one Markdown field. They render headings,
emphasis, lists, quotes, code, and links. Raw
HTML and embedded images are not rendered. A writable table can also store
Markdown in its optional `layout[tableId].markdown` field; it appears between
the title and attributes. Existing layouts without that field remain valid.
The appearance editor uses icon-only swatches for three neutral presets and
six coordinated colors. Hosts may override their CSS colors.

Without a saved port choice, each arrow compares the actual table bounds and
the available port positions. It favors short connections that leave and enter
the tables from facing sides, including corner ports for diagonal placement.
The choice updates while a table moves. A saved source or target port remains
fixed, and the other end is inferred around it. Select an arrow to expose its
white endpoint circles; only that arrow can be reconnected. Drag a circle
toward a highlighted port on the same source or target table. A release near
a port snaps to it. The edge editor offers Automatic, Keep dark, and Keep gray
color choices; `muted: false` persists the dark override even beyond the
automatic distance threshold. The default dot backdrop is
static while zooming, so pinch gestures do not repeatedly redraw an SVG dot
pattern.

## Save lifecycle and navigation

Use a ref to coordinate route exit with both save channels:

```tsx
import { useEffect, useRef } from "react";
import { SchemaCanvas, type SchemaCanvasHandle } from "schema-canvas/react";

// Inside your host component:
const canvas = useRef<SchemaCanvasHandle>(null);

// Inside the host component. Register this for the editor's whole lifetime so
// the first edit is protected before any React state update is rendered.
useEffect(() => {
  const warn = (event: BeforeUnloadEvent) => {
    if (!canvas.current?.getSaveState().dirty) return;
    event.preventDefault();
    event.returnValue = "";
  };
  window.addEventListener("beforeunload", warn);
  return () => window.removeEventListener("beforeunload", warn);
}, []);

async function leaveEditor() {
  try {
    await canvas.current?.flushSaves();
    navigateAway(); // Host-owned router operation, after successful persistence.
  } catch (error) {
    showSaveError(error); // Stay in the editor; do not navigate in finally.
  }
}

// Supply the usual graph, layout, writable, and persistence props as well.
<SchemaCanvas
  ref={canvas}
  {...diagramProps}
  onSaveStateChange={reportSaveState}
/>;
```

Wire this policy into the router's blocker for every route-exit path, including
Back and links outside the editor. Table focus changes can keep the editor
mounted. Disable further editing while accepting navigation, or recheck dirty
state before completing the transition.

- `getSaveState()` returns aggregate `dirty` and `pending` flags plus `layout`
  and `annotations` channel snapshots. Each channel has `dirty`, `pending`,
  and `state` (the existing idle/saving/saved/error union).
- Dirty becomes true synchronously when an edit is queued, including during
  debounce. Failed values remain dirty. Pending means a timer or write is
  active; a failed channel can be dirty without being pending.
- `flushSaves()` bypasses debounce, retries retained failures, and waits for
  both channels, including queued successors. It rejects on failure after both
  channels settle. Saves across channels are independent, not one transaction.
- `whenSavesIdle()` waits without bypassing debounce or retrying failures. It
  rejects if either channel has a retained error.
- `onSaveStateChange` reports changes immediately. It can also report fallback
  save results after unmount, so route-independent error reporting should live
  outside the editor. Do not navigate directly from this notification.

Unmount starts a best-effort drain, but a closing browser may terminate it.
Awaiting saves before route exit and warning on dirty hard-page unload are host
responsibilities. Browsers may suppress unload prompts; neither a prompt nor
unmount flushing guarantees delivery after a tab closes. Keep the same canvas
instance only for the same document; flush before switching documents.

Queues survive callback identity changes and keep opaque revisions in order.
External revision updates are accepted only while the channel is clean.
Conflict errors require the host to reload/merge the remote document before
retrying with an appropriate revision; retries never silently replace the
expected revision. No save callback means that channel is local-only and is
not tracked as unsaved persistence work.

The core `createSaveQueue` also exposes `getSnapshot()`, `whenIdle()`, and
`onSnapshotChange`. Its `dispose()` explicitly cancels queued work; call
`flush()` first when cancellation is not intended.

## Source adapters

```ts
import { parseConvexSchema } from "schema-canvas/server/convex";
import { readPostgresSchemaDirectory } from "schema-canvas/server/postgres";

const convexGraph = parseConvexSchema("convex/schema.ts");
const postgresGraph = await readPostgresSchemaDirectory("database/tables");
```

Both adapters fail when a relationship cannot be accounted for. Grouping and
display labels are host callbacks rather than package defaults.

The PostgreSQL directory reader accepts one table definition per `.sql` file.
It resolves `ALTER TABLE` foreign keys across files, including statements
that alter a different table from the one declared in their file. Keep source
files on the server and pass their `metadata.sourcePath` to a host callback if
the canvas should display the original definition.

The Convex adapter resolves declarations from the schema entry point and its
direct imports by default. This preserves existing graph and edge identifiers
when a table module imports an opaque shared validator. Set
`followTransitiveImports: true` to expand validator declarations through nested
local imports.

The adapter also preserves source-level `@noArrowFields(...)` and
`@noArrowTargetTables(...)` directives. Hosts can add dynamic suppression with
the `arrowsDisabled` callback.

### Custom adapters

An application with another schema format can convert it to the public graph
model. No parser registration or package fork is required:

```ts
import { validateSchemaGraph, type SchemaGraph } from "schema-canvas/core";

export function adaptMySchema(input: MySchema): SchemaGraph {
  return validateSchemaGraph({
    tables: input.entities.map(toSchemaTable),
    edges: input.references.map(toSchemaEdge),
    warnings: [],
  });
}
```

Table, field, and edge `metadata` may contain JSON-safe source provenance such
as a relative file name and line number. With `onLoadTableDefinition`, selecting
a table offers a **View definition** button in both read-only and writable
modes. The canvas opens a read-only popup with the source path and exact text
returned by the host. It shows loading and error states; an absent or empty
definition is an error. The host resolves table IDs to files and controls access
to source text. File extensions select syntax highlighting; unknown extensions
remain plain, escaped text. For a Convex app this may be a TypeScript schema
module; for a SQL app it may be one `.sql` file per table. The browser package never reads
the filesystem. `renderTableDetails` remains available for custom content in
the writable table editor, and `onSelectedTableChange` remains available for
routes and other host state.

## JSON persistence

```ts
import { parseSchemaLayout } from "schema-canvas/core";
import { createJsonStore } from "schema-canvas/server/json-store";

const store = createJsonStore({
  filePath: "data/schema.layout.json",
  parse: (value) => parseSchemaLayout(value, graph),
  missing: () => ({}),
});

const snapshot = await store.read();
await store.write(nextLayout, snapshot.revision);
```

Writes are serialized per file, written to a same-directory temporary file, and
committed with an atomic rename. Passing a stale revision throws
`RevisionConflictError`.

The layout and annotation JSON belong to the host repository. A typical host
keeps them beside its schema, reviews changes in pull requests, and commits them
like any other source file. The package does not upload layouts or keep a remote
copy.

### Annotation migration

The current annotation format stores one `markdown` field for notes and text.
`parseSchemaAnnotations` accepts older `label` and `text` records in memory.
For a note, migration turns the old label into a Markdown heading above the
body. For text, identical label and text values collapse into one value;
distinct values are both retained. Frames and images still use `label`.

To rewrite a checked-in annotation file, run:

```sh
schema-canvas migrate-annotations --annotations path/to/schema.annotations.json
```

The command preserves array or object envelopes, writes atomically, and can be
run again without further changes. It stops on malformed or unrecognized data
instead of discarding it. The host chooses when to run this migration because
the package does not know its annotation file path. The playground migrates its
browser storage when opened.

## Color themes

The canvas starts in light mode. Its upper-right switch toggles light and dark
in read-only and writable modes; this changes presentation only, not the saved
layout or annotations. Use `defaultTheme="dark"` for an uncontrolled dark
initial state. Hosts that persist a preference can pass `theme="dark"` or
`theme="light"` and update it through `onThemeChange`. A controlled theme
without `onThemeChange` hides the built-in switch. Set
`features={{ themeToggle: false }}` if the host provides its own switch. The
playground stores its choice in browser storage.

## Styling

Override variables on `.schema-canvas` for light mode and
`.schema-canvas[data-theme="dark"]` for dark mode:

```css
.schema-canvas {
  --schema-canvas-background: #f8fafc;
  --schema-canvas-surface: #ffffff;
  --schema-canvas-border: #cbd5e1;
  --schema-canvas-text: #0f172a;
  --schema-canvas-text-muted: #64748b;
  --schema-canvas-accent: #2563eb;
  --schema-canvas-accent-soft: #dbeafe;
  --schema-canvas-danger: #b91c1c;
  --schema-canvas-success: #047857;
  --schema-canvas-edge-strong: #020617;
  --schema-canvas-edge-optional: #475569;
  --schema-canvas-edge-muted: #94a3b8;
  --schema-canvas-edge-muted-optional: #e2e8f0;
  --schema-canvas-radius: 10px;
  --schema-canvas-font: Inter, ui-sans-serif, system-ui, sans-serif;
  --schema-canvas-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --schema-canvas-shadow: 0 12px 32px rgb(15 23 42 / 12%);
}
```

## Verification

`pnpm check` runs formatting, lint, type checking, unit and component tests,
Chromium browser tests, the production build, package inspection, JavaScript
subpath imports, and a TypeScript consumer fixture.

See [the architecture notes](docs/architecture.md) and
[release safety rules](docs/release-safety.md) for the package boundaries and
publication gates.

## Interactive example

Run the fictional, browser-only playground locally:

```sh
pnpm example:dev
```

Then open `http://127.0.0.1:4180`. The example opens directly as a writable
schema canvas. It demonstrates automatic table discovery, direct table
positioning, contextual table and edge controls, all four annotation kinds,
image upload, save feedback, distance-muted gray arrows, and a fictional
source definition popup. The example uses a shorter mute threshold so its long
voyage-to-port links are visible above the cards. Click a
table, then **View definition**, to inspect the file that produced it.
Changes stay in that browser's local storage, and **Reset example** restores the
original fictional data.

The example source lives in [`examples/playground`](examples/playground). It is
kept out of the npm tarball and can later be deployed as the package website
without adding application routes, authentication, or a real database to the
library itself.
