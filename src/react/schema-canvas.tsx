import {
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type EdgeMouseHandler,
  type NodeChange,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import {
  allSchemaView,
  createSaveQueue,
  getSchemaEdgeLayout,
  parseSchemaAnnotations,
  setSchemaEdgeLayout,
  type SaveQueue,
  type SaveState,
  type SchemaAnnotation,
  type SchemaAnnotationColor,
  type SchemaAnnotationKind,
  type SchemaEdge,
  type SchemaEdgeLayout,
  type SchemaLayout,
  type SchemaTableLayout,
  type SchemaTableAppearance,
  type SchemaTable,
} from "../core/index.js";
import {
  buildCanvasModel,
  portSideFromHandle,
  type CanvasEdge,
  type CanvasNode,
} from "./model.js";
import { SchemaAnnotationNode, SchemaTableNode } from "./nodes.js";
import { HighlightedSource } from "./source-highlight.js";
import { CanvasEditHistory, type CanvasEditSnapshot } from "./edit-history.js";
import {
  defaultSchemaCanvasFeatures,
  defaultSchemaCanvasLabels,
  type SchemaCanvasLabels,
  type SchemaCanvasProps,
  type SchemaCanvasHandle,
} from "./types.js";

const nodeTypes = {
  schemaTable: SchemaTableNode,
  schemaAnnotation: SchemaAnnotationNode,
};

const EMPTY_ANNOTATIONS: SchemaAnnotation[] = [];

const ELKConstructor = ELK as unknown as new () => {
  layout: (graph: {
    id: string;
    layoutOptions: Record<string, string>;
    children: Array<{ id: string; width: number; height: number }>;
    edges: Array<{ id: string; sources: string[]; targets: string[] }>;
  }) => Promise<{
    children?: Array<{ id: string; x?: number; y?: number }>;
  }>;
};

export function SchemaCanvas(props: SchemaCanvasProps) {
  return <SchemaCanvasInner {...props} />;
}

function SchemaCanvasInner({
  ref,
  onSaveStateChange,
  graph,
  layout: layoutProp,
  annotations: annotationsProp = EMPTY_ANNOTATIONS,
  views: viewsProp,
  writable,
  initialTableId,
  layoutRevision,
  annotationRevision,
  labels: labelOverrides,
  features: featureOverrides,
  gridSize = 20,
  conciseFieldCount = 8,
  automaticMuteDistance = 1100,
  defaultFieldDisplay = "all",
  onSaveLayout,
  onSaveAnnotations,
  onUploadImage,
  resolveImage,
  onSelectedTableChange,
  renderTableDetails,
  onLoadTableDefinition,
  className,
  style,
}: SchemaCanvasProps) {
  const labels = useMemo(
    () => ({ ...defaultSchemaCanvasLabels, ...labelOverrides }),
    [labelOverrides],
  );
  const features = useMemo(
    () => ({ ...defaultSchemaCanvasFeatures, ...featureOverrides }),
    [featureOverrides],
  );
  const views = useMemo(
    () => (viewsProp?.length ? viewsProp : [allSchemaView(graph)]),
    [graph, viewsProp],
  );
  const initialView = useMemo(
    () =>
      views.find(
        (view) => initialTableId && view.tableIds.includes(initialTableId),
      ) ?? views[0],
    [initialTableId, views],
  );
  const [selectedViewId, setSelectedViewId] = useState(
    initialView?.id ?? "all",
  );
  const selectedView =
    views.find((view) => view.id === selectedViewId) ??
    views[0] ??
    allSchemaView(graph);
  const [layout, setLayout] = useState(layoutProp);
  const [annotations, setAnnotations] = useState(() =>
    hydrateImages(annotationsProp, resolveImage, gridSize),
  );
  const snapshotRef = useRef<CanvasEditSnapshot>({ layout, annotations });
  const editHistory = useRef(new CanvasEditHistory());
  const [, refreshHistory] = useState(0);
  const annotationClipboard = useRef<SchemaAnnotation | null>(null);
  const pasteCount = useRef(0);
  const [expandedTableIds, setExpandedTableIds] = useState<Set<string>>(
    new Set(),
  );
  const [nodeDimensions, setNodeDimensions] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    initialTableId ?? null,
  );
  const [selectedTableIds, setSelectedTableIds] = useState<Set<string>>(
    () => new Set(initialTableId ? [initialTableId] : []),
  );
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState<{
    edgeId: string;
    tableId: string;
    kind: "source" | "target";
  } | null>(null);
  const reconnectingRef = useRef<typeof reconnecting>(null);
  const reconnectSucceeded = useRef(false);
  const canvasRoot = useRef<HTMLElement>(null);
  const [definitionTableId, setDefinitionTableId] = useState<string | null>(
    null,
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [showSelectionHint, setShowSelectionHint] = useState(false);
  const selectionHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [searchFocusTableId, setSearchFocusTableId] = useState<string | null>(
    null,
  );
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const saveStateListener = useRef(onSaveStateChange);
  useLayoutEffect(() => {
    saveStateListener.current = onSaveStateChange;
  }, [onSaveStateChange]);
  const saveHandle = useRef<SchemaCanvasHandle | null>(null);
  const notifySaveState = useCallback(() => {
    if (saveHandle.current) {
      saveStateListener.current?.(saveHandle.current.getSaveState());
    }
  }, []);
  const [layoutSaveState, enqueueLayout, layoutQueue] = useSaveChannel(
    writable ? onSaveLayout : undefined,
    layoutRevision,
    notifySaveState,
  );
  const [annotationSaveState, enqueueAnnotations, annotationQueue] =
    useSaveChannel(
      writable ? onSaveAnnotations : undefined,
      annotationRevision,
      notifySaveState,
    );
  const handle = useMemo<SchemaCanvasHandle>(() => {
    const getSaveState = () => {
      const layout = layoutQueue.getSnapshot();
      const annotations = annotationQueue.getSnapshot();
      return {
        dirty: layout.dirty || annotations.dirty,
        pending: layout.pending || annotations.pending,
        layout,
        annotations,
      };
    };
    const settle = async (flush: boolean) => {
      do {
        const results = await Promise.allSettled([
          flush ? layoutQueue.flush() : layoutQueue.whenIdle(),
          flush ? annotationQueue.flush() : annotationQueue.whenIdle(),
        ]);
        const failure = results.find((result) => result.status === "rejected");
        if (failure?.status === "rejected") throw failure.reason;
      } while (getSaveState().pending);
    };
    return {
      getSaveState,
      flushSaves: () => settle(true),
      whenSavesIdle: () => settle(false),
    };
  }, [layoutQueue, annotationQueue]);
  useLayoutEffect(() => {
    saveHandle.current = handle;
  }, [handle]);
  useImperativeHandle(ref, () => handle, [handle]);
  const [reactFlow, setReactFlow] = useState<
    ReactFlowInstance<CanvasNode, CanvasEdge> | undefined
  >();
  const fitView = useCallback(
    (
      options?: Parameters<
        ReactFlowInstance<CanvasNode, CanvasEdge>["fitView"]
      >[0],
    ) => reactFlow?.fitView(options) ?? Promise.resolve(false),
    [reactFlow],
  );
  const screenToFlowPosition = useCallback(
    (
      position: Parameters<
        ReactFlowInstance<CanvasNode, CanvasEdge>["screenToFlowPosition"]
      >[0],
    ) => reactFlow?.screenToFlowPosition(position) ?? position,
    [reactFlow],
  );
  const focused = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (selectionHintTimer.current) clearTimeout(selectionHintTimer.current);
    },
    [],
  );
  const showDragHint = useCallback(() => {
    if (!writable) return;
    if (selectionHintTimer.current) clearTimeout(selectionHintTimer.current);
    setShowSelectionHint(true);
  }, [writable]);
  const hideDragHint = useCallback(() => {
    if (selectionHintTimer.current) clearTimeout(selectionHintTimer.current);
    selectionHintTimer.current = setTimeout(
      () => setShowSelectionHint(false),
      900,
    );
  }, []);

  useEffect(() => {
    snapshotRef.current = { ...snapshotRef.current, layout: layoutProp };
    setLayout(layoutProp);
  }, [layoutProp]);
  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearchQuery(searchQuery.trim().toLocaleLowerCase()),
      180,
    );
    return () => clearTimeout(timer);
  }, [searchQuery]);
  useEffect(() => {
    focused.current = false;
    setSelectedNodeId(initialTableId ?? null);
    setSelectedTableIds(new Set(initialTableId ? [initialTableId] : []));
    setSelectedEdgeId(null);
  }, [initialTableId]);
  useEffect(() => {
    const matchingView = views.find((view) =>
      view.tableIds.includes(initialTableId ?? ""),
    );
    if (matchingView) setSelectedViewId(matchingView.id);
  }, [initialTableId, views]);
  useEffect(() => {
    const next = hydrateImages(annotationsProp, resolveImage, gridSize);
    snapshotRef.current = { ...snapshotRef.current, annotations: next };
    setAnnotations(next);
  }, [annotationsProp, resolveImage, gridSize]);

  const toggleExpanded = useCallback((tableId: string) => {
    setExpandedTableIds((current) => {
      const next = new Set(current);
      if (next.has(tableId)) next.delete(tableId);
      else next.add(tableId);
      return next;
    });
  }, []);

  const resizeAnnotation = useCallback(
    (
      annotationId: string,
      bounds: { x: number; y: number; width: number; height: number },
    ) => {
      const before = snapshotRef.current;
      const next = before.annotations.map((annotation) =>
        annotation.id === annotationId
          ? {
              ...annotation,
              x: snap(bounds.x, gridSize),
              y: snap(bounds.y, gridSize),
              width: snap(bounds.width, gridSize),
              height: snap(bounds.height, gridSize),
            }
          : annotation,
      );
      snapshotRef.current = { ...before, annotations: next };
      editHistory.current.record(before, snapshotRef.current);
      refreshHistory((version) => version + 1);
      setAnnotations(next);
      enqueueAnnotations(stripResolvedImages(next));
    },
    [enqueueAnnotations, gridSize],
  );

  const model = useMemo(
    () =>
      (() => {
        const next = buildCanvasModel(graph, layout, annotations, {
          view: selectedView,
          selectedNodeId,
          selectedTableIds,
          selectedEdgeId,
          reconnecting,
          nodeDimensions,
          expandedTableIds,
          writable,
          conciseFieldCount,
          automaticMuteDistance,
          defaultFieldDisplay,
          showMoreLabel: labels.showMore,
          showLessLabel: labels.showLess,
          onToggleExpanded: toggleExpanded,
          onResizeAnnotation: resizeAnnotation,
        });
        return {
          ...next,
          nodes: next.nodes.map((node) => {
            const measured = nodeDimensions[node.id];
            return measured ? { ...node, measured } : node;
          }),
        };
      })(),
    [
      annotations,
      automaticMuteDistance,
      conciseFieldCount,
      defaultFieldDisplay,
      expandedTableIds,
      graph,
      labels.showLess,
      labels.showMore,
      layout,
      nodeDimensions,
      resizeAnnotation,
      selectedView,
      selectedEdgeId,
      reconnecting,
      selectedNodeId,
      selectedTableIds,
      toggleExpanded,
      writable,
    ],
  );

  useEffect(() => {
    if (focused.current || !initialTableId || !reactFlow) return;
    if (!model.nodes.some((node) => node.id === initialTableId)) return;
    focused.current = true;
    requestAnimationFrame(() => {
      void fitView({
        nodes: [{ id: initialTableId }],
        duration: 350,
        maxZoom: 1.2,
      });
    });
  }, [fitView, initialTableId, model.nodes, reactFlow]);

  useEffect(() => {
    if (!searchFocusTableId || !reactFlow) return;
    if (!model.nodes.some((node) => node.id === searchFocusTableId)) return;
    const tableId = searchFocusTableId;
    setSearchFocusTableId(null);
    requestAnimationFrame(() => {
      void fitView({ nodes: [{ id: tableId }], duration: 350, maxZoom: 1.2 });
    });
  }, [fitView, model.nodes, reactFlow, searchFocusTableId]);

  const updateLayout = useCallback(
    (
      recipe: (current: SchemaLayout) => SchemaLayout,
      save = true,
      group?: string,
    ) => {
      const before = snapshotRef.current;
      const next = recipe(before.layout);
      const after = { ...before, layout: next };
      if (save) {
        editHistory.current.record(before, after, group);
        refreshHistory((version) => version + 1);
        enqueueLayout(next);
      } else editHistory.current.beginGesture(before);
      snapshotRef.current = after;
      setLayout(next);
    },
    [enqueueLayout],
  );

  const updateAnnotations = useCallback(
    (
      recipe: (current: SchemaAnnotation[]) => SchemaAnnotation[],
      save = true,
      group?: string,
    ) => {
      const before = snapshotRef.current;
      const next = hydrateImages(
        recipe(before.annotations),
        resolveImage,
        gridSize,
      );
      const after = { ...before, annotations: next };
      if (save) {
        editHistory.current.record(before, after, group);
        refreshHistory((version) => version + 1);
        enqueueAnnotations(stripResolvedImages(next));
      } else editHistory.current.beginGesture(before);
      snapshotRef.current = after;
      setAnnotations(next);
    },
    [enqueueAnnotations, resolveImage, gridSize],
  );

  const restoreSnapshot = useCallback(
    (next: CanvasEditSnapshot) => {
      const current = snapshotRef.current;
      snapshotRef.current = next;
      setLayout(next.layout);
      setAnnotations(next.annotations);
      if (next.layout !== current.layout) enqueueLayout(next.layout);
      if (next.annotations !== current.annotations)
        enqueueAnnotations(stripResolvedImages(next.annotations));
      refreshHistory((version) => version + 1);
    },
    [enqueueLayout, enqueueAnnotations],
  );
  const undo = useCallback(() => {
    const next = editHistory.current.undo(snapshotRef.current);
    if (next) restoreSnapshot(next);
  }, [restoreSnapshot]);
  const redo = useCallback(() => {
    const next = editHistory.current.redo(snapshotRef.current);
    if (next) restoreSnapshot(next);
  }, [restoreSnapshot]);
  const insertAnnotationCopy = useCallback(
    (annotation: SchemaAnnotation, count: number) => {
      const copy = {
        ...annotation,
        id: uniqueId(annotation.kind),
        x: snap(annotation.x + gridSize * 2 * count, gridSize),
        y: snap(annotation.y + gridSize * 2 * count, gridSize),
      };
      updateAnnotations((current) => [...current, copy]);
      setSelectedNodeId(`annotation:${copy.id}`);
      setSelectedTableIds(new Set());
      setSelectedEdgeId(null);
    },
    [gridSize, updateAnnotations],
  );
  const onCanvasKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (
        !writable ||
        event.defaultPrevented ||
        !(event.metaKey || event.ctrlKey)
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          "input, textarea, select, [contenteditable], [role='dialog']",
        )
      )
        return;
      const key = event.key.toLowerCase();
      const activeAnnotation = selectedNodeId?.startsWith("annotation:")
        ? snapshotRef.current.annotations.find(
            (annotation) =>
              annotation.id === selectedNodeId.slice("annotation:".length),
          )
        : undefined;
      if (key === "z" || (key === "y" && event.ctrlKey)) {
        event.preventDefault();
        if (event.shiftKey || key === "y") redo();
        else undo();
      } else if (key === "d" && activeAnnotation) {
        event.preventDefault();
        insertAnnotationCopy(activeAnnotation, 1);
      } else if (key === "c" && activeAnnotation) {
        event.preventDefault();
        annotationClipboard.current = { ...activeAnnotation };
        pasteCount.current = 0;
      } else if (key === "v" && annotationClipboard.current) {
        event.preventDefault();
        insertAnnotationCopy(annotationClipboard.current, ++pasteCount.current);
      }
    },
    [writable, selectedNodeId, insertAnnotationCopy, redo, undo],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      const positions = changes.filter(
        (
          change,
        ): change is Extract<NodeChange<CanvasNode>, { type: "position" }> =>
          change.type === "position" && !!change.position,
      );
      if (writable && positions.length) {
        const save = positions.some((change) => change.dragging === false);
        const tablePositions = positions.filter(
          (change) => !change.id.startsWith("annotation:"),
        );
        const annotationPositions = positions.filter((change) =>
          change.id.startsWith("annotation:"),
        );
        if (tablePositions.length) {
          updateLayout((current) => {
            const next = { ...current };
            for (const change of tablePositions) {
              next[change.id] = {
                ...(current[change.id] ?? { x: 0, y: 0 }),
                x: snap(change.position!.x, gridSize),
                y: snap(change.position!.y, gridSize),
              };
            }
            return next;
          }, save);
        }
        if (annotationPositions.length) {
          updateAnnotations(
            (current) =>
              current.map((annotation) => {
                const change = annotationPositions.find(
                  (item) => item.id === `annotation:${annotation.id}`,
                );
                return change
                  ? {
                      ...annotation,
                      x: snap(change.position!.x, gridSize),
                      y: snap(change.position!.y, gridSize),
                    }
                  : annotation;
              }),
            save,
          );
        }
      }
      for (const change of changes) {
        if (change.type === "dimensions" && change.dimensions) {
          const dimensions = change.dimensions;
          setNodeDimensions((current) => {
            const previous = current[change.id];
            if (
              previous?.width === dimensions.width &&
              previous?.height === dimensions.height
            ) {
              return current;
            }
            return {
              ...current,
              [change.id]: dimensions,
            };
          });
        }
        if (!writable) continue;
        if (
          change.type === "dimensions" &&
          change.dimensions &&
          change.id.startsWith("annotation:")
        ) {
          const id = change.id.slice("annotation:".length);
          updateAnnotations(
            (current) =>
              current.map((annotation) =>
                annotation.id === id
                  ? {
                      ...annotation,
                      width: snap(
                        change.dimensions?.width ?? annotation.width,
                        gridSize,
                      ),
                      height: snap(
                        change.dimensions?.height ?? annotation.height,
                        gridSize,
                      ),
                    }
                  : annotation,
              ),
            change.resizing === false,
          );
        }
      }
    },
    [gridSize, updateAnnotations, updateLayout, writable],
  );

  const onNodeClick: NodeMouseHandler<CanvasNode> = useCallback(
    (event, node) => {
      const deselectingTable =
        writable &&
        event.shiftKey &&
        node.type === "schemaTable" &&
        selectedTableIds.has(node.id);
      if (node.type === "schemaTable") {
        setSelectedTableIds((current) => {
          if (!event.shiftKey || !writable) return new Set([node.id]);
          const next = new Set(current);
          if (next.has(node.id)) next.delete(node.id);
          else next.add(node.id);
          return next;
        });
      } else setSelectedTableIds(new Set());
      setSelectedNodeId(deselectingTable ? null : node.id);
      setSelectedEdgeId(null);
      onSelectedTableChange?.(
        node.type === "schemaTable" && !deselectingTable ? node.id : null,
      );
    },
    [onSelectedTableChange, selectedTableIds, writable],
  );
  const onEdgeClick: EdgeMouseHandler<CanvasEdge> = useCallback(
    (_event, edge) => {
      if (!writable) return;
      setSelectedEdgeId(edge.id);
      setSelectedNodeId(null);
      setSelectedTableIds(new Set());
      onSelectedTableChange?.(null);
    },
    [onSelectedTableChange, writable],
  );

  const withTablePosition = useCallback(
    (current: SchemaLayout, tableId: string): SchemaLayout => {
      if (current[tableId]) return current;
      const position = model.nodes.find(
        (node) => node.id === tableId,
      )?.position;
      return position ? { ...current, [tableId]: { ...position } } : current;
    },
    [model.nodes],
  );

  const onReconnect = useCallback(
    (edge: CanvasEdge, connection: Connection) => {
      if (!writable || !edge.data) return;
      const schemaEdge = edge.data.schemaEdge;
      if (
        connection.source !== schemaEdge.source ||
        connection.target !== schemaEdge.target
      ) {
        return;
      }
      const source = portSideFromHandle(connection.sourceHandle, "source");
      const target = portSideFromHandle(connection.targetHandle, "target");
      if (!source || !target) return;
      reconnectSucceeded.current = true;
      const kind = reconnectingRef.current?.kind;
      updateLayout((current) =>
        setSchemaEdgeLayout(
          withTablePosition(current, schemaEdge.source),
          schemaEdge,
          {
            ...(getSchemaEdgeLayout(current, schemaEdge) ?? {}),
            ...(kind === "target"
              ? { target }
              : kind === "source"
                ? { source }
                : { source, target }),
          },
        ),
      );
    },
    [updateLayout, writable, withTablePosition],
  );

  const onReconnectStart = useCallback(
    (
      _event: unknown,
      edge: CanvasEdge,
      oppositeHandleType: "source" | "target",
    ) => {
      const kind: "source" | "target" =
        oppositeHandleType === "source" ? "target" : "source";
      const active = {
        edgeId: edge.id,
        tableId: kind === "target" ? edge.target : edge.source,
        kind,
      };
      reconnectSucceeded.current = false;
      reconnectingRef.current = active;
      setReconnecting(active);
    },
    [],
  );
  const onReconnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const active = reconnectingRef.current;
      if (active && !reconnectSucceeded.current) {
        const point =
          event instanceof MouseEvent ? event : event.changedTouches[0];
        const edge = graph.edges.find(
          (candidate) => candidate.id === active.edgeId,
        );
        if (point && edge) {
          const candidates = Array.from(
            canvasRoot.current?.querySelectorAll<HTMLElement>(
              ".schema-canvas__handle--drop-target",
            ) ?? [],
          )
            .filter(
              (handle) => handle.getAttribute("data-nodeid") === active.tableId,
            )
            .map((handle) => {
              const side = portSideFromHandle(
                handle.getAttribute("data-handleid"),
                active.kind,
              );
              const box = handle.getBoundingClientRect();
              return {
                side,
                distance: Math.hypot(
                  point.clientX - (box.left + box.width / 2),
                  point.clientY - (box.top + box.height / 2),
                ),
              };
            })
            .filter((candidate) => candidate.side)
            .sort((left, right) => left.distance - right.distance);
          const closest = candidates[0];
          if (closest?.side && closest.distance <= 36) {
            updateLayout((current) =>
              setSchemaEdgeLayout(
                withTablePosition(current, edge.source),
                edge,
                {
                  ...(getSchemaEdgeLayout(current, edge) ?? {}),
                  [active.kind]: closest.side,
                },
              ),
            );
          }
        }
      }
      reconnectingRef.current = null;
      setReconnecting(null);
    },
    [graph.edges, updateLayout, withTablePosition],
  );

  const arrange = useCallback(async () => {
    if (!writable) return;
    const visibleTables = model.nodes.filter(
      (node) => node.type === "schemaTable",
    );
    const elk = new ELKConstructor();
    const arranged = await elk.layout({
      id: "schema",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": "80",
        "elk.layered.spacing.nodeNodeBetweenLayers": "120",
      },
      children: visibleTables.map((node) => ({
        id: node.id,
        width: node.measured?.width ?? 280,
        height: node.measured?.height ?? 220,
      })),
      edges: model.edges.map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
    });
    updateLayout((current) => {
      const next = { ...current };
      for (const child of arranged.children ?? []) {
        next[child.id] = {
          ...(next[child.id] ?? { x: 0, y: 0 }),
          x: snap(child.x ?? 0, gridSize),
          y: snap(child.y ?? 0, gridSize),
        };
      }
      return next;
    });
    requestAnimationFrame(() => void fitView({ duration: 350, padding: 0.15 }));
  }, [fitView, gridSize, model.edges, model.nodes, updateLayout, writable]);

  const showAllEdges = useCallback(() => {
    updateLayout((current) =>
      Object.fromEntries(
        Object.entries(current).map(([tableId, entry]) => [
          tableId,
          {
            ...entry,
            hideArrows: false,
            hideIncomingArrows: false,
            hideMutedIncomingArrows: false,
            ...(entry.foreignKeys
              ? {
                  foreignKeys: Object.fromEntries(
                    Object.entries(entry.foreignKeys).map(([key, route]) => [
                      key,
                      { ...route, hidden: false },
                    ]),
                  ),
                }
              : {}),
          },
        ]),
      ),
    );
  }, [updateLayout]);

  const showAllEdgesForTable = useCallback(
    (tableId: string) => {
      updateLayout((current) => {
        let next: SchemaLayout = {
          ...current,
          [tableId]: {
            ...withTablePosition(current, tableId)[tableId]!,
            hideArrows: false,
            hideIncomingArrows: false,
            hideMutedIncomingArrows: false,
          },
        };
        for (const edge of graph.edges) {
          if (edge.source !== tableId && edge.target !== tableId) continue;
          const route = getSchemaEdgeLayout(next, edge);
          if (route?.hidden) {
            next = setSchemaEdgeLayout(next, edge, {
              ...route,
              hidden: false,
            });
          }
        }
        return next;
      });
    },
    [graph.edges, updateLayout, withTablePosition],
  );

  const addAnnotation = useCallback(
    (kind: SchemaAnnotationKind, extra: Partial<SchemaAnnotation> = {}) => {
      const center = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      const label =
        kind === "frame"
          ? labels.addFrame
          : kind === "note"
            ? labels.addNote
            : kind === "text"
              ? labels.addText
              : labels.addImage;
      const annotation: SchemaAnnotation = {
        id: uniqueId(kind),
        kind,
        ...(kind === "frame" || kind === "image" ? { label } : {}),
        x: snap(center.x - 160, gridSize),
        y: snap(center.y - 100, gridSize),
        width: kind === "frame" ? 640 : 320,
        height: kind === "frame" ? 400 : 200,
        color: "slate",
        ...(kind === "note" ? { markdown: `# ${labels.note}` } : {}),
        ...(kind === "text" ? { markdown: labels.text } : {}),
        ...(kind === "text" ? { fontSize: 32 } : {}),
        ...extra,
      };
      updateAnnotations((current) => [...current, annotation]);
      setSelectedNodeId(`annotation:${annotation.id}`);
      setSelectedTableIds(new Set());
    },
    [gridSize, labels, screenToFlowPosition, updateAnnotations],
  );

  const uploadImage = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || !onUploadImage || !writable) return;
      setImageUploadError(null);
      try {
        const uploaded = await onUploadImage(file);
        addAnnotation("image", {
          asset: uploaded.asset,
          ...(uploaded.src ? { src: uploaded.src } : {}),
        });
      } catch (error) {
        setImageUploadError(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    [addAnnotation, onUploadImage, writable],
  );

  const selectedTable = selectedNodeId
    ? graph.tables.find((table) => table.id === selectedNodeId)
    : undefined;
  const selectedAnnotation = selectedNodeId?.startsWith("annotation:")
    ? annotations.find(
        (annotation) =>
          annotation.id === selectedNodeId.slice("annotation:".length),
      )
    : undefined;
  const selectedEdge = selectedEdgeId
    ? graph.edges.find((edge) => edge.id === selectedEdgeId)
    : undefined;
  const saveState = mergeSaveStates(layoutSaveState, annotationSaveState);
  const searchableTables = useMemo(() => {
    const visibleTableIds = new Set(views.flatMap((view) => view.tableIds));
    return graph.tables.filter((table) => visibleTableIds.has(table.id));
  }, [graph.tables, views]);
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const searchResults =
    debouncedSearchQuery && debouncedSearchQuery === normalizedSearchQuery
      ? searchableTables.filter(
          (table) =>
            table.label.toLocaleLowerCase().includes(debouncedSearchQuery) ||
            table.id.toLocaleLowerCase().includes(debouncedSearchQuery),
        )
      : [];
  const selectSearchResult = (tableId: string) => {
    const matchingView =
      (selectedView.tableIds.includes(tableId) ? selectedView : undefined) ??
      views.find((view) => view.tableIds.includes(tableId));
    if (matchingView) setSelectedViewId(matchingView.id);
    setSelectedNodeId(tableId);
    setSelectedTableIds(new Set([tableId]));
    setSelectedEdgeId(null);
    setSearchFocusTableId(tableId);
    setSearchOpen(false);
    setSearchQuery("");
    onSelectedTableChange?.(tableId);
  };

  return (
    <section
      ref={canvasRoot}
      className={[
        "schema-canvas",
        reconnecting ? "schema-canvas--reconnecting" : "",
        features.navigationControls ? "" : "schema-canvas--no-navigation",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      aria-label={labels.canvasLabel}
      tabIndex={0}
      onKeyDown={onCanvasKeyDown}
    >
      {features.canvasToolbar ? (
        <div className="schema-canvas__toolbar">
          {views.length > 1 ? (
            <label>
              <span>{labels.view}</span>
              <select
                value={selectedView.id}
                onChange={(event) => {
                  setSelectedViewId(event.target.value);
                  setSelectedNodeId(null);
                  setSelectedTableIds(new Set());
                  setSelectedEdgeId(null);
                  onSelectedTableChange?.(null);
                }}
              >
                {views.map((view) => (
                  <option key={view.id} value={view.id}>
                    {view.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button type="button" onClick={() => void fitView({ duration: 250 })}>
            {labels.fit}
          </button>
          {features.autoLayout && writable ? (
            <button type="button" onClick={() => void arrange()}>
              {labels.arrange}
            </button>
          ) : null}
          {writable ? (
            <button type="button" onClick={showAllEdges}>
              {labels.showAllEdges}
            </button>
          ) : null}
          {features.annotations && writable ? (
            <div className="schema-canvas__toolbar-group">
              <button type="button" onClick={() => addAnnotation("frame")}>
                {labels.addFrame}
              </button>
              <button type="button" onClick={() => addAnnotation("note")}>
                {labels.addNote}
              </button>
              <button type="button" onClick={() => addAnnotation("text")}>
                {labels.addText}
              </button>
              {features.imageAnnotations && onUploadImage ? (
                <>
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                  >
                    {labels.addImage}
                  </button>
                  <input
                    ref={fileInput}
                    className="schema-canvas__file-input"
                    type="file"
                    accept="image/*"
                    aria-label={labels.uploadImage}
                    onChange={(event) => void uploadImage(event)}
                  />
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className="schema-canvas__search"
        role="toolbar"
        aria-label={labels.canvasActions}
      >
        <div className="schema-canvas__search-control">
          {searchOpen ? (
            <input
              autoFocus
              type="search"
              value={searchQuery}
              aria-label={labels.searchTables}
              placeholder={labels.searchTables}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSearchOpen(false);
                  setSearchQuery("");
                }
                if (event.key === "Enter") {
                  const first = searchableTables.find(
                    (table) =>
                      table.label
                        .toLocaleLowerCase()
                        .includes(normalizedSearchQuery) ||
                      table.id
                        .toLocaleLowerCase()
                        .includes(normalizedSearchQuery),
                  );
                  if (normalizedSearchQuery && first)
                    selectSearchResult(first.id);
                }
              }}
            />
          ) : null}
          <button
            type="button"
            aria-label={searchOpen ? labels.closeSearch : labels.searchTables}
            onClick={() => {
              setSearchOpen((open) => !open);
              setSearchQuery("");
            }}
          >
            {searchOpen ? (
              <span aria-hidden="true">×</span>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="10.8" cy="10.8" r="6.3" />
                <path d="m15.5 15.5 5 5" />
              </svg>
            )}
          </button>
          {writable ? (
            <>
              <button
                type="button"
                aria-label="Undo"
                title="Undo (⌘/Ctrl+Z)"
                disabled={!editHistory.current.canUndo}
                onClick={undo}
              >
                <HistoryIcon direction="undo" />
              </button>
              <button
                type="button"
                aria-label="Redo"
                title="Redo (⌘/Ctrl+Shift+Z)"
                disabled={!editHistory.current.canRedo}
                onClick={redo}
              >
                <HistoryIcon direction="redo" />
              </button>
            </>
          ) : null}
        </div>
        {searchOpen &&
        normalizedSearchQuery === debouncedSearchQuery &&
        normalizedSearchQuery ? (
          <div className="schema-canvas__search-results">
            {searchResults.length ? (
              searchResults.map((table) => (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => selectSearchResult(table.id)}
                >
                  <span>{table.label}</span>
                  {table.id !== table.label ? <small>{table.id}</small> : null}
                </button>
              ))
            ) : (
              <p>{labels.noMatchingTables}</p>
            )}
          </div>
        ) : null}
      </div>

      {features.unpositionedTray && model.unpositionedTableIds.length ? (
        <aside className="schema-canvas__tray">
          <strong>{labels.unpositionedTables}</strong>
          {model.unpositionedTableIds.map((tableId) => (
            <button
              key={tableId}
              type="button"
              onClick={() => {
                setSelectedNodeId(tableId);
                setSelectedTableIds(new Set([tableId]));
                void fitView({ nodes: [{ id: tableId }], duration: 250 });
              }}
            >
              {graph.tables.find((table) => table.id === tableId)?.label ??
                tableId}
            </button>
          ))}
        </aside>
      ) : null}

      <ReactFlow<CanvasNode, CanvasEdge>
        className={
          features.background ? "schema-canvas__background" : undefined
        }
        style={{ backgroundSize: `${gridSize}px ${gridSize}px` }}
        onInit={setReactFlow}
        nodes={model.nodes}
        edges={model.edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onNodeDragStart={showDragHint}
        onNodeDragStop={hideDragHint}
        onSelectionStart={showDragHint}
        onSelectionEnd={hideDragHint}
        onEdgeClick={onEdgeClick}
        onReconnect={onReconnect}
        onReconnectStart={onReconnectStart}
        onReconnectEnd={onReconnectEnd}
        onPaneClick={() => {
          setSelectedNodeId(null);
          setSelectedTableIds(new Set());
          setSelectedEdgeId(null);
          onSelectedTableChange?.(null);
        }}
        snapToGrid
        snapGrid={[gridSize, gridSize]}
        nodesDraggable={writable}
        nodesConnectable={writable}
        edgesReconnectable={writable}
        reconnectRadius={10}
        connectionRadius={28}
        isValidConnection={(connection) =>
          graph.edges.some(
            (edge) =>
              edge.source === connection.source &&
              edge.target === connection.target,
          )
        }
        elementsSelectable
        selectionOnDrag={writable}
        deleteKeyCode={null}
        multiSelectionKeyCode="Shift"
        minZoom={0.08}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        panOnScroll
        selectionKeyCode="Shift"
        zoomOnScroll={false}
        zoomOnPinch
        elevateNodesOnSelect={false}
        elevateEdgesOnSelect
        aria-label={labels.canvasLabel}
      >
        {features.minimap ? <MiniMap pannable zoomable /> : null}
        {features.navigationControls ? (
          <Controls
            className="schema-canvas__navigation"
            position="bottom-center"
            orientation="horizontal"
            showInteractive={false}
            fitViewOptions={{ padding: 0.15, duration: 250 }}
          />
        ) : null}
      </ReactFlow>

      {writable && showSelectionHint ? (
        <div className="schema-canvas__selection-hint" role="status">
          <kbd>Shift</kbd>
          <span>{labels.multiSelectHint}</span>
        </div>
      ) : null}

      {features.annotations && writable && !features.canvasToolbar ? (
        <div
          className={`schema-canvas__add-menu${addOpen ? " schema-canvas__add-menu--open" : ""}`}
          role="toolbar"
          aria-label={labels.add}
        >
          <button
            type="button"
            className="schema-canvas__add-toggle"
            aria-label={labels.add}
            aria-expanded={addOpen}
            onClick={() => setAddOpen((open) => !open)}
          >
            <span aria-hidden="true">+</span>
          </button>
          {addOpen ? (
            <>
              {(
                [
                  { kind: "frame", label: labels.addFrame },
                  { kind: "note", label: labels.addNote },
                  { kind: "text", label: labels.addText },
                ] as const
              ).map(({ kind, label }) => (
                <button
                  key={kind}
                  type="button"
                  aria-label={label}
                  title={label}
                  onClick={() => {
                    addAnnotation(kind);
                    setAddOpen(false);
                  }}
                >
                  <AnnotationActionIcon kind={kind} />
                </button>
              ))}
              {features.imageAnnotations && onUploadImage ? (
                <button
                  type="button"
                  aria-label={labels.addImage}
                  title={labels.addImage}
                  onClick={() => fileInput.current?.click()}
                >
                  <AnnotationActionIcon kind="image" />
                </button>
              ) : null}
            </>
          ) : null}
          {features.imageAnnotations && onUploadImage ? (
            <input
              ref={fileInput}
              className="schema-canvas__file-input"
              type="file"
              accept="image/*"
              aria-label={labels.uploadImage}
              onChange={(event) => void uploadImage(event)}
            />
          ) : null}
        </div>
      ) : null}

      <div className="schema-canvas__save-status-overlay">
        {imageUploadError ? <span role="alert">{imageUploadError}</span> : null}
        <SaveStatus state={saveState} writable={writable} labels={labels} />
      </div>

      {writable && selectedTable && features.tableEditor ? (
        <TableEditor
          tableId={selectedTable.id}
          tableLabel={selectedTable.label}
          fields={selectedTable.fields.map((field) => field.name)}
          entry={withTablePosition(layout, selectedTable.id)[selectedTable.id]!}
          labels={labels}
          onShowAllEdges={() => showAllEdgesForTable(selectedTable.id)}
          details={renderTableDetails?.(selectedTable)}
          {...(onLoadTableDefinition
            ? {
                onViewDefinition: () => setDefinitionTableId(selectedTable.id),
              }
            : {})}
          onChange={(change) =>
            updateLayout(
              (current) => ({
                ...current,
                [selectedTable.id]: {
                  ...withTablePosition(current, selectedTable.id)[
                    selectedTable.id
                  ]!,
                  ...change,
                },
              }),
              true,
              typeof change.markdown === "string"
                ? `table:${selectedTable.id}:markdown`
                : undefined,
            )
          }
          onClose={() => {
            setSelectedNodeId(null);
            setSelectedTableIds(new Set());
          }}
        />
      ) : null}
      {!writable && selectedTable && onLoadTableDefinition ? (
        <Editor
          title={selectedTable.label}
          labels={labels}
          onClose={() => {
            setSelectedNodeId(null);
            setSelectedTableIds(new Set());
          }}
        >
          <button
            type="button"
            className="schema-canvas__action-button"
            onClick={() => setDefinitionTableId(selectedTable.id)}
          >
            {labels.viewDefinition}
          </button>
        </Editor>
      ) : null}
      {definitionTableId &&
      onLoadTableDefinition &&
      graph.tables.some((table) => table.id === definitionTableId) ? (
        <DefinitionDialog
          key={definitionTableId}
          table={graph.tables.find((table) => table.id === definitionTableId)!}
          load={onLoadTableDefinition}
          labels={labels}
          onClose={() => setDefinitionTableId(null)}
        />
      ) : null}
      {writable && selectedEdge && features.edgeEditor ? (
        <EdgeEditor
          edgeLabel={selectedEdge.field}
          route={edgeEditorRoute(selectedEdge, layout, model.edges)}
          labels={labels}
          onChange={(change) =>
            updateLayout((current) =>
              setSchemaEdgeLayout(
                withTablePosition(current, selectedEdge.source),
                selectedEdge,
                {
                  ...(getSchemaEdgeLayout(current, selectedEdge) ?? {}),
                  ...change,
                },
              ),
            )
          }
          onToneChange={(tone) =>
            updateLayout((current) => {
              const route = {
                ...(getSchemaEdgeLayout(current, selectedEdge) ?? {}),
              };
              if (tone === "auto") delete route.muted;
              else route.muted = tone === "muted";
              return setSchemaEdgeLayout(
                withTablePosition(current, selectedEdge.source),
                selectedEdge,
                route,
              );
            })
          }
          onClose={() => setSelectedEdgeId(null)}
        />
      ) : null}
      {writable && selectedAnnotation && features.annotations ? (
        <AnnotationEditor
          annotation={selectedAnnotation}
          labels={labels}
          onUploadImage={onUploadImage}
          onChange={(change) =>
            updateAnnotations(
              (current) =>
                current.map((annotation) =>
                  annotation.id === selectedAnnotation.id
                    ? { ...annotation, ...change }
                    : annotation,
                ),
              true,
              typeof change.markdown === "string"
                ? `annotation:${selectedAnnotation.id}:markdown`
                : undefined,
            )
          }
          onDelete={() => {
            updateAnnotations((current) =>
              current.filter(
                (annotation) => annotation.id !== selectedAnnotation.id,
              ),
            );
            setSelectedNodeId(null);
            setSelectedTableIds(new Set());
          }}
          onDuplicate={() => insertAnnotationCopy(selectedAnnotation, 1)}
          onClose={() => {
            setSelectedNodeId(null);
            setSelectedTableIds(new Set());
          }}
        />
      ) : null}
    </section>
  );
}

function useSaveChannel<T>(
  save:
    | ((request: {
        value: T;
        expectedRevision?: string;
      }) => Promise<{ value?: T; revision?: string }>)
    | undefined,
  revision: string | undefined,
  onSnapshotChange: () => void,
) {
  const [state, setState] = useState<SaveState>({ status: "idle" });
  const mounted = useRef(false);
  const saveCallback = useRef(save);
  const enabled = useRef(Boolean(save));
  const [queue] = useState<SaveQueue<T>>(() =>
    createSaveQueue({
      save: (request) => {
        const callback = saveCallback.current;
        if (!callback)
          return Promise.reject(new Error("No save callback configured"));
        return callback(request);
      },
      ...(revision === undefined ? {} : { revision }),
      onSnapshotChange: (snapshot) => {
        if (mounted.current)
          setState(snapshot.pending ? { status: "saving" } : snapshot.state);
        onSnapshotChange();
      },
    }),
  );
  useLayoutEffect(() => {
    // Callback identity changes must not replace a queue with outstanding edits.
    if (save) saveCallback.current = save;
    enabled.current = Boolean(save);
  }, [save]);
  useLayoutEffect(() => {
    queue.setRevision(revision);
  }, [queue, revision]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Best-effort fallback only. Hosts must await flushSaves before navigation
      // to retain their editor on failure, and warn on dirty hard-page unloads.
      if (queue.getSnapshot().state.status !== "error") {
        void queue.flush().catch(() => undefined);
      }
    };
  }, [queue]);
  const enqueue = useCallback(
    (value: T) => {
      if (enabled.current) queue.enqueue(value);
    },
    [queue],
  );
  return [state, enqueue, queue] as const;
}

function TableEditor({
  tableLabel,
  fields,
  entry,
  labels,
  onShowAllEdges,
  details,
  onViewDefinition,
  onChange,
  onClose,
}: {
  tableId: string;
  tableLabel: string;
  fields: string[];
  entry: SchemaTableLayout;
  labels: SchemaCanvasLabels;
  onShowAllEdges: () => void;
  details?: ReactNode;
  onViewDefinition?: () => void;
  onChange: (change: Partial<SchemaTableLayout>) => void;
  onClose: () => void;
}) {
  const highlighted = new Set(entry.highlightedFields ?? []);
  return (
    <Editor title={tableLabel} labels={labels} onClose={onClose}>
      <AppearancePalette
        label={labels.appearance}
        value={entry.appearance ?? "standard"}
        options={[
          ["standard", labels.standard],
          ["quiet", labels.quiet],
          ["highlighted", labels.highlighted],
          ["slate", labels.paletteSlate],
          ["blue", labels.paletteBlue],
          ["teal", labels.paletteTeal],
          ["amber", labels.paletteAmber],
          ["rose", labels.paletteRose],
          ["violet", labels.paletteViolet],
        ]}
        onChange={(appearance) =>
          onChange({
            appearance: appearance as NonNullable<
              SchemaTableLayout["appearance"]
            >,
          })
        }
      />
      <TextField
        label={labels.tableMarkdown}
        value={entry.markdown ?? ""}
        multiline
        onChange={(markdown) => onChange({ markdown })}
      />
      <ChoiceField
        label={labels.fields}
        value={entry.fieldDisplay ?? "all"}
        options={[
          ["all", labels.full, <FieldDensityIcon key="all" full />],
          ["concise", labels.concise, <FieldDensityIcon key="concise" />],
        ]}
        onChange={(fieldDisplay) =>
          onChange({
            fieldDisplay: fieldDisplay as NonNullable<
              SchemaTableLayout["fieldDisplay"]
            >,
          })
        }
      />
      <CheckField
        label={labels.hideOutgoing}
        icon={<EditorIcon kind="outgoing" />}
        checked={entry.hideArrows === true}
        onChange={(hideArrows) => onChange({ hideArrows })}
      />
      <CheckField
        label={labels.hideIncoming}
        icon={<EditorIcon kind="incoming" />}
        checked={entry.hideIncomingArrows === true}
        onChange={(hideIncomingArrows) => onChange({ hideIncomingArrows })}
      />
      <CheckField
        label={labels.hideMutedIncoming}
        icon={<EditorIcon kind="muted" />}
        checked={entry.hideMutedIncomingArrows === true}
        onChange={(hideMutedIncomingArrows) =>
          onChange({ hideMutedIncomingArrows })
        }
      />
      <fieldset className="schema-canvas__field-list">
        <legend>{labels.highlightField}</legend>
        {fields.map((field) => (
          <CheckField
            key={field}
            label={field}
            checked={highlighted.has(field)}
            onChange={(checked) => {
              const next = new Set(highlighted);
              if (checked) next.add(field);
              else next.delete(field);
              onChange({ highlightedFields: [...next].sort() });
            }}
          />
        ))}
      </fieldset>
      <button
        type="button"
        className="schema-canvas__action-button"
        onClick={onShowAllEdges}
      >
        <EditorIcon kind="restore" />
        {labels.showAllEdges}
      </button>
      {onViewDefinition ? (
        <button
          type="button"
          className="schema-canvas__action-button"
          onClick={onViewDefinition}
        >
          {labels.viewDefinition}
        </button>
      ) : null}
      {details ? (
        <div className="schema-canvas__table-details">{details}</div>
      ) : null}
    </Editor>
  );
}

function DefinitionDialog({
  table,
  load,
  labels,
  onClose,
}: {
  table: SchemaTable;
  load: NonNullable<SchemaCanvasProps["onLoadTableDefinition"]>;
  labels: SchemaCanvasLabels;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const loadRef = useRef(load);
  const [result, setResult] = useState<
    | { status: "loading" }
    | { status: "loaded"; path: string; source: string }
    | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  useEffect(() => {
    let current = true;
    Promise.resolve()
      .then(() => loadRef.current(table))
      .then((definition) => {
        if (
          !definition ||
          typeof definition.path !== "string" ||
          !definition.path ||
          typeof definition.source !== "string" ||
          !definition.source
        ) {
          throw new Error("The host returned an empty table definition.");
        }
        if (current) setResult({ status: "loaded", ...definition });
      })
      .catch((error: unknown) => {
        if (current)
          setResult({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
      });
    return () => {
      current = false;
    };
  }, [table]);

  return (
    <dialog
      ref={dialog}
      className="schema-canvas__definition-dialog"
      aria-label={`${table.label} ${labels.viewDefinition}`}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <header>
        <div>
          <strong>{table.label}</strong>
          {result.status === "loaded" ? <span>{result.path}</span> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={labels.closeDefinition}
        >
          ×
        </button>
      </header>
      {result.status === "loading" ? <p>{labels.definitionLoading}</p> : null}
      {result.status === "error" ? (
        <p role="alert">
          {labels.definitionFailed}: {result.message}
        </p>
      ) : null}
      {result.status === "loaded" ? (
        <pre aria-label={`${result.path} source`}>
          <HighlightedSource path={result.path} source={result.source} />
        </pre>
      ) : null}
    </dialog>
  );
}

function EdgeEditor({
  edgeLabel,
  route,
  labels,
  onChange,
  onToneChange,
  onClose,
}: {
  edgeLabel: string;
  route: SchemaEdgeLayout;
  labels: SchemaCanvasLabels;
  onChange: (change: Partial<SchemaEdgeLayout>) => void;
  onToneChange: (tone: "auto" | "dark" | "muted") => void;
  onClose: () => void;
}) {
  return (
    <Editor title={edgeLabel} labels={labels} onClose={onClose}>
      <ChoiceField
        label={labels.route}
        value={route.route ?? "straight"}
        options={[
          ["straight", labels.straight, <RouteIcon key="straight" />],
          ["smoothstep", labels.elbow, <RouteIcon key="smoothstep" elbow />],
        ]}
        onChange={(value) =>
          onChange({
            route: value as NonNullable<SchemaEdgeLayout["route"]>,
          })
        }
      />
      <ChoiceField
        label={labels.edgeTone}
        value={
          route.muted === false
            ? "dark"
            : route.muted === true
              ? "muted"
              : "auto"
        }
        options={[
          [
            "auto",
            labels.toneAuto,
            <span
              key="auto"
              className="schema-canvas__tone-swatch schema-canvas__tone-swatch--auto"
            />,
          ],
          [
            "dark",
            labels.toneDark,
            <span
              key="dark"
              className="schema-canvas__tone-swatch schema-canvas__tone-swatch--dark"
            />,
          ],
          [
            "muted",
            labels.toneMuted,
            <span
              key="muted"
              className="schema-canvas__tone-swatch schema-canvas__tone-swatch--muted"
            />,
          ],
        ]}
        onChange={onToneChange}
      />
      <CheckField
        label={labels.hidden}
        icon={<EditorIcon kind="hidden" />}
        checked={route.hidden === true}
        onChange={(hidden) => onChange({ hidden })}
      />
    </Editor>
  );
}

function AnnotationEditor({
  annotation,
  labels,
  onUploadImage,
  onChange,
  onDelete,
  onDuplicate,
  onClose,
}: {
  annotation: SchemaAnnotation;
  labels: SchemaCanvasLabels;
  onUploadImage: SchemaCanvasProps["onUploadImage"];
  onChange: (change: Partial<SchemaAnnotation>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
}) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  return (
    <Editor
      title={
        annotation.kind === "note"
          ? labels.note
          : annotation.kind === "text"
            ? labels.text
            : (annotation.label ?? "")
      }
      labels={labels}
      onClose={onClose}
    >
      {annotation.kind === "frame" || annotation.kind === "image" ? (
        <TextField
          label={labels.label}
          value={annotation.label ?? ""}
          onChange={(label) => onChange({ label })}
        />
      ) : null}
      {annotation.kind === "image" && onUploadImage ? (
        <label className="schema-canvas__form-field">
          <span>{labels.uploadImage}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            disabled={uploading}
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              setUploading(true);
              setUploadError(null);
              try {
                const uploaded = await onUploadImage(file);
                onChange({ asset: uploaded.asset, src: uploaded.src ?? "" });
              } catch (error) {
                setUploadError(
                  error instanceof Error ? error.message : String(error),
                );
              } finally {
                setUploading(false);
              }
            }}
          />
          {uploadError ? <span role="alert">{uploadError}</span> : null}
        </label>
      ) : null}
      {annotation.kind === "note" || annotation.kind === "text" ? (
        <TextField
          label={labels.markdown}
          value={annotation.markdown ?? ""}
          multiline
          onChange={(markdown) => onChange({ markdown })}
        />
      ) : null}
      <ChoiceField
        label={labels.color}
        value={annotation.color}
        options={[
          ["slate", labels.slate, <ColorSwatch key="slate" color="slate" />],
          ["blue", labels.blue, <ColorSwatch key="blue" color="blue" />],
          [
            "emerald",
            labels.emerald,
            <ColorSwatch key="emerald" color="emerald" />,
          ],
          ["amber", labels.amber, <ColorSwatch key="amber" color="amber" />],
        ]}
        onChange={(color) =>
          onChange({ color: color as SchemaAnnotationColor })
        }
      />
      {annotation.kind === "text" ? (
        <NumberField
          label={labels.fontSize}
          value={annotation.fontSize ?? 32}
          min={12}
          max={160}
          onChange={(fontSize) => onChange({ fontSize })}
        />
      ) : null}
      <div className="schema-canvas__annotation-actions">
        <button
          type="button"
          aria-label="Duplicate annotation"
          title="Duplicate (⌘/Ctrl+D)"
          onClick={onDuplicate}
        >
          <ActionIcon kind="duplicate" />
        </button>
        <button
          type="button"
          className="schema-canvas__danger"
          aria-label={labels.deleteAnnotation}
          title={labels.deleteAnnotation}
          onClick={onDelete}
        >
          <ActionIcon kind="delete" />
        </button>
      </div>
    </Editor>
  );
}

function Editor({
  title,
  labels,
  onClose,
  children,
}: {
  title: string;
  labels: SchemaCanvasLabels;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <aside className="schema-canvas__editor">
      <header>
        <strong>{title}</strong>
        <button type="button" aria-label={labels.closeEditor} onClick={onClose}>
          ×
        </button>
      </header>
      <div className="schema-canvas__editor-body">{children}</div>
    </aside>
  );
}

function TextField({
  label,
  value,
  multiline = false,
  onChange,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="schema-canvas__form-field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="schema-canvas__form-field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}

function ChoiceField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string, ReactNode]>;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="schema-canvas__choice-field">
      <legend>{label}</legend>
      <div className="schema-canvas__choice-grid">
        {options.map(([option, optionLabel, preview]) => (
          <button
            key={option}
            type="button"
            aria-label={optionLabel}
            title={optionLabel}
            aria-pressed={value === option}
            className={
              value === option ? "schema-canvas__choice--active" : undefined
            }
            onClick={() => onChange(option)}
          >
            {preview}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function HistoryIcon({ direction }: { direction: "undo" | "redo" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {direction === "undo" ? (
        <path d="M8 7 4 11l4 4M4 11h10a6 6 0 0 1 0 12" />
      ) : (
        <path d="m16 7 4 4-4 4m4-4H10a6 6 0 0 0 0 12" />
      )}
    </svg>
  );
}

function ActionIcon({ kind }: { kind: "duplicate" | "delete" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {kind === "duplicate" ? (
        <>
          <rect x="8" y="8" width="11" height="11" rx="2" />
          <path d="M5 16H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </>
      ) : (
        <>
          <path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 10v7m4-7v7" />
        </>
      )}
    </svg>
  );
}

function AppearancePalette({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: SchemaTableAppearance;
  options: ReadonlyArray<readonly [SchemaTableAppearance, string]>;
  onChange: (value: SchemaTableAppearance) => void;
}) {
  return (
    <fieldset className="schema-canvas__choice-field">
      <legend>{label}</legend>
      <div className="schema-canvas__appearance-palette">
        {options.map(([appearance, name]) => (
          <button
            key={appearance}
            type="button"
            aria-label={name}
            title={name}
            aria-pressed={value === appearance}
            className={
              value === appearance ? "schema-canvas__palette-active" : undefined
            }
            onClick={() => onChange(appearance)}
          >
            <AppearanceSwatch appearance={appearance} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function AppearanceSwatch({
  appearance = "standard",
}: {
  appearance?: SchemaTableAppearance;
}) {
  return (
    <span
      className={`schema-canvas__appearance-swatch schema-canvas__appearance-swatch--${appearance}`}
      aria-hidden="true"
    >
      <span />
    </span>
  );
}

function FieldDensityIcon({ full = false }: { full?: boolean }) {
  return (
    <span className="schema-canvas__density-icon" aria-hidden="true">
      <i />
      <i />
      {full ? <i /> : null}
    </span>
  );
}

function RouteIcon({ elbow = false }: { elbow?: boolean }) {
  return (
    <svg viewBox="0 0 24 16" aria-hidden="true">
      {elbow ? <path d="M2 3h9v10h10" /> : <path d="M2 8h19" />}
      <path d="m17 5 4 3-4 3" />
    </svg>
  );
}

function ColorSwatch({ color }: { color: SchemaAnnotationColor }) {
  return (
    <span
      className={`schema-canvas__color-swatch schema-canvas__color-swatch--${color}`}
      aria-hidden="true"
    />
  );
}

function AnnotationActionIcon({ kind }: { kind: SchemaAnnotationKind }) {
  const path =
    kind === "frame"
      ? "M4 4h16v16H4z"
      : kind === "note"
        ? "M5 3h14v14l-4 4H5zM15 17h4"
        : kind === "text"
          ? "M5 5h14M12 5v14M8 19h8"
          : "M4 5h16v14H4zM7 15l3-3 3 3 2-2 3 3M9 9h.01";
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function edgeEditorRoute(
  edge: SchemaEdge,
  layout: SchemaLayout,
  canvasEdges: readonly CanvasEdge[],
): SchemaEdgeLayout {
  const persisted = getSchemaEdgeLayout(layout, edge);
  const canvasEdge = canvasEdges.find((candidate) => candidate.id === edge.id);
  return {
    ...persisted,
    route: persisted?.route ?? canvasEdge?.type ?? "straight",
    source:
      persisted?.source ??
      portSideFromHandle(canvasEdge?.sourceHandle, "source") ??
      "right",
    target:
      persisted?.target ??
      portSideFromHandle(canvasEdge?.targetHandle, "target") ??
      "left",
  };
}

function CheckField({
  label,
  icon,
  checked,
  onChange,
}: {
  label: string;
  icon?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="schema-canvas__check-field">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {icon ? <span className="schema-canvas__check-icon">{icon}</span> : null}
      <span>{label}</span>
    </label>
  );
}

function EditorIcon({
  kind,
}: {
  kind: "outgoing" | "incoming" | "muted" | "hidden" | "restore";
}) {
  const paths = {
    outgoing: "M4 12h14m-4-4 4 4-4 4",
    incoming: "M20 12H6m4-4-4 4 4 4",
    muted: "M4 12h16M7 8l-3 4 3 4M17 8l3 4-3 4",
    hidden: "M3 12s3-5 9-5 9 5 9 5-3 5-9 5-9-5-9-5Zm9-2v4",
    restore: "M4 7v5h5M5 12a7 7 0 1 0 2-5",
  } as const;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[kind]} />
    </svg>
  );
}

function SaveStatus({
  state,
  writable,
  labels,
}: {
  state: SaveState;
  writable: boolean;
  labels: SchemaCanvasLabels;
}) {
  const value = !writable
    ? labels.readOnly
    : state.status === "saving"
      ? labels.saving
      : state.status === "saved"
        ? labels.saved
        : state.status === "error"
          ? `${labels.saveFailed}: ${state.error.message}`
          : "";
  return (
    <output
      className={`schema-canvas__save-status schema-canvas__save-status--${state.status}`}
      aria-live="polite"
    >
      {value}
    </output>
  );
}

function mergeSaveStates(left: SaveState, right: SaveState): SaveState {
  if (left.status === "error") return left;
  if (right.status === "error") return right;
  if (left.status === "saving" || right.status === "saving") {
    return { status: "saving" };
  }
  if (left.status === "saved" || right.status === "saved") {
    return { status: "saved" };
  }
  return { status: "idle" };
}

function hydrateImages(
  annotations: readonly SchemaAnnotation[],
  resolveImage: ((asset: string) => string | undefined) | undefined,
  gridSize: number,
) {
  const parsed = new Map(
    parseSchemaAnnotations(annotations, { gridSize }).map((annotation) => [
      annotation.id,
      annotation,
    ]),
  );
  return annotations.map((input) => {
    const annotation = parsed.get(input.id)!;
    if (annotation.kind !== "image" || annotation.src || !annotation.asset) {
      return annotation;
    }
    const src = resolveImage?.(annotation.asset);
    return src ? { ...annotation, src } : annotation;
  });
}

function stripResolvedImages(annotations: readonly SchemaAnnotation[]) {
  return annotations.map(({ src: _src, ...annotation }) => annotation);
}

function snap(value: number, gridSize: number) {
  return Math.round(value / gridSize) * gridSize;
}

function uniqueId(kind: SchemaAnnotationKind) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${kind}-${suffix}`;
}
