import {
  canvasKeys,
  canvasText,
  canonicalCanvasJson,
  parseCanvasDocument,
  type CanvasDocument,
} from "./canvas-document.js";
import { parseSchemaAnnotations } from "./annotations.js";
import { getSchemaEdgeLayout, setSchemaEdgeLayout } from "./layout.js";
import { assertRecord, finiteNumber } from "./shared.js";
import type {
  SchemaAnnotation,
  SchemaEdge,
  SchemaEdgeLayout,
  SchemaLayout,
  SchemaTableAppearance,
  SchemaTableLayout,
} from "./types.js";

export type CanvasProposalOperation =
  | { op: "set_table_markdown"; tableId: string; markdown: string }
  | { op: "move_table"; tableId: string; x: number; y: number }
  | {
      op: "set_table_appearance";
      tableId: string;
      appearance: SchemaTableAppearance;
    }
  | {
      op: "update_edge";
      edgeId: string;
      changes: {
        hidden?: boolean;
        muted?: boolean | "automatic";
        route?: "straight" | "smoothstep";
      };
    }
  | { op: "add_annotation"; annotation: SchemaAnnotation }
  | {
      op: "update_annotation";
      annotationId: string;
      changes: Partial<
        Pick<
          SchemaAnnotation,
          | "markdown"
          | "label"
          | "x"
          | "y"
          | "width"
          | "height"
          | "color"
          | "fontSize"
        >
      >;
    }
  | { op: "delete_annotation"; annotationId: string };
export type CanvasProposalInput = {
  baseRevision: string;
  title: string;
  reason: string;
  operations: CanvasProposalOperation[];
};
export type CanvasProposal = CanvasProposalInput & {
  id: string;
  actorId: string;
  createdAt: string;
  /** "withdrawn" means the proposing agent declined its own suggestion. */
  status: "pending" | "accepted" | "rejected" | "withdrawn";
  /** For "withdrawn", reviewerId is the proposing agent's actor id. */
  decision?: { reviewerId: string; at: string; revision: string };
  /**
   * A human asked the proposing agent to redo this stale suggestion on the
   * current text: read the context again, propose anew, withdraw this one.
   */
  rebaseRequest?: { reviewerId: string; at: string };
};
export type CanvasProposalChange = {
  index: number;
  operation: CanvasProposalOperation["op"];
  objectId: string;
  before: unknown;
  after: unknown;
  /** The suggestion was combined with edits made since it was proposed. */
  merged?: true;
};
/** A field the proposal writes that changed since its base in an incompatible way. */
export type CanvasProposalConflict = {
  index: number;
  objectId: string;
  field: string;
};
export type CanvasProposalReview = {
  proposal: CanvasProposal;
  reviewToken: string;
  baseRevision: string;
  currentRevision: string;
  stale: boolean;
  /** Why the proposal is stale. Empty when it can still be accepted. */
  conflicts?: CanvasProposalConflict[];
  before: CanvasDocument;
  after: CanvasDocument;
  changes: CanvasProposalChange[];
};

