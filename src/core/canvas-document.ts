import { parseSchemaAnnotations } from "./annotations.js";
import { validateSchemaGraph, validateSchemaViews } from "./graph.js";
import { parseSchemaLayout } from "./layout.js";
import { assertRecord, finiteNumber } from "./shared.js";
import type {
  SchemaAnnotation,
  SchemaGraph,
  SchemaLayout,
  SchemaView,
} from "./types.js";

export type CanvasDocument = {
  graph: SchemaGraph;
  layout: SchemaLayout;
  annotations: SchemaAnnotation[];
  views?: SchemaView[];
};

export type CanvasBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type CanvasGeometry = Record<string, CanvasBounds>;
export type CanvasSnapshot = { revision: string; document: CanvasDocument };

/** Canonical JSON is used for revision and proposal digests; array order is retained. */
export function canonicalCanvasJson(value: unknown): string {
  const seen = new Set<object>();
  function serialize(item: unknown): string {
    if (item === null || typeof item === "string" || typeof item === "boolean")
      return JSON.stringify(item);
    if (typeof item === "number" && Number.isFinite(item))
      return JSON.stringify(item);
    if (typeof item !== "object" || item === null || seen.has(item))
      throw new Error("Canvas data must be finite, acyclic JSON.");
    if (
      !Array.isArray(item) &&
      Object.getPrototypeOf(item) !== Object.prototype &&
      Object.getPrototypeOf(item) !== null
    )
      throw new Error("Canvas data must contain plain JSON objects.");
    seen.add(item);
    const result = Array.isArray(item)
      ? `[${item.map(serialize).join(",")}]`
      : `{${Object.keys(item)
          .sort()
          .map(
            (key) =>
              `${JSON.stringify(key)}:${serialize((item as Record<string, unknown>)[key])}`,
          )
          .join(",")}}`;
    seen.delete(item);
    return result;
  }
  return serialize(value);
}

export async function canvasDigest(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle)
    throw new Error(
      "Canvas context requires Web Crypto. Use HTTPS or localhost.",
    );
  const bytes = new TextEncoder().encode(canonicalCanvasJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function canvasText(
  value: unknown,
  name: string,
  max = 5000,
  empty = false,
): string {
  if (
    typeof value !== "string" ||
    (!empty && !value.trim()) ||
    value.length > max
  )
    throw new Error(
      `${name} must be ${empty ? "a" : "a nonempty"} string of at most ${max} characters.`,
    );
  return value;
}

export function canvasKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  name: string,
) {
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      throw new Error(`${name} contains unsupported property "${key}".`);
}

export function parseCanvasBounds(value: unknown): CanvasBounds {
  assertRecord(value, "Canvas bounds must be an object.");
  canvasKeys(value, ["x", "y", "width", "height"], "Canvas bounds");
  const bounds = {
    x: finiteNumber(value.x, "Bounds need x."),
    y: finiteNumber(value.y, "Bounds need y."),
    width: finiteNumber(value.width, "Bounds need width."),
    height: finiteNumber(value.height, "Bounds need height."),
  };
  if (
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    Object.values(bounds).some((n) => Math.abs(n) > 1e7)
  )
    throw new Error(
      "Canvas bounds must have positive dimensions and finite coordinates within 10 million units.",
    );
  return bounds;
}

/** Validate without snapping, truncating, or rewriting checked-in documentation. */
export function parseCanvasDocument(candidate: unknown): CanvasDocument {
  const value: unknown = JSON.parse(canonicalCanvasJson(candidate));
  assertRecord(value, "Canvas document must be an object.");
  canvasKeys(
    value,
    ["graph", "layout", "annotations", "views"],
    "Canvas document",
  );
  assertRecord(value.graph, "Canvas document needs a graph.");
  const graph = value.graph;
  if (
    !Array.isArray(graph.tables) ||
    !Array.isArray(graph.edges) ||
    !Array.isArray(graph.warnings)
  )
    throw new Error("Canvas graph needs tables, edges, and warnings arrays.");
  for (const table of graph.tables) {
    assertRecord(table, "Invalid schema table.");
    canvasText(table.id, "Table id", 500);
    canvasText(table.label, "Table label", 1000);
    if (!Array.isArray(table.fields))
      throw new Error("Table fields must be an array.");
    const checkFields = (fields: unknown[]) => {
      for (const field of fields) {
        assertRecord(field, "Invalid schema field.");
        canvasText(field.name, "Field name", 500);
        canvasText(field.type, "Field type", 10000);
        if (
          typeof field.optional !== "boolean" ||
          !Array.isArray(field.foreignKeyTargets) ||
          !field.foreignKeyTargets.every((id) => typeof id === "string")
        )
          throw new Error("Invalid schema field properties.");
        if (field.discriminatedUnion !== undefined) {
          assertRecord(
            field.discriminatedUnion,
            "Invalid discriminated union.",
          );
          canvasText(
            field.discriminatedUnion.discriminator,
            "Union discriminator",
            500,
          );
          if (!Array.isArray(field.discriminatedUnion.variants))
            throw new Error("Union variants must be an array.");
          for (const variant of field.discriminatedUnion.variants) {
            assertRecord(variant, "Invalid union variant.");
            canvasText(variant.discriminatorValue, "Union value", 500);
            if (!Array.isArray(variant.fields))
              throw new Error("Union fields must be an array.");
            checkFields(variant.fields);
          }
        }
      }
    };
    checkFields(table.fields);
  }
  for (const edge of graph.edges) {
    assertRecord(edge, "Invalid schema edge.");
    for (const key of ["id", "source", "target", "field"])
      canvasText(edge[key], `Edge ${key}`, 1000);
    if (typeof edge.optional !== "boolean")
      throw new Error("Edge optional must be boolean.");
  }
  if (!graph.warnings.every((warning) => typeof warning === "string"))
    throw new Error("Graph warnings must be strings.");
  const typedGraph = validateSchemaGraph(graph as unknown as SchemaGraph);
  parseSchemaLayout(value.layout, typedGraph, { gridSize: 1 });
  assertRecord(value.layout, "Canvas layout must be an object.");
  for (const entry of Object.values(value.layout)) {
    assertRecord(entry, "Invalid table layout.");
    parseCanvasBounds({ x: entry.x, y: entry.y, width: 1, height: 1 });
  }
  if (!Array.isArray(value.annotations))
    throw new Error("Canvas annotations must be an array.");
  parseSchemaAnnotations(value.annotations, { gridSize: 1 });
  for (const annotation of value.annotations) {
    assertRecord(annotation, "Invalid annotation.");
    parseCanvasBounds({
      x: annotation.x,
      y: annotation.y,
      width: annotation.width,
      height: annotation.height,
    });
    if (
      typeof annotation.markdown === "string" &&
      annotation.markdown.length > 5000
    )
      throw new Error("Annotation Markdown exceeds 5000 characters.");
  }
  if (value.views !== undefined) {
    if (!Array.isArray(value.views))
      throw new Error("Canvas views must be an array.");
    for (const view of value.views) {
      assertRecord(view, "Invalid canvas view.");
      canvasText(view.id, "View id", 500);
      canvasText(view.label, "View label", 1000);
      if (!Array.isArray(view.tableIds) || !Array.isArray(view.edgeIds))
        throw new Error("View ids must be arrays.");
    }
    validateSchemaViews(value.views as SchemaView[], typedGraph);
  }
  return value as unknown as CanvasDocument;
}

export async function canvasSnapshot(
  candidate: unknown,
): Promise<CanvasSnapshot> {
  const document = parseCanvasDocument(candidate);
  return { revision: await canvasDigest(document), document };
}
