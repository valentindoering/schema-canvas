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
These fields share a Tiptap editor with headings, emphasis, lists, code, links,
local undo/redo, and an expanded writing view. The editor loads on demand when
a writable Markdown field opens; read-only canvases do not load Tiptap.
The Source switch edits the original Markdown directly. Opening an editor,
switching modes, or expanding it does not rewrite or save the content.
Rich-text edits serialize back to Markdown and can normalize its syntax and
spacing. Content outside the configured rich-text schema (such as raw HTML,
embedded images, and tables) stays in Source mode to preserve it. If the editor
cannot load, an editable source field remains available with an error message.
No persisted-format migration is needed.
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
  --schema-canvas-review-accent: #2563eb;
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

Select **Large system** or add `?example=large` for a fictional 96-table system
with eight separated regions, cross-region relationships, and architectural
notes. It keeps its saved state separate from the small example. The
[agent reading exercise](examples/playground/architecture-reading.md) records
which MCP queries reveal cancellation, ownership, and asynchronous boundaries.

The example source lives in [`examples/playground`](examples/playground). It is
kept out of the npm tarball and can later be deployed as the package website
without adding application routes, authentication, or a real database to the
library itself.

## AI context and human-reviewed suggestions

Agents may read canvas documentation and submit proposals. They must not edit
its authoritative JSON, layout, or annotation files directly. A proposal is a
pending suggestion; it does not enter the canvas autosave queue. The host's
human-only review endpoint applies it after the person opens and confirms the
exact changes in the canvas.

### Rules for proposing agents

The human can only accept or decline a whole proposal, so agents should:

- **Propose one change per table note or annotation.** Never bundle unrelated
  notes into one proposal. Use several operations only when they change the same
  object together, such as a note's text and its position.
- **Write with real table names.** Say "a `cargo_manifests` row", not "a
  manifest". Readers search for table names.
- **Withdraw obsolete proposals.** When manual edits made one of its own pending
  proposals unnecessary, the agent withdraws it instead of leaving it for the
  human to decline.

These rules are part of `canvasAgentPolicy`, returned with every context read,
and of the MCP tool descriptions.

### Read context by names and relationships

```ts
import {
  getCanvasContext,
  canvasContextMarkdown,
  canvasContextSvg,
} from "schema-canvas/core";

const document = { graph, layout, annotations, views };
const context = await getCanvasContext(document, {
  table: "projects", // exact id or unambiguous label
  hops: 1,
  includeImage: true,
});
const text = canvasContextMarkdown(context);
const diagram = canvasContextSvg(context);
```

Queries can select a `table` plus `hops` (0–3), a named `view`, a named `frame`,
`tableIds`/`annotationIds`, or `bounds`. An empty query reads the whole document.
Unknown and ambiguous names fail explicitly. The default limits are 100 tables and 100 annotations;
`maxTables` and `maxAnnotations` can each raise the limit to 500. Truncated responses list omitted table ids, and
relationships crossing the requested boundary remain visible. `findCanvasTables`
resolves partial names before a neighborhood query.

The versioned response includes complete field definitions and Markdown,
positions, appearance, frame containment, nearby notes, and relative placement.
Spatial relationships are observations with geometry provenance, not assertions
of ownership or architectural intent. Offline table bounds are explicitly
estimated; pass measured `geometry` as the third argument to use actual bounds.
Hidden edges are included with the reason they are hidden. Gray edges distinguish
explicit muting from automatic distance muting. Resolved image URLs are omitted
from context. Schematics represent embedded images by their labels, so generating
context does not fetch arbitrary image URLs.

A table query includes distant notes in its containing frames, while keeping
notes inside sibling nested frames separate unless they are physically nearby.
Readable responses distinguish declared table groups from geometric containment.
Whole-schema views include global notes. A table budget retains the requested
root before its neighbors.

`revision` hashes the canonical complete document; proposal submissions must use
that revision. `snapshotId` also identifies the query and resolved geometry.
Text, JSON, SVG, and optional MCP PNG use that same snapshot. `draft: true` means
a browser export includes unsaved edits; save those edits before proposing
against its revision. Hashing requires Web Crypto (HTTPS or localhost in browsers).

`SchemaCanvasHandle.getContext(query)` reads the current canvas with measured
bounds and never saves. The built-in **AI context** action exports the current
view or selection as Markdown, JSON, and an optional SVG schematic. Disable the
action with `features={{ contextExport: false }}`.

### Persist proposals separately from live documentation

