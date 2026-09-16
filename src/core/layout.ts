import {
  assertRecord,
  finiteNumber,
  isRecord,
  snap,
  sortedRecord,
} from "./shared.js";
import type {
  LayoutValidationOptions,
  SchemaEdge,
  SchemaEdgeLayout,
  SchemaGraph,
  SchemaLayout,
  SchemaPortSide,
  SchemaTable,
  SchemaTableLayout,
} from "./types.js";

const portSides = new Set<SchemaPortSide>([
  "top",
  "right",
  "bottom",
  "left",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
]);
const appearances = new Set(["standard", "quiet", "highlighted"]);
const fieldDisplays = new Set(["all", "concise"]);
const routes = new Set(["straight", "smoothstep"]);
const styles = new Set(["solid", "dashed", "dotted"]);
const directions = new Set(["left", "right", "up", "down"]);

export function canonicalEdgeKey(edge: Pick<SchemaEdge, "field" | "target">) {
  return `${edge.field}->${edge.target}`;
}

export function compatibleEdgeKeys(
  edge: Pick<SchemaEdge, "id" | "field" | "target" | "sourceFields">,
) {
  return [
    canonicalEdgeKey(edge),
    ...(edge.sourceFields ?? []).map(
      (sourceField) => `${sourceField}->${edge.target}`,
    ),
    edge.id,
    edge.field,
  ];
}

export function getSchemaEdgeLayout(
  layout: SchemaLayout,
  edge: SchemaEdge,
): SchemaEdgeLayout | undefined {
  const foreignKeys = layout[edge.source]?.foreignKeys;
  if (!foreignKeys) return undefined;
  for (const key of compatibleEdgeKeys(edge)) {
    const candidate = foreignKeys[key];
    if (
      candidate &&
      (!candidate.targetTable || candidate.targetTable === edge.target)
    ) {
      return candidate;
    }
  }
  return undefined;
}

export function setSchemaEdgeLayout(
  layout: SchemaLayout,
  edge: SchemaEdge,
  value: SchemaEdgeLayout,
): SchemaLayout {
  const table = layout[edge.source] ?? { x: 0, y: 0 };
  const foreignKeys = { ...table.foreignKeys };
  for (const key of compatibleEdgeKeys(edge)) delete foreignKeys[key];
  foreignKeys[canonicalEdgeKey(edge)] = {
    ...value,
    targetTable: edge.target,
  };
  return {
    ...layout,
    [edge.source]: { ...table, foreignKeys: sortedRecord(foreignKeys) },
  };
}

export function parseSchemaLayout(
  candidate: unknown,
  graph: SchemaGraph,
  options: LayoutValidationOptions = {},
): SchemaLayout {
  assertRecord(candidate, "Schema layout must be an object.");
  const tableById = new Map(graph.tables.map((table) => [table.id, table]));
  const edgesBySource = new Map<string, SchemaEdge[]>();
  for (const edge of graph.edges) {
    const edges = edgesBySource.get(edge.source) ?? [];
    edges.push(edge);
    edgesBySource.set(edge.source, edges);
  }
  const gridSize = options.gridSize ?? 20;
  if (!Number.isFinite(gridSize) || gridSize <= 0) {
    throw new Error("Layout grid size must be a positive finite number.");
  }

  const result: SchemaLayout = {};
  for (const [tableId, raw] of Object.entries(candidate)) {
    const table = tableById.get(tableId);
    if (!table && !options.allowUnknownTables) {
      throw new Error(`Schema layout references unknown table \"${tableId}\".`);
    }
    assertRecord(raw, `Layout entry \"${tableId}\" must be an object.`);
    const entry: SchemaTableLayout = {
      x: snap(
        finiteNumber(raw.x, `Layout entry \"${tableId}\" needs a finite x.`),
        gridSize,
      ),
      y: snap(
        finiteNumber(raw.y, `Layout entry \"${tableId}\" needs a finite y.`),
        gridSize,
      ),
    };
    if (table) applyTableSettings(entry, raw, table, options);
    if (raw.foreignKeys !== undefined) {
      assertRecord(
        raw.foreignKeys,
        `Layout entry \"${tableId}\" foreignKeys must be an object.`,
      );
      entry.foreignKeys = parseForeignKeys(
        raw.foreignKeys,
        edgesBySource.get(tableId) ?? [],
        tableId,
      );
    }
    result[tableId] = entry;
  }
  return sortedRecord(result);
}

