# Proposed architecture

## One package, isolated subpaths

The first release should stay in one package. Subpath exports keep the browser,
parser, and persistence dependency graphs separate without creating versioning
work across several packages.

```text
core
  normalized graph, layout, annotations, validation, migrations

react
  canvas, nodes, editors, save queue, focus behavior

server/convex
  TypeScript AST source adapter

server/postgres
  declarative SQL source adapter

server/json-store
  checked-in JSON reader, validator, atomic writer, revision checks
```

The `react` entry point may depend on `core`. Server entry points may depend on
`core`. Browser code must never reach a server entry point through a barrel.

## Core intermediate representation

The graph model should contain only information the canvas can use. Adapters
may attach source-specific metadata through generic records.

```ts
export type SchemaField = {
  name: string;
  type: string;
  optional: boolean;
  primaryKey?: boolean;
  foreignKeyTargets: string[];
  arrowsDisabled?: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type SchemaTable = {
  id: string;
  label: string;
  fields: SchemaField[];
  group?: string;
  external?: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type SchemaEdge = {
  id: string;
  source: string;
  target: string;
  field: string;
  optional: boolean;
  sourceFields?: string[];
  targetFields?: string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type SchemaGraph = {
  tables: SchemaTable[];
  edges: SchemaEdge[];
  warnings: string[];
};
```

Stable table and edge identifiers are part of the persistence contract. Parser
changes must include compatibility tests for identifier stability.

## Adapter and provenance boundary

The normalized `SchemaGraph` is also the extension point for schema formats
that the package does not parse. A host adapter maps its declarations to tables
and edges, then calls `validateSchemaGraph` before rendering. The package does
not need to know the source language.

Adapters may attach JSON-safe provenance to table, field, and edge `metadata`.
Relative file names and line numbers are suitable values. Source text and file
loading remain in the host. The React API reports selection through
`onSelectedTableChange` and accepts host content through `renderTableDetails`.
This lets a host place a read-only source preview in the table editor without
putting a router, code editor, or filesystem API in the browser package.

## Layout model

The layout should be a superset of the supported controls:

- snapped `x` and `y` positions;
- table appearance;
- full or concise field display;
- explicitly highlighted fields;
- hide all, incoming, or automatically muted incoming edges;
- source and target ports;
- straight or elbow routing;
- per-edge hidden and explicitly muted flags;
- reserved optional edge shift and stroke style fields for compatibility.

Defaults that name particular tables belong in host configuration, not the
package.

## Annotation model

Use four distinct annotation kinds rather than collapsing different jobs into
one overloaded note:

- `frame`: a labeled visual grouping boundary;
- `note`: a compact card with title and body;
- `text`: free typographic text with configurable font size;
- `image`: an image supplied by the host plus a label.

All kinds should support direct move and resize in writable mode. Numeric size
controls remain available for precision and accessibility. Image upload and URL
resolution are host callbacks; the package must not assume a filesystem or
object store.

## React API

The main component should accept already loaded data and controlled integration
callbacks. It should not fetch, authenticate, or navigate on its own.

```ts
export type SaveRequest<T> = {
  value: T;
  expectedRevision?: string;
};

export type SaveResponse<T> = {
  value?: T;
  revision?: string;
};

export type SchemaCanvasProps = {
  graph: SchemaGraph;
  layout: SchemaLayout;
  annotations?: SchemaAnnotation[];
  views?: SchemaView[];
  writable: boolean;
  initialTableId?: string;
  layoutRevision?: string;
  annotationRevision?: string;
  labels?: Partial<SchemaCanvasLabels>;
  features?: Partial<SchemaCanvasFeatures>;
  onSaveLayout?: (
    request: SaveRequest<SchemaLayout>,
  ) => Promise<SaveResponse<SchemaLayout>>;
  onSaveAnnotations?: (
    request: SaveRequest<SchemaAnnotation[]>,
  ) => Promise<SaveResponse<SchemaAnnotation[]>>;
  onUploadImage?: (file: File) => Promise<{ asset: string; src?: string }>;
  onSelectedTableChange?: (tableId: string | null) => void;
};
```

The save queue should debounce bursts, serialize in-flight writes, retain only
the newest queued value, surface errors, and update opaque revisions returned by
the host. The same implementation should handle simple non-revisioned saves.

## Styling and localization

Ship semantic class names and a compiled CSS file. Expose color, spacing,
radius, typography, and canvas variables. Avoid imports from a consumer's UI
kit.

Ship concise English defaults. Every visible string and accessible label must
be overridable through one typed label object. This lets consumers connect any
translation system without making it a package dependency.

## Server adapters

Parsers return the core graph and diagnostics. They must not decide who may view
or edit it.

The TypeScript adapter should accept an entry point and a source reader so it
can work with disk files or a build tool's virtual source map. The PostgreSQL
adapter should accept source strings or a directory and callbacks for table
grouping and labels.

The JSON store should expose strict parsing plus optional optimistic revisions.
Writes use a same-directory temporary file and atomic rename under a serialized
write lock. Existing unversioned JSON formats must remain readable during the
first migration.

The host chooses the layout and annotation paths. Those files are intended to
be checked into the host repository, reviewed, and migrated with the schema.
The package never uploads them or chooses a remote storage service.
