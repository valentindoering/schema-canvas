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
  status: "pending" | "accepted" | "rejected";
  decision?: { reviewerId: string; at: string; revision: string };
};
export type CanvasProposalChange = {
  index: number;
  operation: CanvasProposalOperation["op"];
  objectId: string;
  before: unknown;
  after: unknown;
};
export type CanvasProposalReview = {
  proposal: CanvasProposal;
  reviewToken: string;
  baseRevision: string;
  currentRevision: string;
  stale: boolean;
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