const annotationKeys = [
  "id",
  "kind",
  "markdown",
  "label",
  "x",
  "y",
  "width",
  "height",
  "color",
  "fontSize",
];
const appearances = [
  "standard",
  "quiet",
  "highlighted",
  "slate",
  "blue",
  "teal",
  "amber",
  "rose",
  "violet",
];
const operationKeys: Record<CanvasProposalOperation["op"], string[]> = {
  set_table_markdown: ["op", "tableId", "markdown"],
  move_table: ["op", "tableId", "x", "y"],
  set_table_appearance: ["op", "tableId", "appearance"],
  update_edge: ["op", "edgeId", "changes"],
  add_annotation: ["op", "annotation"],
  update_annotation: ["op", "annotationId", "changes"],
  delete_annotation: ["op", "annotationId"],
};
export function parseCanvasProposalInput(
  candidate: unknown,
): CanvasProposalInput {
  assertRecord(candidate, "Proposal must be an object.");
  canvasKeys(
    candidate,
    ["baseRevision", "title", "reason", "operations"],
    "Proposal",
  );
  canvasText(candidate.baseRevision, "Base revision", 200);
  canvasText(candidate.title, "Proposal title", 200);
  canvasText(candidate.reason, "Proposal reason", 5000);
  if (
    !Array.isArray(candidate.operations) ||
    candidate.operations.length < 1 ||
    candidate.operations.length > 50
  )
    throw new Error("A proposal needs from 1 to 50 operations.");
  for (const operation of candidate.operations) {
    assertRecord(operation, "Operation must be an object.");
    if (
      typeof operation.op !== "string" ||
      !Object.hasOwn(operationKeys, operation.op)
    )
      throw new Error("Unsupported proposal operation.");
    canvasKeys(
      operation,
      operationKeys[operation.op as CanvasProposalOperation["op"]]!,
      "Operation",
    );
    for (const key of ["tableId", "annotationId", "edgeId"])
      if (operation[key] !== undefined) canvasText(operation[key], key, 500);
    if (
      ["set_table_markdown", "move_table", "set_table_appearance"].includes(
        operation.op,
      )
    )
      canvasText(operation.tableId, "Table id", 500);
    if (["update_annotation", "delete_annotation"].includes(operation.op))
      canvasText(operation.annotationId, "Annotation id", 500);
    if (operation.op === "set_table_markdown")
      canvasText(operation.markdown, "Table Markdown", 4000, true);
    if (operation.op === "move_table") {
      finiteNumber(operation.x, "Move needs x.");
      finiteNumber(operation.y, "Move needs y.");
    }
    if (
      operation.op === "set_table_appearance" &&
      !appearances.includes(operation.appearance as string)
    )
      throw new Error("Invalid table appearance.");
    if (operation.op === "update_edge") {
      canvasText(operation.edgeId, "Edge id", 500);
      assertRecord(operation.changes, "Edge changes must be an object.");
      canvasKeys(
        operation.changes,
        ["hidden", "muted", "route"],
        "Edge changes",
      );
      if (
        operation.changes.hidden !== undefined &&
        typeof operation.changes.hidden !== "boolean"
      )
        throw new Error("hidden must be boolean.");
      if (
        operation.changes.muted !== undefined &&
        typeof operation.changes.muted !== "boolean" &&
        operation.changes.muted !== "automatic"
      )
        throw new Error("muted must be boolean or automatic.");
      if (
        operation.changes.route !== undefined &&
        !["straight", "smoothstep"].includes(operation.changes.route as string)
      )
        throw new Error("Invalid edge route.");
    }
    if (
      operation.op === "add_annotation" ||
      operation.op === "update_annotation"
    ) {
      const content =
        operation.op === "add_annotation"
          ? operation.annotation
          : operation.changes;
      assertRecord(content, "Annotation properties must be an object.");
      canvasKeys(
        content,
        operation.op === "add_annotation"
          ? annotationKeys
          : annotationKeys.filter((k) => k !== "id" && k !== "kind"),
        "Annotation",
      );
      if (
        operation.op === "add_annotation" &&
        !["note", "text", "frame"].includes(content.kind as string)
      )
        throw new Error("Agent proposals may add notes, text, or frames.");
      if (operation.op === "add_annotation")
        canvasText(content.id, "Annotation id", 200);
      for (const key of ["x", "y", "width", "height", "fontSize"])
        if (content[key] !== undefined)
          finiteNumber(content[key], `${key} must be finite.`);
      if (content.markdown !== undefined)
        canvasText(content.markdown, "Annotation Markdown", 5000, true);
      if (content.label !== undefined)
        canvasText(content.label, "Annotation label", 120);
      if (
        content.color !== undefined &&
        !["slate", "blue", "emerald", "amber"].includes(content.color as string)
      )
        throw new Error("Invalid annotation color.");
    }
  }
  return JSON.parse(canonicalCanvasJson(candidate)) as CanvasProposalInput;
}

