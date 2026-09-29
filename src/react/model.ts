import { MarkerType, type Edge, type Node } from "@xyflow/react";

import {
  getSchemaEdgeLayout,
  type SchemaAnnotation,
  type SchemaEdge,
  type SchemaGraph,
  type SchemaLayout,
  type SchemaPortSide,
  type SchemaTable,
  type SchemaTableAppearance,
  type SchemaTableFieldDisplay,
  type SchemaView,
} from "../core/index.js";

export type TableNodeData = {
  table: SchemaTable;
  reconnectTargetKind?: "source" | "target";
  appearance: SchemaTableAppearance;
  markdown?: string;
  fieldDisplay: SchemaTableFieldDisplay;
  conciseFieldCount: number;
  expanded: boolean;
  highlightedFields: string[];
  unpositioned: boolean;
  writable: boolean;
  showMoreLabel: string;
  showLessLabel: string;
  onToggleExpanded: (tableId: string) => void;
};

export type AnnotationNodeData = {
  annotation: SchemaAnnotation;
  writable: boolean;
  onResizeEnd: (
    annotationId: string,
    bounds: { x: number; y: number; width: number; height: number },
  ) => void;
};

export type CanvasNode =
  | Node<TableNodeData, "schemaTable">
  | Node<AnnotationNodeData, "schemaAnnotation">;

export type CanvasEdgeData = {
  schemaEdge: SchemaEdge;
  muted: boolean;
  automaticallyMuted: boolean;
};

export type CanvasEdge = Edge<CanvasEdgeData, "straight" | "smoothstep">;

export type BuildCanvasModelOptions = {
  view: SchemaView;
  selectedNodeId?: string | null;
  selectedTableIds?: ReadonlySet<string>;
  selectedEdgeId?: string | null;
  reconnecting?: { tableId: string; kind: "source" | "target" } | null;
  nodeDimensions?: Readonly<
    Record<string, { width: number; height: number } | undefined>
  >;
  expandedTableIds: ReadonlySet<string>;
  writable: boolean;
  conciseFieldCount: number;
  automaticMuteDistance: number;
  defaultFieldDisplay:
    SchemaTableFieldDisplay | ((table: SchemaTable) => SchemaTableFieldDisplay);
  showMoreLabel: string;
  showLessLabel: string;
  onToggleExpanded: (tableId: string) => void;
  onResizeAnnotation: AnnotationNodeData["onResizeEnd"];
};

