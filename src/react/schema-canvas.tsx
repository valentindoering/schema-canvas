import {
  Background,
  BackgroundVariant,
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
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";

import {
  allSchemaView,
  createSaveQueue,
  getSchemaEdgeLayout,
  setSchemaEdgeLayout,
  type SaveQueue,
  type SaveState,
  type SchemaAnnotation,
  type SchemaAnnotationColor,
  type SchemaAnnotationKind,
  type SchemaEdge,
  type SchemaEdgeLayout,
  type SchemaLayout,
  type SchemaPortSide,
  type SchemaTableLayout,
} from "../core/index.js";
import {
  buildCanvasModel,
  portSideFromHandle,
  type CanvasEdge,
  type CanvasNode,
} from "./model.js";
import { SchemaAnnotationNode, SchemaTableNode } from "./nodes.js";
import {
  defaultSchemaCanvasFeatures,
  defaultSchemaCanvasLabels,
  type SchemaCanvasLabels,
  type SchemaCanvasProps,
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
    hydrateImages(annotationsProp, resolveImage),
  );
  const [expandedTableIds, setExpandedTableIds] = useState<Set<string>>(
    new Set(),
  );
  const [nodeDimensions, setNodeDimensions] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    initialTableId ?? null,
  );
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [layoutSaveState, enqueueLayout] = useSaveChannel(
    writable ? onSaveLayout : undefined,
    layoutRevision,
  );
  const [annotationSaveState, enqueueAnnotations] = useSaveChannel(
    writable ? onSaveAnnotations : undefined,
    annotationRevision,
  );
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

  useEffect(() => setLayout(layoutProp), [layoutProp]);
  useEffect(
    () => setAnnotations(hydrateImages(annotationsProp, resolveImage)),
    [annotationsProp, resolveImage],
  );

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
      setAnnotations((current) => {
        const next = current.map((annotation) =>
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
        enqueueAnnotations(stripResolvedImages(next));
        return next;
      });
    },
    [enqueueAnnotations, gridSize],
  );

  const model = useMemo(
    () =>
      (() => {
        const next = buildCanvasModel(graph, layout, annotations, {
          view: selectedView,
          selectedNodeId,
          selectedEdgeId,
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
      selectedNodeId,
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

  const updateLayout = useCallback(
    (recipe: (current: SchemaLayout) => SchemaLayout, save = true) => {
      setLayout((current) => {
        const next = recipe(current);
        if (save) enqueueLayout(next);
        return next;
      });
    },
    [enqueueLayout],
  );

  const updateAnnotations = useCallback(
    (
      recipe: (current: SchemaAnnotation[]) => SchemaAnnotation[],
      save = true,
    ) => {
      setAnnotations((current) => {
        const next = hydrateImages(recipe(current), resolveImage);
        if (save) enqueueAnnotations(stripResolvedImages(next));
        return next;
      });
    },
    [enqueueAnnotations, resolveImage],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
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
        if (change.type === "position" && change.position) {
          const save = change.dragging === false;
          if (change.id.startsWith("annotation:")) {
            const id = change.id.slice("annotation:".length);
            updateAnnotations(
              (current) =>
                current.map((annotation) =>
                  annotation.id === id
                    ? {
                        ...annotation,
                        x: snap(change.position?.x ?? annotation.x, gridSize),
                        y: snap(change.position?.y ?? annotation.y, gridSize),
                      }
                    : annotation,
                ),
              save,
            );
          } else {
            updateLayout(
              (current) => ({
                ...current,
                [change.id]: {
                  ...(current[change.id] ?? { x: 0, y: 0 }),
                  x: snap(change.position?.x ?? 0, gridSize),
                  y: snap(change.position?.y ?? 0, gridSize),
                },
              }),
              save,
            );
          }
        }
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
    (_event, node) => {
      setSelectedNodeId(node.id);
      setSelectedEdgeId(null);
      onSelectedTableChange?.(node.type === "schemaTable" ? node.id : null);
    },
    [onSelectedTableChange],
  );
  const onEdgeClick: EdgeMouseHandler<CanvasEdge> = useCallback(
    (_event, edge) => {
      if (!writable) return;
      setSelectedEdgeId(edge.id);
      setSelectedNodeId(null);
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
      updateLayout((current) =>
        setSchemaEdgeLayout(
          withTablePosition(current, schemaEdge.source),
          schemaEdge,
          {
            ...(getSchemaEdgeLayout(current, schemaEdge) ?? {}),
            source,
            target,
          },
        ),
      );
    },
    [updateLayout, writable, withTablePosition],
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
        label,
        x: snap(center.x - 160, gridSize),
        y: snap(center.y - 100, gridSize),
        width: kind === "frame" ? 640 : 320,
        height: kind === "frame" ? 400 : 200,
        color: "slate",
        ...(kind === "text" ? { fontSize: 32 } : {}),
        ...extra,
      };
      updateAnnotations((current) => [...current, annotation]);
      setSelectedNodeId(`annotation:${annotation.id}`);
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

  return (
    <section
      className={["schema-canvas", className].filter(Boolean).join(" ")}
      style={style}
      aria-label={labels.canvasLabel}
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

      {features.unpositionedTray && model.unpositionedTableIds.length ? (
        <aside className="schema-canvas__tray">
          <strong>{labels.unpositionedTables}</strong>
          {model.unpositionedTableIds.map((tableId) => (
            <button
              key={tableId}
              type="button"
              onClick={() => {
                setSelectedNodeId(tableId);
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
        onInit={setReactFlow}
        nodes={model.nodes}
        edges={model.edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onReconnect={onReconnect}
        onPaneClick={() => {
          setSelectedNodeId(null);
          setSelectedEdgeId(null);
          onSelectedTableChange?.(null);
        }}
        snapToGrid
        snapGrid={[gridSize, gridSize]}
        nodesDraggable={writable}
        nodesConnectable={writable}
        edgesReconnectable={writable}
        reconnectRadius={10}
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
        multiSelectionKeyCode={["Meta", "Control"]}
        minZoom={0.08}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        panOnScroll
        selectionKeyCode="Shift"
        zoomOnScroll={false}
        zoomOnPinch
        elevateNodesOnSelect={false}
        aria-label={labels.canvasLabel}
      >
        {features.background ? (
          <Background
            variant={BackgroundVariant.Dots}
            gap={gridSize}
            size={1}
          />
        ) : null}
        {features.minimap ? <MiniMap pannable zoomable /> : null}
        {features.navigationControls ? (
          <Controls position="top-left" showInteractive={false} />
        ) : null}
      </ReactFlow>

      {features.annotations && writable && !features.canvasToolbar ? (
        <div
          className="schema-canvas__add-menu"
          role="toolbar"
          aria-label={labels.add}
        >
          <button type="button" onClick={() => addAnnotation("frame")}>
            <AnnotationActionIcon kind="frame" />
            <span>{labels.addFrame}</span>
          </button>
          <button type="button" onClick={() => addAnnotation("note")}>
            <AnnotationActionIcon kind="note" />
            <span>{labels.addNote}</span>
          </button>
          <button type="button" onClick={() => addAnnotation("text")}>
            <AnnotationActionIcon kind="text" />
            <span>{labels.addText}</span>
          </button>
          {features.imageAnnotations && onUploadImage ? (
            <button type="button" onClick={() => fileInput.current?.click()}>
              <AnnotationActionIcon kind="image" />
              <span>{labels.addImage}</span>
            </button>
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
          onChange={(change) =>
            updateLayout((current) => ({
              ...current,
              [selectedTable.id]: {
                ...withTablePosition(current, selectedTable.id)[
                  selectedTable.id
                ]!,
                ...change,
              },
            }))
          }
          onClose={() => setSelectedNodeId(null)}
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
          onClose={() => setSelectedEdgeId(null)}
        />
      ) : null}
      {writable && selectedAnnotation && features.annotations ? (
        <AnnotationEditor
          annotation={selectedAnnotation}
          labels={labels}
          onUploadImage={onUploadImage}
          onChange={(change) =>
            updateAnnotations((current) =>
              current.map((annotation) =>
                annotation.id === selectedAnnotation.id
                  ? { ...annotation, ...change }
                  : annotation,
              ),
            )
          }
          onDelete={() => {
            updateAnnotations((current) =>
              current.filter(
                (annotation) => annotation.id !== selectedAnnotation.id,
              ),
            );
            setSelectedNodeId(null);
          }}
          onClose={() => setSelectedNodeId(null)}
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
) {
  const [state, setState] = useState<SaveState>({ status: "idle" });
  const queue = useRef<SaveQueue<T> | null>(null);
  useEffect(() => {
    queue.current?.dispose();
    queue.current = save
      ? createSaveQueue({
          save,
          ...(revision === undefined ? {} : { revision }),
          onStateChange: setState,
        })
      : null;
    return () => queue.current?.dispose();
  }, [revision, save]);
  const enqueue = useCallback((value: T) => queue.current?.enqueue(value), []);
  return [state, enqueue] as const;
}

function TableEditor({
  tableLabel,
  fields,
  entry,
  labels,
  onShowAllEdges,
  details,
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
  onChange: (change: Partial<SchemaTableLayout>) => void;
  onClose: () => void;
}) {
  const highlighted = new Set(entry.highlightedFields ?? []);
  return (
    <Editor title={tableLabel} labels={labels} onClose={onClose}>
      <ChoiceField
        label={labels.appearance}
        value={entry.appearance ?? "standard"}
        options={[
          ["standard", labels.standard, <AppearanceSwatch key="standard" />],
          [
            "quiet",
            labels.quiet,
            <AppearanceSwatch key="quiet" appearance="quiet" />,
          ],
          [
            "highlighted",
            labels.highlighted,
            <AppearanceSwatch key="highlighted" appearance="highlighted" />,
          ],
        ]}
        onChange={(appearance) =>
          onChange({
            appearance: appearance as NonNullable<
              SchemaTableLayout["appearance"]
            >,
          })
        }
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
      {details ? (
        <div className="schema-canvas__table-details">{details}</div>
      ) : null}
    </Editor>
  );
}

function EdgeEditor({
  edgeLabel,
  route,
  labels,
  onChange,
  onClose,
}: {
  edgeLabel: string;
  route: SchemaEdgeLayout;
  labels: SchemaCanvasLabels;
  onChange: (change: Partial<SchemaEdgeLayout>) => void;
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
      <div className="schema-canvas__port-pickers">
        <PortPicker
          label={labels.sourcePort}
          value={route.source ?? "right"}
          labels={labels}
          onChange={(source) => onChange({ source })}
        />
        <PortPicker
          label={labels.targetPort}
          value={route.target ?? "left"}
          labels={labels}
          onChange={(target) => onChange({ target })}
        />
      </div>
      <CheckField
        label={labels.hidden}
        icon={<EditorIcon kind="hidden" />}
        checked={route.hidden === true}
        onChange={(hidden) => onChange({ hidden })}
      />
      <CheckField
        label={labels.muted}
        icon={<EditorIcon kind="muted" />}
        checked={route.muted === true}
        onChange={(muted) => onChange({ muted })}
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
  onClose,
}: {
  annotation: SchemaAnnotation;
  labels: SchemaCanvasLabels;
  onUploadImage: SchemaCanvasProps["onUploadImage"];
  onChange: (change: Partial<SchemaAnnotation>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  return (
    <Editor title={annotation.label} labels={labels} onClose={onClose}>
      <TextField
        label={labels.label}
        value={annotation.label}
        onChange={(label) => onChange({ label })}
      />
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
          label={labels.text}
          value={annotation.text ?? ""}
          multiline
          onChange={(text) => onChange({ text })}
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
      <button
        type="button"
        className="schema-canvas__danger"
        onClick={onDelete}
      >
        {labels.deleteAnnotation}
      </button>
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
            aria-pressed={value === option}
            className={
              value === option ? "schema-canvas__choice--active" : undefined
            }
            onClick={() => onChange(option)}
          >
            {preview}
            <span>{optionLabel}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function PortPicker({
  label,
  value,
  labels,
  onChange,
}: {
  label: string;
  value: SchemaPortSide;
  labels: SchemaCanvasLabels;
  onChange: (value: SchemaPortSide) => void;
}) {
  return (
    <fieldset className="schema-canvas__port-picker">
      <legend>{label}</legend>
      <div className="schema-canvas__port-grid">
        {portGrid.map((side, index) =>
          side ? (
            <button
              key={side}
              type="button"
              title={`${label}: ${portLabel(side, labels)}`}
              aria-label={`${label}: ${portLabel(side, labels)}`}
              aria-pressed={value === side}
              className={
                value === side ? "schema-canvas__choice--active" : undefined
              }
              onClick={() => onChange(side)}
            >
              <span
                className={`schema-canvas__port-dot schema-canvas__port-dot--${side}`}
              />
            </button>
          ) : (
            <span
              key={`center-${index}`}
              className="schema-canvas__port-center"
              aria-hidden="true"
            />
          ),
        )}
      </div>
    </fieldset>
  );
}

function AppearanceSwatch({
  appearance = "standard",
}: {
  appearance?: "standard" | "quiet" | "highlighted";
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

function portLabel(side: SchemaPortSide, labels: SchemaCanvasLabels) {
  const values: Record<SchemaPortSide, string> = {
    top: labels.top,
    right: labels.right,
    bottom: labels.bottom,
    left: labels.left,
    "top-left": labels.topLeft,
    "top-right": labels.topRight,
    "bottom-left": labels.bottomLeft,
    "bottom-right": labels.bottomRight,
  };
  return values[side];
}

const portGrid: Array<SchemaPortSide | null> = [
  "top-left",
  "top",
  "top-right",
  "left",
  null,
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
];

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
) {
  return annotations.map((annotation) => {
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