export function previewCanvasProposal(
  candidate: CanvasDocument,
  input: CanvasProposalInput,
): { document: CanvasDocument; changes: CanvasProposalChange[] } {
  let document = parseCanvasDocument(candidate);
  const proposal = parseCanvasProposalInput({
    baseRevision: input.baseRevision,
    title: input.title,
    reason: input.reason,
    operations: input.operations,
  });
  const changes: CanvasProposalChange[] = [];
  for (const [index, operation] of proposal.operations.entries()) {
    let before: unknown = null;
    let after: unknown = null;
    let objectId: string;
    if ("tableId" in operation) {
      objectId = operation.tableId;
      if (!document.graph.tables.some((t) => t.id === objectId))
        throw new Error(`Unknown table "${objectId}".`);
      const entry = Object.hasOwn(document.layout, objectId)
        ? document.layout[objectId]
        : undefined;
      if (!entry && operation.op !== "move_table")
        throw new Error(
          `Position table "${objectId}" before editing its documentation.`,
        );
      before = entry ?? null;
      const next = { ...(entry ?? { x: 0, y: 0 }) };
      if (operation.op === "move_table") {
        next.x = operation.x;
        next.y = operation.y;
      }
      if (operation.op === "set_table_markdown")
        next.markdown = operation.markdown;
      if (operation.op === "set_table_appearance")
        next.appearance = operation.appearance;
      document = {
        ...document,
        layout: { ...document.layout, [objectId]: next },
      };
      after = next;
    } else if (operation.op === "update_edge") {
      objectId = operation.edgeId;
      const edge = document.graph.edges.find((e) => e.id === objectId);
      if (!edge) throw new Error(`Unknown edge "${objectId}".`);
      before = getSchemaEdgeLayout(document.layout, edge) ?? null;
      const next: SchemaEdgeLayout = { ...(before ?? {}) };
      if (operation.changes.hidden !== undefined)
        next.hidden = operation.changes.hidden;
      if (operation.changes.route !== undefined)
        next.route = operation.changes.route;
      if (operation.changes.muted === "automatic") delete next.muted;
      else if (operation.changes.muted !== undefined)
        next.muted = operation.changes.muted;
      if (!Object.hasOwn(document.layout, edge.source))
        throw new Error("Position the source table before editing an edge.");
      document = {
        ...document,
        layout: setSchemaEdgeLayout(document.layout, edge, next),
      };
      after = getSchemaEdgeLayout(document.layout, edge)!;
    } else if (operation.op === "add_annotation") {
      objectId = `annotation:${operation.annotation.id}`;
      if (document.annotations.some((a) => a.id === operation.annotation.id))
        throw new Error("Annotation id already exists.");
      after = operation.annotation;
      document = {
        ...document,
        annotations: [...document.annotations, operation.annotation],
      };
    } else {
      objectId = `annotation:${operation.annotationId}`;
      const existing = document.annotations.find(
        (a) => a.id === operation.annotationId,
      );
      if (!existing)
        throw new Error(`Unknown annotation "${operation.annotationId}".`);
      before = existing;
      after =
        operation.op === "delete_annotation"
          ? null
          : { ...existing, ...operation.changes };
      document = {
        ...document,
        annotations:
          operation.op === "delete_annotation"
            ? document.annotations.filter((a) => a.id !== existing.id)
            : document.annotations.map((a) =>
                a.id === existing.id ? (after as SchemaAnnotation) : a,
              ),
      };
    }
    changes.push({
      index,
      operation: operation.op,
      objectId,
      before: structuredClone(before),
      after: structuredClone(after),
    });
  }
  document = parseCanvasDocument(document);
  if (canonicalCanvasJson(document) === canonicalCanvasJson(candidate))
    throw new Error("The proposal does not change the document.");
  return { document, changes };
}

/**
 * Lines that differ only in how an editor serializes the same Markdown (escaped
 * punctuation, HTML entities, trailing spaces, bullet characters) compare equal.
 * A rich-text save rewrites every line this way; that is not a human edit.
 */
