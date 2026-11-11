import { readFile } from "node:fs/promises";

import {
  missingLayoutTableIds,
  parseSchemaLayout,
  type LayoutValidationOptions,
  type SchemaGraph,
  type SchemaLayout,
} from "../../core/index.js";
import { createJsonStore, type JsonStore } from "../json-store/index.js";

export type LayoutCheckResult = {
  layout: SchemaLayout;
  missingTableIds: string[];
};

export function createLayoutStore(options: {
  filePath: string;
  graph: SchemaGraph;
  validation?: LayoutValidationOptions;
}): JsonStore<SchemaLayout> {
  return createJsonStore({
    filePath: options.filePath,
    parse: (candidate) =>
      parseSchemaLayout(candidate, options.graph, options.validation),
    missing: () => ({}),
  });
}

export function checkSchemaLayout(
  candidate: unknown,
  graph: SchemaGraph,
  options?: LayoutValidationOptions,
): LayoutCheckResult {
  const layout = parseSchemaLayout(candidate, graph, options);
  return { layout, missingTableIds: missingLayoutTableIds(graph, layout) };
}

export async function checkSchemaLayoutFile(
  filePath: string,
  graph: SchemaGraph,
  options?: LayoutValidationOptions,
) {
  let candidate: unknown;
  try {
    candidate = JSON.parse(await readFile(filePath, "utf8"));
  } catch (cause) {
    throw new Error(`Could not read a valid schema layout from ${filePath}.`, {
      cause,
    });
  }
  return checkSchemaLayout(candidate, graph, options);
}

export function addMissingLayoutEntries(
  graph: SchemaGraph,
  layout: SchemaLayout,
  options: { gridSize?: number; columns?: number } = {},
): SchemaLayout {
  const gridSize = options.gridSize ?? 20;
  const columns = options.columns ?? 4;
  const result = { ...layout };
  const occupied = Object.values(layout);
  let row = 0;
  let column = 0;
  for (const tableId of missingLayoutTableIds(graph, layout)) {
    while (
      occupied.some(
        (entry) =>
          entry.x === (column * 360 * gridSize) / 20 &&
          entry.y === (row * 280 * gridSize) / 20,
      )
    ) {
      column += 1;
      if (column >= columns) {
        column = 0;
        row += 1;
      }
    }
    result[tableId] = {
      x: (column * 360 * gridSize) / 20,
      y: (row * 280 * gridSize) / 20,
    };
    column += 1;
    if (column >= columns) {
      column = 0;
      row += 1;
    }
  }
  return Object.fromEntries(
    Object.entries(result).sort(([left], [right]) => left.localeCompare(right)),
  );
}
