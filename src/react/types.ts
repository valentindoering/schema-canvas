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

export type SchemaCanvasTheme = "light" | "dark";

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
  paletteSlate: string;
  paletteBlue: string;
  paletteTeal: string;
  paletteAmber: string;
  paletteRose: string;
  paletteViolet: string;
  tableMarkdown: string;
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
  edgeTone: string;
  toneAuto: string;
  toneDark: string;
  toneMuted: string;
  label: string;
  text: string;
  note: string;
  markdown: string;
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
  canvasActions: string;
  switchToDarkTheme: string;
  switchToLightTheme: string;
  multiSelectHint: string;
  searchTables: string;
  closeSearch: string;
  noMatchingTables: string;
  viewDefinition: string;
  definitionLoading: string;
  definitionFailed: string;
  closeDefinition: string;
};

export type SchemaCanvasFeatures = {
  canvasToolbar: boolean;
  themeToggle: boolean;
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
  /** Controlled color theme. Supply onThemeChange to keep the built-in switch active. */
  theme?: SchemaCanvasTheme;
  /** Initial theme when theme is uncontrolled; defaults to light. */
  defaultTheme?: SchemaCanvasTheme;
  onThemeChange?: (theme: SchemaCanvasTheme) => void;
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
  /** The host loads source text after the user asks to inspect a table. */
  onLoadTableDefinition?: (
    table: SchemaTable,
  ) =>
    | Promise<{ path: string; source: string }>
    | { path: string; source: string };
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
  paletteSlate: "Slate",
  paletteBlue: "Blue",
  paletteTeal: "Teal",
  paletteAmber: "Amber",
  paletteRose: "Rose",
  paletteViolet: "Violet",
  tableMarkdown: "Table Markdown",
  fields: "Fields",
  full: "Show all attributes",
  concise: "Show key attributes",
  showMore: "Show more",
  showLess: "Show less",
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
  edgeTone: "Arrow color",
  toneAuto: "Automatic color",
  toneDark: "Keep dark",
  toneMuted: "Keep gray",
  label: "Label",
  text: "Text",
  note: "Note",
  markdown: "Markdown",
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
  canvasActions: "Canvas actions",
  switchToDarkTheme: "Switch to dark mode",
  switchToLightTheme: "Switch to light mode",
  multiSelectHint: "Click to select more",
  searchTables: "Search tables",
  closeSearch: "Close search",
  noMatchingTables: "No matching tables",
  viewDefinition: "View definition",
  definitionLoading: "Loading definition…",
  definitionFailed: "Could not load definition",
  closeDefinition: "Close definition",
};

export const defaultSchemaCanvasFeatures: SchemaCanvasFeatures = {
  canvasToolbar: false,
  themeToggle: true,
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
