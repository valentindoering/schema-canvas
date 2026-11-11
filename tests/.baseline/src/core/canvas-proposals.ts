import {
  canvasKeys,
  canvasText,
  canonicalCanvasJson,
  parseCanvasDocument,
  type CanvasDocument,
} from "./canvas-document.js";
import { getSchemaEdgeLayout, setSchemaEdgeLayout } from "./layout.js";
import { assertRecord, finiteNumber } from "./shared.js";
import type {
  SchemaAnnotation,
  SchemaEdgeLayout,
  SchemaTableAppearance,
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

/**
 * Line-based three-way merge. Returns null when both sides changed the same or
 * adjacent lines differently; the caller must then treat the edit as a conflict.
 */
export function mergeCanvasText(
  base: string,
  ours: string,
  theirs: string,
): string | null {
  if (ours === theirs || theirs === base) return ours;
  if (ours === base) return theirs;
  const o = base.split("\n");
  const a = ours.split("\n");
  const b = theirs.split("\n");
  const ma = lineMatches(o, a);
  const mb = lineMatches(o, b);
  if (!ma || !mb) return null;
  const same = (x: string[], y: string[]) =>
    x.length === y.length && x.every((line, index) => line === y[index]);
  const out: string[] = [];
  const resolve = (oc: string[], ac: string[], bc: string[]) => {
    if (same(ac, oc)) out.push(...bc);
    else if (same(bc, oc) || same(ac, bc)) out.push(...ac);
    else return false;
    return true;
  };
  let i = 0,
    ia = 0,
    ib = 0;
  for (;;) {
    let k = 0;
    while (i + k < o.length && ma[i + k] === ia + k && mb[i + k] === ib + k)
      k++;
    if (k) {
      out.push(...o.slice(i, i + k));
      i += k;
      ia += k;
      ib += k;
      continue;
    }
    let next = i;
    while (next < o.length && (ma[next] === -1 || mb[next] === -1)) next++;
    if (next === o.length) {
      if (!resolve(o.slice(i), a.slice(ia), b.slice(ib))) return null;
      return out.join("\n");
    }
    const na = ma[next]!,
      nb = mb[next]!;
    if (!resolve(o.slice(i, next), a.slice(ia, na), b.slice(ib, nb)))
      return null;
    i = next;
    ia = na;
    ib = nb;
  }
}

export type CanvasProposalRebase = {
  /** Operations to apply to the current document. Merged Markdown is already resolved. */
  operations: CanvasProposalOperation[];
  conflicts: CanvasProposalConflict[];
  /** Operation indexes whose Markdown was merged with intervening edits. */
  merged: number[];
};

/**
 * Field-level preconditions: an operation conflicts only when the field it writes
 * changed since the proposal's base (or its target disappeared). Edits elsewhere on
 * the board, moves of a documented table, and unrelated graph changes never block.
 * Markdown edited on both sides is merged line by line when the edits do not overlap.
 */
export function rebaseCanvasProposal(
  base: CanvasDocument,
  current: CanvasDocument,
  operations: readonly CanvasProposalOperation[],
): CanvasProposalRebase {
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