```ts
import { createCanvasReviewService } from "schema-canvas/core";
import {
  initializeCanvasReviewFile,
  createFileCanvasReviewStore,
} from "schema-canvas/server/review-store";

// Run once, explicitly. An existing file is never overwritten.
await initializeCanvasReviewFile("./data/canvas-review.json", document);
const store = createFileCanvasReviewStore({
  filePath: "./data/canvas-review.json",
});

const service = createCanvasReviewService({
  store,
  authorizeReview: async (request: HumanRequest) => {
    // Implement these checks in the host using server-owned session context.
    const person = await authenticateHuman(request);
    if (!person?.canReviewCanvas) throw new Error("Review permission required");
    return { reviewerId: person.id };
  },
});

// Bind this identity from the authenticated agent connection, not tool arguments.
const agent = service.agent("documentation-assistant");
const context = await agent.getContext({ table: "projects", hops: 1 });
const proposal = await agent.propose({
  baseRevision: context.revision,
  title: "Explain the project boundary",
  reason: "Document why projects reference accounts.",
  operations: [
    {
      op: "set_table_markdown",
      tableId: "projects",
      markdown: "## Ownership\n\nProjects belong to accounts.",
    },
  ],
});
// proposal.status === "pending"; live documentation has not changed.
```

The state file is a new, explicit `version: 1` envelope containing `document` and
`proposals`. Existing layout and annotation files are not migrated or rewritten.
The host must use this envelope as its authority, or implement `CanvasReviewStore`
with an equivalent database transaction over the live document and proposal
ledger. Do not keep independent writers updating separate copies of the same
live document. `service.saveDocument(next, expectedRevision, humanContext)` is
the authenticated, revision-checked path for ordinary human edits.

The file store serializes writes within the process and uses an exclusive lock
file across processes. Accepted changes and their audit record are committed in
one atomic rename. It uses mode `0600`; OS permissions and directory ownership
still belong to the host. An active lock fails explicitly. After a crashed
writer, verify that it is stopped before removing its `.lock` file. Malformed
state and unsupported versions fail; no data is silently reset. The host can
archive decided proposals before the 1000-entry ledger limit is reached.

Proposal operations are restricted to table documentation, placement and
appearance; arrow presentation; and adding/updating/deleting annotations.
Agents cannot alter schema declarations or arbitrary JSON paths. Asset URLs and
new image annotations are excluded from proposal operations. Each pending
proposal stores its original baseline for a durable before/after review. Once a
proposal is decided, its baseline is dropped and only the audit record remains,
which keeps the ledger small. Treat the ledger as private documentation too.

### Connect the human review surface

```tsx
<SchemaCanvas
  graph={snapshot.document.graph}
  layout={snapshot.document.layout}
  annotations={snapshot.document.annotations}
  writable={canEdit}
  proposalReview={{
    revision: snapshot.revision,
    proposals,
    onOpenReview: (id) => humanApi.openReview(id),
    onAccept: (decision) => humanApi.accept(decision),
    onReject: (decision) => humanApi.reject(decision),
  }}
/>
```

The host loads `snapshot` with `service.readDocument()` and `proposals` with
`service.listProposals()`. It binds `humanApi` to authenticated host routes:
`service.openReview(id, humanContext)`, `service.accept(decision, humanContext)`,
and `service.reject(decision, humanContext)`. Refresh the controlled document,
revision, and proposal props after decisions or external edits. These routes
must authenticate and authorize the human independently of agent credentials.
Do not accept a caller-supplied `reviewerId` as authentication.

The suggestion panel opens in the top-right corner whenever proposals are
pending. Each card displays a unified red/green documentation diff, compact
property changes, and **Accept** / **Decline** actions. The panel can be collapsed
without discarding suggestions. **Go to** focuses the affected table, arrow
endpoints, or annotation on the live canvas. On narrow canvases this also
collapses the panel so the target is visible. Optional previews show only the
affected object, excluding surrounding frames and unrelated tables. Arrow
endpoints are arranged together in previews so distant tables remain legible.
Long unchanged sections of documentation fold away; changed lines remain visible.

Displaying a card calls `onOpenReview` before enabling its decision actions.
Acceptance remains an explicit human click. Previews and navigation never change
canvas state or call save callbacks. Accept is disabled while local edits are
unsaved and when the proposal is stale. Stale proposals can still be declined
and list the fields that block them.

