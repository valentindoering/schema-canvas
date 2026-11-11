const text = { type: "string", minLength: 1, maxLength: 500 };
const number = { type: "number" };
const boolean = { type: "boolean" };
const markdown = { type: "string", maxLength: 5000 };
const bounds = {
  type: "object",
  properties: {
    x: number,
    y: number,
    width: { type: "number", exclusiveMinimum: 0 },
    height: { type: "number", exclusiveMinimum: 0 },
  },
  required: ["x", "y", "width", "height"],
  additionalProperties: false,
};
const annotationProperties = {
  markdown,
  label: { type: "string", minLength: 1, maxLength: 120 },
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  color: { type: "string", enum: ["slate", "blue", "emerald", "amber"] },
};
function operation(
  name: string,
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) {
  return {
    type: "object",
    properties: { op: { const: name }, ...properties },
    required: ["op", ...required],
    additionalProperties: false,
  };
}
export const canvasContextQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    table: { ...text, description: "Exact table id or unambiguous label." },
    hops: { type: "integer", minimum: 0, maximum: 3, default: 1 },
    view: text,
    frame: text,
    tableIds: { type: "array", items: text, maxItems: 200 },
    annotationIds: { type: "array", items: text, maxItems: 200 },
    bounds,
    maxTables: { type: "integer", minimum: 1, maximum: 500, default: 100 },
    maxAnnotations: { type: "integer", minimum: 1, maximum: 500, default: 100 },
    includeImage: {
      type: "boolean",
      default: false,
      description: "Include a bounded PNG schematic of the same snapshot.",
    },
  },
};
export const canvasProposalInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["baseRevision", "title", "reason", "operations"],
  properties: {
    baseRevision: {
      ...text,
      description:
        "Document revision from get_canvas_context. Required; stale proposals are refused.",
    },
    title: {
      type: "string",
      minLength: 1,
      maxLength: 200,
      description:
        "Name the one table or note this changes, using its real table name.",
    },
    reason: { type: "string", minLength: 1, maxLength: 5000 },
    operations: {
      type: "array",
      description:
        "Usually one operation. Several only when they change the same table note or annotation together (e.g. its text and its position).",
      minItems: 1,
      maxItems: 50,
      items: {
        oneOf: [
          operation("set_table_markdown", {
            tableId: text,
            markdown: { ...markdown, maxLength: 4000 },
          }),
          operation("move_table", { tableId: text, x: number, y: number }),
          operation("set_table_appearance", {
            tableId: text,
            appearance: {
              type: "string",
              enum: [
                "standard",
                "quiet",
                "highlighted",
                "slate",
                "blue",
                "teal",
                "amber",
                "rose",
                "violet",
              ],
            },
          }),
          operation("update_edge", {
            edgeId: text,
            changes: {
              type: "object",
              minProperties: 1,
              additionalProperties: false,
              properties: {
                hidden: boolean,
                muted: { oneOf: [boolean, { const: "automatic" }] },
                route: { type: "string", enum: ["straight", "smoothstep"] },
              },
            },
          }),
          operation("add_annotation", {
            annotation: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: text,
                kind: { type: "string", enum: ["note", "text", "frame"] },
                ...annotationProperties,
              },
              required: ["id", "kind", "x", "y", "width", "height", "color"],
            },
          }),
          operation("update_annotation", {
            annotationId: text,
            changes: {
              type: "object",
              additionalProperties: false,
              minProperties: 1,
              properties: annotationProperties,
            },
          }),
          operation("delete_annotation", { annotationId: text }),
        ],
      },
    },
  },
};
export const canvasSearchSchema = {
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: text,
    limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
  },
};
export const canvasProposalStatusSchema = {
  type: "object",
  additionalProperties: false,
  required: ["proposalId"],
  properties: { proposalId: text },
};
export const canvasProposalListSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: {
      type: "string",
      enum: ["pending", "accepted", "rejected", "withdrawn"],
      description: "Only proposals with this status. Omit for all of yours.",
    },
  },
};