export function buildCanvasModel(
  graph: SchemaGraph,
  layout: SchemaLayout,
  annotations: readonly SchemaAnnotation[],
  options: BuildCanvasModelOptions,
) {
  const tableIds = new Set(options.view.tableIds);
  const edgeIds = new Set(options.view.edgeIds);
  const fallbackPositions = unpositionedPositions(
    graph,
    layout,
    annotations,
    options.nodeDimensions,
  );
  const tableNodes: CanvasNode[] = graph.tables
    .filter((table) => tableIds.has(table.id))
    .map((table) => {
      const entry = layout[table.id];
      const measured = options.nodeDimensions?.[table.id];
      const fallback = fallbackPositions.get(table.id)!;
      const fieldDisplay =
        entry?.fieldDisplay ??
        (typeof options.defaultFieldDisplay === "function"
          ? options.defaultFieldDisplay(table)
          : options.defaultFieldDisplay);
      return {
        id: table.id,
        type: "schemaTable",
        position: entry ? { x: entry.x, y: entry.y } : fallback,
        ...(measured ? { measured } : {}),
        data: {
          table,
          ...(options.reconnecting?.tableId === table.id
            ? { reconnectTargetKind: options.reconnecting.kind }
            : {}),
          appearance: entry?.appearance ?? "standard",
          ...(entry?.markdown ? { markdown: entry.markdown } : {}),
          fieldDisplay,
          conciseFieldCount: options.conciseFieldCount,
          expanded: options.expandedTableIds.has(table.id),
          highlightedFields: entry?.highlightedFields ?? [],
          unpositioned: entry === undefined,
          writable: options.writable,
          showMoreLabel: options.showMoreLabel,
          showLessLabel: options.showLessLabel,
          onToggleExpanded: options.onToggleExpanded,
        },
        draggable: options.writable,
        deletable: false,
        selectable: true,
        selected:
          options.selectedTableIds?.has(table.id) ??
          options.selectedNodeId === table.id,
        zIndex: 10,
        className: `schema-canvas__table schema-canvas__table--${entry?.appearance ?? "standard"}`,
      };
    });
  const positionById = new Map(
    tableNodes.map((node) => [node.id, node.position]),
  );
  const edges: CanvasEdge[] = graph.edges
    .filter(
      (edge) =>
        edgeIds.has(edge.id) &&
        tableIds.has(edge.source) &&
        tableIds.has(edge.target),
    )
    .flatMap((edge): CanvasEdge[] => {
      const sourceLayout = layout[edge.source];
      const targetLayout = layout[edge.target];
      const route = getSchemaEdgeLayout(layout, edge);
      const automaticallyMuted = isAutomaticallyMuted(
        positionById.get(edge.source),
        positionById.get(edge.target),
        options.automaticMuteDistance,
      );
      const muted = route?.muted ?? automaticallyMuted;
      if (
        route?.hidden ||
        sourceLayout?.hideArrows ||
        targetLayout?.hideIncomingArrows ||
        (targetLayout?.hideMutedIncomingArrows && muted)
      ) {
        return [];
      }
      const selected = options.selectedEdgeId === edge.id;
      const inferredPorts = inferEdgePorts(
        edge,
        positionById,
        options.nodeDimensions,
        { source: route?.source, target: route?.target },
      );
      const style = {
        stroke: muted
          ? edge.optional
            ? "#e2e8f0"
            : "#94a3b8"
          : edge.optional
            ? "#475569"
            : "#020617",
        strokeWidth: selected ? (muted ? 2 : 3) : muted ? 1.3 : 2,
        ...((route?.style ?? (edge.optional ? "dashed" : "solid")) === "dashed"
          ? { strokeDasharray: "8 5" }
          : route?.style === "dotted"
            ? { strokeDasharray: "2 4" }
            : {}),
      };
      return [
        {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: handleId(
            "source",
            route?.source ?? inferredPorts.source,
          ),
          targetHandle: handleId(
            "target",
            route?.target ?? inferredPorts.target,
          ),
          type: route?.route ?? "straight",
          label: edge.field,
          data: { schemaEdge: edge, muted, automaticallyMuted },
          selected,
          className: muted
            ? "schema-canvas__edge schema-canvas__edge--muted"
            : "schema-canvas__edge",
          style,
          selectable: options.writable,
          reconnectable: options.writable && selected,
          deletable: false,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: muted ? 36 : 20,
            height: muted ? 36 : 20,
            color: style.stroke,
          },
        },
      ];
    });
  const annotationNodes: CanvasNode[] = annotations.map((annotation) => ({
    id: `annotation:${annotation.id}`,
    type: "schemaAnnotation",
    position: { x: annotation.x, y: annotation.y },
    width: annotation.width,
    height: annotation.height,
    data: {
      annotation,
      writable: options.writable,
      onResizeEnd: options.onResizeAnnotation,
    },
    draggable: options.writable,
    deletable: false,
    selectable: true,
    selected: options.selectedNodeId === `annotation:${annotation.id}`,
    zIndex: annotation.kind === "frame" ? 0 : 6,
    className: `schema-canvas__annotation schema-canvas__annotation--${annotation.kind}`,
  }));
  return {
    nodes: [...annotationNodes, ...tableNodes],
    edges,
    unpositionedTableIds: tableNodes
      .filter((node) => node.type === "schemaTable" && node.data.unpositioned)
      .map((node) => node.id),
  };
}

export function isAutomaticallyMuted(
  source: { x: number; y: number } | undefined,
  target: { x: number; y: number } | undefined,
  threshold: number,
) {
  if (!source || !target || threshold <= 0) return false;
  return Math.hypot(target.x - source.x, target.y - source.y) > threshold;
}

export function handleId(kind: "source" | "target", side: SchemaPortSide) {
  return `${kind}-${side}`;
}

export function portSideFromHandle(
  handle: string | null | undefined,
  kind: "source" | "target",
): SchemaPortSide | undefined {
  const prefix = `${kind}-`;
  if (!handle?.startsWith(prefix)) return undefined;
  const side = handle.slice(prefix.length);
  return portSides.includes(side as SchemaPortSide)
    ? (side as SchemaPortSide)
    : undefined;
}