Decisions are optimistic: the card leaves the panel at once, a short status line
names the decision being saved, and decisions are sent to the host one at a time
in the background. The canvas and the other cards stay usable meanwhile. If a
decision fails, its card returns with the error. Refresh the controlled document,
revision, and proposal props after decisions; this need not block the decision
callback. Open cards also refresh quietly after the canvas saves its own edits,
keeping the previous review visible until the new one arrives.

Staleness is decided per field. Each operation is compared only with the field
it writes, against the proposal's stored baseline:

| Operation              | Blocks only when, since the proposal                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `set_table_markdown`   | that table's Markdown changed and cannot be merged, or the table is gone                 |
| `move_table`           | that table's position changed                                                            |
| `set_table_appearance` | that table's appearance changed                                                          |
| `update_edge`          | the arrow setting it writes changed, or the arrow is gone                                |
| `add_annotation`       | an annotation with the same id exists                                                    |
| `update_annotation`    | a property it writes changed (Markdown: and cannot be merged), or the annotation is gone |
| `delete_annotation`    | the annotation changed or is gone                                                        |

Moving a documented table, editing other tables or annotations, renaming tables,
and changing views never block a suggestion. When both the human and the
suggestion edited the same Markdown, a line-based three-way merge combines them
if they changed different lines; the card marks such a change as merged and the
diff shows the suggestion against the current text. Overlapping or adjacent line
edits are a conflict. Proposal submission and whole-document saves still require
the exact current revision.

The server issues a short-lived, reviewer-bound token when opening a review.
Acceptance verifies that token, the exact proposal digest, pending status, and
the affected fields against their baseline inside the same transaction. A merged
result is bound to the receipt too: if the human edits the same text again after
opening the review, acceptance asks for the updated result to be reviewed first.
Reopening a card with a still-valid receipt is a read and does not write the
ledger. Repeated approval cannot apply twice. Decisions retain reviewer, timestamp, and resulting revision;
review tokens and baseline documents are never returned through agent tools.

This establishes a permission boundary only if the host protects it. An agent
with unrestricted write access to the authority file can bypass any API.
An agent controlling the same authenticated browser session could also click
its buttons. For stronger separation, keep authority storage outside the agent's
writable workspace and require an independent user-presence check (for example,
a host-verified WebAuthn assertion) on the approval endpoint. No UI can prove that
someone actually read a change. The package does not claim otherwise.

### Expose MCP tools

```ts
import { createCanvasAgentServer } from "schema-canvas/server/agent";

const server = createCanvasAgentServer(agent, {
  reviewUrl: (id) => `https://example.com/canvas?proposal=${id}`,
});
// Connect an official MCP SDK transport in the host. Keep HTTP routing,
// authentication, authorization, and canvas selection in the host.
```

The server uses the official MCP TypeScript SDK v2. The PNG renderer is imported
only when `includeImage: true`; neither the MCP SDK nor the renderer enters the
browser import graph. The tool surface contains exactly:

- `find_canvas_tables({ query, limit? })`
- `get_canvas_context({ table?, hops?, view?, frame?, tableIds?, annotationIds?, bounds?, maxTables?, maxAnnotations?, includeImage? })`
- `propose_canvas_change({ baseRevision, title, reason, operations })`
- `get_canvas_proposal({ proposalId })`
- `list_canvas_proposals({ status? })` (the agent's own proposals)
- `withdraw_canvas_proposal({ proposalId })` (only the agent's own pending ones)

There is no approval, direct-save, or filesystem-write tool. Acceptance stays
human-only. An agent can decline (withdraw) only proposals it submitted itself;
they are recorded with status `withdrawn` and the agent as decider. Tool
annotations describe side effects but are not permission enforcement.
`propose_canvas_change` and `withdraw_canvas_proposal` are correctly marked as
writes to the proposal ledger.
The host must authorize which canvas each agent can access before constructing
its capability object.

A local stdio server is also available:

```sh
schema-canvas init-review --document ./data/document.json --state ./data/canvas-review.json
schema-canvas agent --state ./data/canvas-review.json --actor documentation-assistant --review-url https://example.com/canvas
```

The initial document JSON contains `graph`, `layout`, `annotations`, and optional
`views`. Initialization is explicit and never replaces an existing file. The
stdio process cannot approve changes. A separate authenticated human host uses
the same store to review them. Restrict the agent process's filesystem access;
stdio does not make a same-user writable file tamper-proof.

The playground's **Try an AI suggestion** button demonstrates submission,
persistence, preview, acceptance, and rejection using browser-local storage.
It simulates an agent; it is not a production authentication boundary.