function applyTableSettings(
  entry: SchemaTableLayout,
  raw: Record<string, unknown>,
  table: SchemaTable,
  options: LayoutValidationOptions,
) {
  if (raw.appearance !== undefined) {
    if (
      typeof raw.appearance !== "string" ||
      !appearances.has(raw.appearance)
    ) {
      throw new Error(
        `Layout entry \"${table.id}\" has an invalid appearance.`,
      );
    }
    entry.appearance = raw.appearance as NonNullable<
      SchemaTableLayout["appearance"]
    >;
  }
  if (raw.fieldDisplay !== undefined) {
    if (
      typeof raw.fieldDisplay !== "string" ||
      !fieldDisplays.has(raw.fieldDisplay)
    ) {
      throw new Error(
        `Layout entry \"${table.id}\" has an invalid field display.`,
      );
    }
    entry.fieldDisplay = raw.fieldDisplay as NonNullable<
      SchemaTableLayout["fieldDisplay"]
    >;
  } else if (options.defaultFieldDisplay) {
    entry.fieldDisplay =
      typeof options.defaultFieldDisplay === "function"
        ? options.defaultFieldDisplay(table)
        : options.defaultFieldDisplay;
  }
  if (raw.highlightedFields !== undefined) {
    if (!Array.isArray(raw.highlightedFields)) {
      throw new Error(
        `Layout entry \"${table.id}\" highlightedFields must be an array.`,
      );
    }
    const known = new Set(table.fields.map((field) => field.name));
    const fields = raw.highlightedFields.map((field) => {
      if (typeof field !== "string" || !known.has(field)) {
        throw new Error(
          `Layout entry \"${table.id}\" highlights an unknown field.`,
        );
      }
      return field;
    });
    if (fields.length) entry.highlightedFields = [...new Set(fields)].sort();
  }
  for (const key of [
    "hideArrows",
    "hideIncomingArrows",
    "hideMutedIncomingArrows",
  ] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== "boolean") {
      throw new Error(`Layout entry \"${table.id}\" ${key} must be a boolean.`);
    }
    if (raw[key] === true) entry[key] = true;
  }
}

function parseForeignKeys(
  value: Record<string, unknown>,
  knownEdges: readonly SchemaEdge[],
  tableId: string,
) {
  const result: Record<string, SchemaEdgeLayout> = {};
  for (const [key, raw] of Object.entries(value)) {
    assertRecord(raw, `Edge layout \"${tableId}.${key}\" must be an object.`);
    const targetTable =
      typeof raw.targetTable === "string" ? raw.targetTable : undefined;
    const matching = knownEdges.find(
      (edge) =>
        compatibleEdgeKeys(edge).some((candidate) => candidate === key) &&
        (targetTable === undefined || edge.target === targetTable),
    );
    if (!matching) {
      throw new Error(
        `Edge layout \"${tableId}.${key}\" does not match an edge.`,
      );
    }
    const route: SchemaEdgeLayout = {};
    if (targetTable) route.targetTable = targetTable;
    if (raw.source !== undefined) {
      if (
        typeof raw.source !== "string" ||
        !portSides.has(raw.source as SchemaPortSide)
      ) {
        throw new Error(
          `Edge layout \"${tableId}.${key}\" has an invalid source port.`,
        );
      }
      route.source = raw.source as SchemaPortSide;
    }
    if (raw.target !== undefined) {
      if (
        typeof raw.target !== "string" ||
        !portSides.has(raw.target as SchemaPortSide)
      ) {
        throw new Error(
          `Edge layout \"${tableId}.${key}\" has an invalid target port.`,
        );
      }
      route.target = raw.target as SchemaPortSide;
    }
    if (raw.route !== undefined) {
      if (typeof raw.route !== "string" || !routes.has(raw.route)) {
        throw new Error(
          `Edge layout \"${tableId}.${key}\" has an invalid route.`,
        );
      }
      route.route = raw.route as NonNullable<SchemaEdgeLayout["route"]>;
    }
    for (const flag of ["hidden", "muted"] as const) {
      if (raw[flag] !== undefined && typeof raw[flag] !== "boolean") {
        throw new Error(
          `Edge layout \"${tableId}.${key}\" ${flag} must be a boolean.`,
        );
      }
      if (raw[flag] === true) route[flag] = true;
    }
    if (raw.style !== undefined) {
      if (typeof raw.style !== "string" || !styles.has(raw.style)) {
        throw new Error(
          `Edge layout \"${tableId}.${key}\" has an invalid style.`,
        );
      }
      route.style = raw.style as NonNullable<SchemaEdgeLayout["style"]>;
    }
    if (raw.shift !== undefined) {
      if (
        !isRecord(raw.shift) ||
        typeof raw.shift.direction !== "string" ||
        !directions.has(raw.shift.direction) ||
        typeof raw.shift.amount !== "number" ||
        !Number.isFinite(raw.shift.amount)
      ) {
        throw new Error(
          `Edge layout \"${tableId}.${key}\" has an invalid shift.`,
        );
      }
      route.shift = {
        direction: raw.shift.direction as NonNullable<
          SchemaEdgeLayout["shift"]
        >["direction"],
        amount: raw.shift.amount,
      };
    }
    result[key] = route;
  }
  return sortedRecord(result);
}

export function missingLayoutTableIds(
  graph: SchemaGraph,
  layout: SchemaLayout,
) {
  return graph.tables.map((table) => table.id).filter((id) => !layout[id]);
}