function markdownLineKey(line: string): string {
  return line
    .replace(/\s+$/, "")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\\([\\`*_{}[\]()#+\-.!>~|<])/g, "$1")
    .replace(/^(\s*)[*+](\s)/, "$1-$2");
}

function lineMatches(base: string[], other: string[]): Int32Array | null {
  const matches = new Int32Array(base.length).fill(-1);
  let prefix = 0;
  while (
    prefix < base.length &&
    prefix < other.length &&
    base[prefix] === other[prefix]
  )
    matches[prefix] = prefix++;
  let suffix = 0;
  while (
    suffix < base.length - prefix &&
    suffix < other.length - prefix &&
    base[base.length - 1 - suffix] === other[other.length - 1 - suffix]
  ) {
    matches[base.length - 1 - suffix] = other.length - 1 - suffix;
    suffix++;
  }
  const a = base.slice(prefix, base.length - suffix);
  const b = other.slice(prefix, other.length - suffix);
  if (a.length * b.length > 250_000) return null;
  const width = b.length + 1;
  const lengths = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lengths[i * width + j] =
        a[i] === b[j]
          ? lengths[(i + 1) * width + j + 1]! + 1
          : Math.max(
              lengths[(i + 1) * width + j]!,
              lengths[i * width + j + 1]!,
            );
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) matches[prefix + i++] = prefix + j++;
    else if (lengths[(i + 1) * width + j]! >= lengths[i * width + j + 1]!) i++;
    else j++;
  }
  return matches;
}

/** Base lines [start, end) replaced by `lines` on one side. Empty range = insertion. */
type Hunk = { start: number; end: number; lines: string[]; keys: string[] };

function hunks(
  baseLength: number,
  side: string[],
  keys: string[],
  matches: Int32Array,
): Hunk[] {
  const result: Hunk[] = [];
  let i = 0,
    j = 0;
  while (i < baseLength || j < side.length) {
    if (i < baseLength && matches[i] === j) {
      i++;
      j++;
      continue;
    }
    const start = i;
    while (i < baseLength && matches[i] === -1) i++;
    const next = i < baseLength ? matches[i]! : side.length;
    result.push({
      start,
      end: i,
      lines: side.slice(j, next),
      keys: keys.slice(j, next),
    });
    j = next;
  }
  return result;
}

/**
 * Three-way merge of Markdown by line hunks. Edits of different lines combine,
 * even on neighbouring lines, and insertions at the same place keep both (the
 * live text first). Returns null when both sides changed the same line
 * differently; the caller must then treat the edit as a conflict. The result
 * keeps the live text's form of every line the proposal did not change.
 */
export function mergeCanvasText(
  base: string,
  ours: string,
  theirs: string,
): string | null {
  if (ours === theirs || theirs === base) return ours;
  if (ours === base) return theirs;
  // Two texts written from nothing share no lines to anchor a merge on.
  if (!base.trim()) return null;
  const o = base.split("\n");
  const a = ours.split("\n");
  const b = theirs.split("\n");
  const ok = o.map(markdownLineKey);
  const ak = a.map(markdownLineKey);
  const bk = b.map(markdownLineKey);
  const ma = lineMatches(ok, ak);
  const mb = lineMatches(ok, bk);
  if (!ma || !mb) return null;
  const same = (x: Hunk, y: Hunk) =>
    x.start === y.start &&
    x.end === y.end &&
    x.keys.length === y.keys.length &&
    x.keys.every((key, index) => key === y.keys[index]);
  // Live-text hunks sort before the proposal's at the same place.
  const all = [
    ...hunks(o.length, b, bk, mb).map((hunk) => ({ ...hunk, order: 0 })),
    ...hunks(o.length, a, ak, ma).map((hunk) => ({ ...hunk, order: 1 })),
  ].sort(
    (x, y) =>
      x.start - y.start ||
      Number(x.end > x.start) - Number(y.end > y.start) ||
      x.order - y.order,
  );
  const out: string[] = [];
  let position = 0;
  let previous: Hunk | undefined;
  for (const hunk of all) {
    const insertion = hunk.start === hunk.end;
    if (hunk.start < position) {
      if (previous && same(previous, hunk)) continue;
      return null;
    }
    if (insertion && previous && same(previous, hunk)) continue;
    for (let k = position; k < hunk.start; k++) out.push(b[mb[k]!]!);
    out.push(...hunk.lines);
    position = hunk.end;
    previous = hunk;
  }
  for (let k = position; k < o.length; k++) out.push(b[mb[k]!]!);
  return out.join("\n");
}

/**
 * What a pending proposal needs of its base document: the earlier value of
 * every object it writes (null when the object did not exist). Replaces the
 * full baseline document, which made each pending proposal as large as the
 * whole canvas.
 */
export type CanvasProposalBase = {
  /** Table layout entries, including the source tables of edited arrows. */
  layout: Record<string, SchemaTableLayout | null>;
  edges: Record<string, SchemaEdge | null>;
  annotations: Record<string, SchemaAnnotation | null>;
};

export function canvasProposalBase(
  document: CanvasDocument,
  operations: readonly CanvasProposalOperation[],
): CanvasProposalBase {
  const base: CanvasProposalBase = { layout: {}, edges: {}, annotations: {} };
  const table = (id: string) => {
    base.layout[id] = Object.hasOwn(document.layout, id)
      ? structuredClone(document.layout[id]!)
      : null;
  };
  for (const operation of operations) {
    if ("tableId" in operation) table(operation.tableId);
    else if (operation.op === "update_edge") {
      const edge = document.graph.edges.find((e) => e.id === operation.edgeId);
      base.edges[operation.edgeId] = edge ? structuredClone(edge) : null;
      if (edge) table(edge.source);
    } else {
      const id =
        operation.op === "add_annotation"
          ? operation.annotation.id
          : operation.annotationId;
      const annotation = document.annotations.find((a) => a.id === id);
      base.annotations[id] = annotation ? structuredClone(annotation) : null;
    }
  }
  return base;
}

export function parseCanvasProposalBase(
  candidate: unknown,
): CanvasProposalBase {
  assertRecord(candidate, "Proposal base must be an object.");
  canvasKeys(candidate, ["layout", "edges", "annotations"], "Proposal base");
  const { layout, edges, annotations } = candidate;
  assertRecord(layout, "Proposal base layout must be an object.");
  assertRecord(edges, "Proposal base edges must be an object.");
  assertRecord(annotations, "Proposal base annotations must be an object.");
  for (const [id, entry] of Object.entries(layout)) {
    canvasText(id, "Table id", 500);
    if (entry === null) continue;
    assertRecord(entry, "Invalid base table layout.");
    finiteNumber(entry.x, "Base table layout needs x.");
    finiteNumber(entry.y, "Base table layout needs y.");
    if (entry.markdown !== undefined)
      canvasText(entry.markdown, "Table Markdown", 4000, true);
  }
  for (const [id, edge] of Object.entries(edges)) {
    canvasText(id, "Edge id", 500);
    if (edge === null) continue;
    assertRecord(edge, "Invalid base edge.");
    for (const key of ["id", "source", "target", "field"])
      canvasText(edge[key], `Edge ${key}`, 1000);
  }
  for (const [id, annotation] of Object.entries(annotations)) {
    canvasText(id, "Annotation id", 500);
    if (annotation === null) continue;
    const [parsed] = parseSchemaAnnotations([annotation], { gridSize: 1 });
    if (parsed?.id !== id) throw new Error("Invalid base annotation.");
  }
  return JSON.parse(canonicalCanvasJson(candidate)) as CanvasProposalBase;
}

/** The current document with every object the proposal writes put back as it was at its base. */
export function applyCanvasProposalBase(
  current: CanvasDocument,
  base: CanvasProposalBase,
): CanvasDocument {
  const layout = { ...current.layout };
  for (const [id, entry] of Object.entries(base.layout))
    if (entry) layout[id] = structuredClone(entry);
    else delete layout[id];
  let annotations = [...current.annotations];
  for (const [id, annotation] of Object.entries(base.annotations)) {
    const index = annotations.findIndex((a) => a.id === id);
    if (!annotation) annotations = annotations.filter((a) => a.id !== id);
    else if (index === -1) annotations.push(structuredClone(annotation));
    else annotations[index] = structuredClone(annotation);
  }
  return { ...current, layout, annotations };
}

/**
 * The part of a document a review needs: the tables, arrows and annotations a
 * change touches, the arrows leaving those tables and their targets. Keeps
 * review payloads small on large canvases.
 */
export function focusCanvasDocument(
  document: CanvasDocument,
  objectIds: Iterable<string>,
): CanvasDocument {
  const tableIds = new Set<string>();
  const annotationIds = new Set<string>();
  for (const id of objectIds) {
    if (id.startsWith("annotation:"))
      annotationIds.add(id.slice("annotation:".length));
    else {
      const edge = document.graph.edges.find((e) => e.id === id);
      if (edge) tableIds.add(edge.source).add(edge.target);
      else tableIds.add(id);
    }
  }
  const edges = document.graph.edges.filter((edge) =>
    tableIds.has(edge.source),
  );
  const included = new Set(tableIds);
  for (const edge of edges) included.add(edge.target);
  const layout: SchemaLayout = {};
  for (const id of tableIds)
    if (Object.hasOwn(document.layout, id)) layout[id] = document.layout[id]!;
  return structuredClone({
    graph: {
      tables: document.graph.tables.filter((table) => included.has(table.id)),
      edges,
      warnings: [],
    },
    layout,
    annotations: document.annotations.filter((a) => annotationIds.has(a.id)),
  });
}

export type CanvasProposalRebase = {
  /** Operations to apply to the current document. Merged Markdown is already resolved. */
  operations: CanvasProposalOperation[];
  conflicts: CanvasProposalConflict[];
  /** Operation indexes whose Markdown was merged with intervening edits. */
  merged: number[];
};

type RebaseBase = {
  layout: SchemaLayout;
  graph: { edges: SchemaEdge[] };
  annotations: SchemaAnnotation[];
};
function rebaseBase(base: CanvasDocument | CanvasProposalBase): RebaseBase {
  if ("graph" in base) return base;
  const layout: SchemaLayout = {};
  for (const [id, entry] of Object.entries(base.layout))
    if (entry) layout[id] = entry;
  return {
    layout,
    graph: {
      edges: Object.values(base.edges).filter(
        (edge): edge is SchemaEdge => edge !== null,
      ),
    },
    annotations: Object.values(base.annotations).filter(
      (annotation): annotation is SchemaAnnotation => annotation !== null,
    ),
  };
}

/**
 * Field-level preconditions: an operation conflicts only when the field it writes
 * changed since the proposal's base (or its target disappeared). Edits elsewhere on
 * the board, moves of a documented table, and unrelated graph changes never block.
 * Markdown edited on both sides is merged by line when the edits do not overlap.
 */
export function rebaseCanvasProposal(
  baseline: CanvasDocument | CanvasProposalBase,
  current: CanvasDocument,
  operations: readonly CanvasProposalOperation[],
): CanvasProposalRebase {
  const base = rebaseBase(baseline);
  const equal = (a: unknown, b: unknown) =>
    canonicalCanvasJson(a ?? null) === canonicalCanvasJson(b ?? null);
  const conflicts: CanvasProposalConflict[] = [];
  const merged: number[] = [];
  const added = new Set<string>();
  const rebased = operations.map((operation, index) => {
    const conflict = (objectId: string, field: string) => {
      conflicts.push({ index, objectId, field });
      return operation;
    };
    if ("tableId" in operation) {
      const id = operation.tableId;
      if (!current.graph.tables.some((table) => table.id === id))
        return conflict(id, "table");
      const before = Object.hasOwn(base.layout, id) ? base.layout[id] : null;
      const now = Object.hasOwn(current.layout, id) ? current.layout[id] : null;
      if (operation.op !== "move_table" && !now)
        return conflict(id, "position");
      if (operation.op === "move_table")
        return equal(before?.x, now?.x) && equal(before?.y, now?.y)
          ? operation
          : conflict(id, "position");
      if (operation.op === "set_table_appearance")
        return equal(before?.appearance, now?.appearance)
          ? operation
          : conflict(id, "appearance");
      const ours = now?.markdown ?? "";
      if (equal(before?.markdown, now?.markdown)) return operation;
      const markdown = mergeCanvasText(
        before?.markdown ?? "",
        operation.markdown,
        ours,
      );
      if (markdown === null) return conflict(id, "markdown");
      if (markdown !== operation.markdown) merged.push(index);
      return { ...operation, markdown };
    }
    if (operation.op === "update_edge") {
      const id = operation.edgeId;
      const edge = current.graph.edges.find((candidate) => candidate.id === id);
      const baseEdge = base.graph.edges.find(
        (candidate) => candidate.id === id,
      );
      if (!edge || !baseEdge) return conflict(id, "edge");
      const before = getSchemaEdgeLayout(base.layout, baseEdge) ?? {};
      const now = getSchemaEdgeLayout(current.layout, edge) ?? {};
      for (const key of Object.keys(operation.changes) as Array<
        keyof typeof operation.changes
      >)
        if (!equal(before[key], now[key])) return conflict(id, key);
      return operation;
    }
    if (operation.op === "add_annotation") {
      const id = operation.annotation.id;
      added.add(id);
      return current.annotations.some((annotation) => annotation.id === id)
        ? conflict(`annotation:${id}`, "id")
        : operation;
    }
    const id = operation.annotationId;
    const objectId = `annotation:${id}`;
    if (added.has(id)) return operation;
    const before = base.annotations.find((annotation) => annotation.id === id);
    const now = current.annotations.find((annotation) => annotation.id === id);
    if (!now) return conflict(objectId, "annotation");
    if (operation.op === "delete_annotation")
      return equal(before, now) ? operation : conflict(objectId, "annotation");
    let changes = operation.changes;
    for (const key of Object.keys(changes) as Array<keyof typeof changes>) {
      const was = before?.[key];
      const is = now[key];
      if (equal(was, is)) continue;
      if (key !== "markdown") return conflict(objectId, key);
      const markdown = mergeCanvasText(
        typeof was === "string" ? was : "",
        changes.markdown!,
        typeof is === "string" ? is : "",
      );
      if (markdown === null) return conflict(objectId, key);
      if (markdown !== changes.markdown) merged.push(index);
      changes = { ...changes, markdown };
    }
    return changes === operation.changes
      ? operation
      : { ...operation, changes };
  });
  return { operations: rebased, conflicts, merged };
}