export function inferEdgePorts(
  edge: Pick<SchemaEdge, "source" | "target">,
  positions: ReadonlyMap<string, { x: number; y: number }>,
  dimensions: Readonly<
    Record<string, { width: number; height: number } | undefined>
  > = {},
  fixed: {
    source?: SchemaPortSide | undefined;
    target?: SchemaPortSide | undefined;
  } = {},
): { source: SchemaPortSide; target: SchemaPortSide } {
  const source = positions.get(edge.source);
  const target = positions.get(edge.target);
  if (!source || !target) return { source: "right", target: "left" };

  const sourceSize = dimensions[edge.source] ?? DEFAULT_TABLE_SIZE;
  const targetSize = dimensions[edge.target] ?? DEFAULT_TABLE_SIZE;
  const sourceSides = fixed.source ? [fixed.source] : portSides;
  const targetSides = fixed.target ? [fixed.target] : portSides;
  let best = { source: sourceSides[0]!, target: targetSides[0]! };
  let bestScore = Infinity;
  for (const sourceSide of sourceSides) {
    const from = portPosition(source, sourceSize, sourceSide);
    for (const targetSide of targetSides) {
      const to = portPosition(target, targetSize, targetSide);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const sourceFacing = (dx * from.nx + dy * from.ny) / distance;
      const targetFacing = (-dx * to.nx - dy * to.ny) / distance;
      // Prefer ports facing the connection; nearly tangential paths look as
      // though they slide along the table border instead of entering it.
      const facingPenalty =
        110 * (2 - sourceFacing - targetFacing) +
        (sourceFacing < 0.08 ? 600 : 0) +
        (targetFacing < 0.08 ? 600 : 0);
      const score = distance + facingPenalty;
      if (score < bestScore) {
        bestScore = score;
        best = { source: sourceSide, target: targetSide };
      }
    }
  }
  return best;
}

function portPosition(
  position: { x: number; y: number },
  size: { width: number; height: number },
  side: SchemaPortSide,
) {
  const horizontal = side.includes("left")
    ? 0.2
    : side.includes("right")
      ? 0.8
      : 0.5;
  if (side.startsWith("top"))
    return {
      x: position.x + size.width * horizontal,
      y: position.y,
      nx: 0,
      ny: -1,
    };
  if (side.startsWith("bottom"))
    return {
      x: position.x + size.width * horizontal,
      y: position.y + size.height,
      nx: 0,
      ny: 1,
    };
  return {
    x: position.x + (side === "left" ? 0 : size.width),
    y: position.y + size.height / 2,
    nx: side === "left" ? -1 : 1,
    ny: 0,
  };
}

export function fallbackPosition(index: number) {
  return { x: 0, y: index * 280 };
}

const DEFAULT_TABLE_SIZE = { width: 280, height: 160 };

function unpositionedPositions(
  graph: SchemaGraph,
  layout: SchemaLayout,
  annotations: readonly SchemaAnnotation[],
  dimensions: BuildCanvasModelOptions["nodeDimensions"],
) {
  const placed = graph.tables.filter((table) => layout[table.id]);
  const right = Math.max(
    0,
    ...placed.map(
      (table) =>
        layout[table.id]!.x +
        (dimensions?.[table.id]?.width ?? DEFAULT_TABLE_SIZE.width),
    ),
    ...annotations.map((annotation) => annotation.x + annotation.width),
  );
  const x = placed.length || annotations.length ? right + 160 : 0;
  let y = Math.min(
    0,
    ...placed.map((table) => layout[table.id]!.y),
    ...annotations.map((annotation) => annotation.y),
  );
  const positions = new Map<string, { x: number; y: number }>();
  for (const table of graph.tables) {
    if (layout[table.id]) continue;
    positions.set(table.id, { x, y });
    const rows = table.fields.reduce(
      (count, field) =>
        count +
        1 +
        (field.discriminatedUnion?.variants.reduce(
          (total, variant) => total + 1 + variant.fields.length,
          0,
        ) ?? 0),
      0,
    );
    const height =
      dimensions?.[table.id]?.height ??
      Math.max(DEFAULT_TABLE_SIZE.height, 60 + rows * 24);
    y += height + 80;
  }
  return positions;
}
const portSides: SchemaPortSide[] = [
  "top",
  "right",
  "bottom",
  "left",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

export function visibleFields(data: TableNodeData) {
  if (data.fieldDisplay === "all" || data.expanded) return data.table.fields;
  const required = new Set(data.highlightedFields);
  const concise = data.table.fields.slice(0, data.conciseFieldCount);
  for (const field of data.table.fields) {
    if (
      required.has(field.name) ||
      field.primaryKey ||
      field.foreignKeyTargets.length > 0
    ) {
      concise.push(field);
    }
  }
  return [...new Map(concise.map((field) => [field.name, field])).values()];
}
