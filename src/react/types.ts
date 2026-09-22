import type { CSSProperties, ReactNode, Ref } from "react";

import type {
  SaveRequest,
  SaveResponse,
  SaveQueueSnapshot,
  SchemaAnnotation,
  SchemaGraph,
  SchemaLayout,
  SchemaTable,
  SchemaTableFieldDisplay,
  SchemaView,
} from "../core/index.js";

export type SchemaCanvasLabels = {
  add: string;
  view: string;
  fit: string;
  arrange: string;
  showAllEdges: string;
  addFrame: string;
  addNote: string;
  addText: string;
  addImage: string;
  unpositionedTables: string;
  saving: string;
  saved: string;
  readOnly: string;
  saveFailed: string;
  appearance: string;
  standard: string;
  quiet: string;
  highlighted: string;
  fields: string;
  full: string;
  concise: string;
  showMore: string;
  showLess: string;
  highlightField: string;
  hideOutgoing: string;
  hideIncoming: string;
  hideMutedIncoming: string;
  route: string;
  straight: string;
  elbow: string;
  sourcePort: string;
  targetPort: string;
  top: string;
  right: string;
  bottom: string;
  left: string;
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  hidden: string;
  muted: string;
  label: string;
  text: string;
  color: string;
  slate: string;
  blue: string;
  emerald: string;
  amber: string;
  width: string;
  height: string;
  fontSize: string;
  uploadImage: string;
  deleteAnnotation: string;
  closeEditor: string;
  canvasLabel: string;
};

export type SchemaCanvasFeatures = {
  canvasToolbar: boolean;
  navigationControls: boolean;
  minimap: boolean;
  background: boolean;
  autoLayout: boolean;
  annotations: boolean;
  imageAnnotations: boolean;
  edgeEditor: boolean;
  tableEditor: boolean;
  unpositionedTray: boolean;
};

export type SchemaCanvasProps = {
  ref?: Ref<SchemaCanvasHandle>;
  /** Synchronous notification on enqueue and every save transition, even after unmount. */
  onSaveStateChange?: (state: SchemaCanvasSaveState) => void;
  graph: SchemaGraph;
  layout: SchemaLayout;
  annotations?: SchemaAnnotation[];
  views?: SchemaView[];
  writable: boolean;
  initialTableId?: string;
  layoutRevision?: string;
  annotationRevision?: string;
  labels?: Partial<SchemaCanvasLabels>;
  features?: Partial<SchemaCanvasFeatures>;
  gridSize?: number;
  conciseFieldCount?: number;
  automaticMuteDistance?: number;
  defaultFieldDisplay?:
    SchemaTableFieldDisplay | ((table: SchemaTable) => SchemaTableFieldDisplay);
  onSaveLayout?: (
    request: SaveRequest<SchemaLayout>,
  ) => Promise<SaveResponse<SchemaLayout>>;
  onSaveAnnotations?: (
    request: SaveRequest<SchemaAnnotation[]>,
  ) => Promise<SaveResponse<SchemaAnnotation[]>>;
  onUploadImage?: (file: File) => Promise<{ asset: string; src?: string }>;
  resolveImage?: (asset: string) => string | undefined;
  onSelectedTableChange?: (tableId: string | null) => void;
  renderTableDetails?: (table: SchemaTable) => ReactNode;
  className?: string;
  style?: CSSProperties;
};

export type SchemaCanvasSaveState = {
  dirty: boolean;
  pending: boolean;
  layout: SaveQueueSnapshot;
  annotations: SaveQueueSnapshot;
};

export type SchemaCanvasHandle = {
  getSaveState(): SchemaCanvasSaveState;
  /** Bypass debounce, retry failed values, and wait for both channels to settle. */
  flushSaves(): Promise<void>;
  /** Wait for both channels without retrying errors or bypassing debounce. */
  whenSavesIdle(): Promise<void>;
};

export const defaultSchemaCanvasLabels: SchemaCanvasLabels = {
  add: "Add",
  view: "View",
  fit: "Fit",
  arrange: "Arrange",
  showAllEdges: "Show all edges",
  addFrame: "Add frame",
  addNote: "Add note",
  addText: "Add text",
  addImage: "Add image",
  unpositionedTables: "New tables",
  saving: "Saving…",
  saved: "Saved",
  readOnly: "Read only",
  saveFailed: "Save failed",
  appearance: "Appearance",
  standard: "Standard",
  quiet: "Quiet",
  highlighted: "Highlighted",
  fields: "Fields",
  full: "Show all attributes",
  concise: "Show key attributes",
  showMore: "Show remaining attributes",
  showLess: "Show key attributes",
  highlightField: "Highlight field",
  hideOutgoing: "Hide outgoing edges",
  hideIncoming: "Hide incoming edges",
  hideMutedIncoming: "Hide muted incoming edges",
  route: "Route",
  straight: "Straight",
  elbow: "Elbow",
  sourcePort: "Source port",
  targetPort: "Target port",
  top: "Top",
  right: "Right",
  bottom: "Bottom",
  left: "Left",
  topLeft: "Top left",
  topRight: "Top right",
  bottomLeft: "Bottom left",
  bottomRight: "Bottom right",
  hidden: "Hidden",
  muted: "Muted",
  label: "Label",
  text: "Text",
  color: "Color",
  slate: "Slate",
  blue: "Blue",
  emerald: "Emerald",
  amber: "Amber",
  width: "Width",
  height: "Height",
  fontSize: "Font size",
  uploadImage: "Choose image",
  deleteAnnotation: "Delete annotation",
  closeEditor: "Close editor",
  canvasLabel: "Database schema canvas",
};

export const defaultSchemaCanvasFeatures: SchemaCanvasFeatures = {
  canvasToolbar: false,
  navigationControls: true,
  minimap: true,
  background: true,
  autoLayout: false,
  annotations: true,
  imageAnnotations: true,
  edgeEditor: true,
  tableEditor: true,
  unpositionedTray: false,
};
