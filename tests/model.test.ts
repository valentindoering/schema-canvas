import { describe, expect, it, vi } from "vitest";

import {
  buildCanvasModel,
  visibleFields,
  type TableNodeData,
} from "../src/react/model.js";
import { graph, layout } from "./fixtures.js";

describe("React canvas model", () => {
  it("uses direct edges and automatically chooses the nearest table sides", () => {
    const horizontal = build(layout).edges[0]!;
    expect(horizontal).toMatchObject({
      type: "straight",
      sourceHandle: "source-right",
      targetHandle: "target-left",
    });

    const vertical = build({
      accounts: { x: 0, y: 400 },
      projects: { x: 0, y: 0 },
    }).edges[0]!;
    expect(vertical).toMatchObject({
      sourceHandle: "source-bottom",
      targetHandle: "target-top",
    });
  });

  it("applies hidden, muted, routing, and table-level controls", () => {
    const edge = graph.edges[0]!;
    const base = build({
      ...layout,
      projects: {
        ...layout.projects!,
        foreignKeys: {
          "accountId->accounts": {
            targetTable: "accounts",
            route: "straight",
            source: "bottom-right",
            target: "top-left",
            muted: true,
          },
        },
      },
    });
    expect(base.edges[0]).toMatchObject({
      id: edge.id,
      type: "straight",
      sourceHandle: "source-bottom-right",
      targetHandle: "target-top-left",
      data: { muted: true },
    });
    expect(
      build({
        ...layout,
        projects: {
          ...layout.projects!,
          foreignKeys: { "accountId->accounts": { hidden: true } },
        },
      }).edges,
    ).toHaveLength(0);
    expect(
      build({
        ...layout,
        accounts: { ...layout.accounts!, hideIncomingArrows: true },
      }).edges,
    ).toHaveLength(0);
  });

  it("temporarily expands concise fields and keeps important fields visible", () => {
    const data: TableNodeData = {
      table: graph.tables[1]!,
      appearance: "standard",
      fieldDisplay: "concise",
      conciseFieldCount: 0,
      expanded: false,
      highlightedFields: [],
      unpositioned: false,
      writable: true,
      showMoreLabel: "More",
      showLessLabel: "Less",
      onToggleExpanded: vi.fn(),
    };
    expect(visibleFields(data).map((field) => field.name)).toEqual([
      "id",
      "accountId",
    ]);
    expect(visibleFields({ ...data, expanded: true })).toEqual(
      data.table.fields,
    );
  });
});

function build(schemaLayout: typeof layout) {
  return buildCanvasModel(graph, schemaLayout, [], {
    view: {
      id: "all",
      label: "All",
      tableIds: graph.tables.map((table) => table.id),
      edgeIds: graph.edges.map((edge) => edge.id),
    },
    expandedTableIds: new Set(),
    writable: true,
    conciseFieldCount: 8,
    automaticMuteDistance: 10_000,
    defaultFieldDisplay: "all",
    showMoreLabel: "More",
    showLessLabel: "Less",
    onToggleExpanded: vi.fn(),
    onResizeAnnotation: vi.fn(),
  });
}
