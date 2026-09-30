import { describe, expect, it, vi } from "vitest";

import {
  buildCanvasModel,
  inferEdgePorts,
  visibleFields,
  type TableNodeData,
} from "../src/react/model.js";
import { graph, layout } from "./fixtures.js";

describe("React canvas model", () => {
  it("renders all unpositioned tables in a non-overlapping vertical column without saving them", () => {
    const empty = {};
    const model = build(empty, { accounts: { width: 280, height: 900 } });
    expect(model.nodes).toHaveLength(graph.tables.length);
    const [first, second] = model.nodes;
    expect(first!.position.x).toBe(second!.position.x);
    expect(second!.position.y).toBeGreaterThan(first!.position.y + 900);
    expect(model.unpositionedTableIds).toEqual(["accounts", "projects"]);
    expect(empty).toEqual({});
  });

  it("stages new tables to the right without moving saved tables", () => {
    const saved = { accounts: { x: 1400, y: -600 } };
    const model = build(saved, { accounts: { width: 400, height: 300 } });
    expect(model.nodes[0]!.position).toEqual(saved.accounts);
    expect(model.nodes[1]!.position.x).toBeGreaterThan(1800);
    expect(model.nodes[1]!.position.y).toBe(-600);
    expect(model.unpositionedTableIds).toEqual(["projects"]);
    expect(saved).toEqual({ accounts: { x: 1400, y: -600 } });
  });
  it("retains measured union table sizes for automatic layout", () => {
    const model = build(layout, { projects: { width: 280, height: 900 } });
    expect(
      model.nodes.find((node) => node.id === "projects")?.measured,
    ).toEqual({ width: 280, height: 900 });
  });
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

  it("uses table bounds for uneven sizes and diagonal placement", () => {
    const edge = { source: "a", target: "b" };
    expect(
      inferEdgePorts(
        edge,
        new Map([
          ["a", { x: 0, y: 0 }],
          ["b", { x: 550, y: 0 }],
        ]),
        { a: { width: 500, height: 1000 }, b: { width: 200, height: 100 } },
      ),
    ).toEqual({ source: "right", target: "bottom-left" });

    const positions = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 400, y: 320 }],
    ]);
    const dimensions = {
      a: { width: 280, height: 160 },
      b: { width: 280, height: 160 },
    };
    expect(inferEdgePorts(edge, positions, dimensions)).toEqual({
      source: "right",
      target: "top-left",
    });
    expect(
      inferEdgePorts(edge, positions, dimensions, { source: "bottom-right" }),
    ).toEqual({ source: "bottom-right", target: "left" });
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

  it("keeps a distant arrow dark when its layout explicitly disables muting", () => {
    const far = {
      projects: {
        x: 0,
        y: 0,
        foreignKeys: { "accountId->accounts": { muted: false } },
      },
      accounts: { x: 2400, y: 0 },
    };
    const edge = build(far).edges[0]!;
    expect(edge.data?.automaticallyMuted).toBe(false);
    const canvas = buildCanvasModel(graph, far, [], {
      view: {
        id: "all",
        label: "All",
        tableIds: graph.tables.map((table) => table.id),
        edgeIds: graph.edges.map((edge) => edge.id),
      },
      expandedTableIds: new Set(),
      writable: true,
      conciseFieldCount: 8,
      automaticMuteDistance: 1100,
      defaultFieldDisplay: "all",
      showMoreLabel: "More",
      showLessLabel: "Less",
      onToggleExpanded: vi.fn(),
      onResizeAnnotation: vi.fn(),
    });
    expect(canvas.edges[0]).toMatchObject({
      data: { automaticallyMuted: true, muted: false },
      style: { stroke: "var(--schema-canvas-edge-strong)" },
    });
  });

  it("gives gray arrows a larger tip than dark arrows", () => {
    const far = { projects: { x: 0, y: 0 }, accounts: { x: 2400, y: 0 } };
    const muted = buildCanvasModel(graph, far, [], {
      view: {
        id: "all",
        label: "All",
        tableIds: graph.tables.map((table) => table.id),
        edgeIds: graph.edges.map((edge) => edge.id),
      },
      expandedTableIds: new Set(),
      writable: true,
      conciseFieldCount: 8,
      automaticMuteDistance: 1100,
      defaultFieldDisplay: "all",
      showMoreLabel: "More",
      showLessLabel: "Less",
      onToggleExpanded: vi.fn(),
      onResizeAnnotation: vi.fn(),
    }).edges[0]!;
    const dark = build(layout).edges[0]!;
    expect(muted.markerEnd).toMatchObject({ width: 36, height: 36 });
    expect(dark.markerEnd).toMatchObject({ width: 20, height: 20 });
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

function build(
  schemaLayout: typeof layout,
  nodeDimensions: Record<string, { width: number; height: number }> = {},
) {
  return buildCanvasModel(graph, schemaLayout, [], {
    view: {
      id: "all",
      label: "All",
      tableIds: graph.tables.map((table) => table.id),
      edgeIds: graph.edges.map((edge) => edge.id),
    },
    expandedTableIds: new Set(),
    nodeDimensions,
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
