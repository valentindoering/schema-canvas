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
- Frames, titled notes, free text, and image annotations with direct on-canvas
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
      renderTableDetails={(table) => <ReadOnlySourcePreview table={table} />}
    />
  );
}
```

The host can provide custom views, labels, feature switches, image upload and
resolution callbacks, default field density, and save callbacks. It remains
responsible for deciding who may load or edit the diagram.

Every table in `graph` renders immediately. Tables without saved coordinates
appear in a vertical column to the right of the saved diagram, with spacing
based on their height. Existing table and annotation positions stay untouched.
These fallback positions are not saved until the table is edited or moved.
Tables can be dragged when `writable` is true. The default canvas has no
permanent action toolbar or new-table tray.
Table and edge editors appear after selection, and annotation actions stay in
a compact icon toolbar at the lower left. Selected annotations resize through
drag handles on the canvas. Hosts can enable the optional canvas toolbar or
unpositioned-table tray through feature switches when their route needs them.
Automatic arrangement requires explicit `autoLayout: true`; it is disabled by
default. Set `navigationControls: false` to hide the zoom/fit button panel.

## Source adapters

```ts
import { parseConvexSchema } from "schema-canvas/server/convex";
import { readPostgresSchemaDirectory } from "schema-canvas/server/postgres";

const convexGraph = parseConvexSchema("convex/schema.ts");
const postgresGraph = await readPostgresSchemaDirectory("database/tables");
```

Both adapters fail when a relationship cannot be accounted for. Grouping and
display labels are host callbacks rather than package defaults.

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
as a relative file name and line number. The canvas does not read or display
source files. A host can use `renderTableDetails` to place a read-only source
preview inside the existing table editor. `onSelectedTableChange` remains
available for routes and other host state. Neither API couples the package to a
router or code editor.

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

## Styling

Override variables on `.schema-canvas` or an ancestor:

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
image upload, save feedback, and a fictional read-only source preview inside
the table details panel. Clicking a table shows the file that produced it.
Changes stay in that browser's local storage, and **Reset example** restores the
original fictional data.

The example source lives in [`examples/playground`](examples/playground). It is
kept out of the npm tarball and can later be deployed as the package website
without adding application routes, authentication, or a real database to the
library itself.
