import type { SchemaGraph, SchemaView } from "./types.js";

export function validateSchemaGraph(graph: SchemaGraph): SchemaGraph {
  const tableIds = new Set<string>();
  for (const table of graph.tables) {
    if (!table.id.trim()) throw new Error("Schema table ids cannot be empty.");
    if (tableIds.has(table.id)) {
      throw new Error(`Duplicate schema table id \"${table.id}\".`);
    }
    tableIds.add(table.id);
    const fields = new Set<string>();
    for (const field of table.fields) {
      if (fields.has(field.name)) {
        throw new Error(`Duplicate field \"${table.id}.${field.name}\".`);
      }
      fields.add(field.name);
    }
  }

  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      throw new Error(`Duplicate schema edge id \"${edge.id}\".`);
    }
    edgeIds.add(edge.id);
    if (!tableIds.has(edge.source) || !tableIds.has(edge.target)) {
      throw new Error(
        `Schema edge \"${edge.id}\" references an unknown table.`,
      );
    }
  }
  return graph;
}

export function allSchemaView(
  graph: SchemaGraph,
  label = "All tables",
): SchemaView {
  return {
    id: "all",
    label,
    tableIds: graph.tables.map((table) => table.id),
    edgeIds: graph.edges.map((edge) => edge.id),
  };
}

export function validateSchemaViews(
  views: readonly SchemaView[],
  graph: SchemaGraph,
): SchemaView[] {
  const tableIds = new Set(graph.tables.map((table) => table.id));
  const edgeIds = new Set(graph.edges.map((edge) => edge.id));
  const viewIds = new Set<string>();
  return views.map((view) => {
    if (viewIds.has(view.id))
      throw new Error(`Duplicate view id \"${view.id}\".`);
    viewIds.add(view.id);
    for (const id of view.tableIds) {
      if (!tableIds.has(id)) {
        throw new Error(
          `View \"${view.id}\" references unknown table \"${id}\".`,
        );
      }
    }
    for (const id of view.edgeIds) {
      if (!edgeIds.has(id)) {
        throw new Error(
          `View \"${view.id}\" references unknown edge \"${id}\".`,
        );
      }
    }
    return {
      ...view,
      tableIds: [...new Set(view.tableIds)],
      edgeIds: [...new Set(view.edgeIds)],
    };
  });
}
