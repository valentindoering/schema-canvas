import type { CSSProperties, ReactNode, Ref } from "react";
import type { CanvasProposalReviewControls } from "./canvas-proposal-inbox.js";

import type {
  CanvasContext,
  CanvasContextQuery,
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
  sourceTable: string;
  targetTable: string;
  goToTable: string;
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
  editorLoading: string;
  editorLoadFailed: string;
  markdownSource: string;
  writeFormatted: string;
  source: string;
  expandEditor: string;
  collapseEditor: string;
  expand: string;
  doneEditing: string;
  markdownSourceOnly: string;
  formatting: string;
  textStyle: string;
  paragraph: string;
  heading: string;
  bold: string;
  italic: string;
  bulletList: string;
  orderedList: string;
  list: string;
  inlineCode: string;
  link: string;
  linkUrl: string;
  applyLink: string;
  removeLink: string;
  invalidLink: string;

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
  aiContext: string;
  closeContext: string;
  contextExplanation: string;
  downloadMarkdown: string;
  downloadJson: string;
  downloadDiagram: string;
  contextDiagram: string;
  contextText: string;
  loadingContext: string;
  reviewSuggestions: string;
  closeReview: string;
  reviewUnsaved: string;
  backToSuggestions: string;
  proposedBy: string;
  /** Lead-in of the stale warning, e.g. "Out of date." */
  staleTitle: string;
  staleProposal: string;
  /** Button on a stale suggestion that asks its agent to propose again on the current text. */
  requestRebase: string;
  /** Followed by the agent's name once a rebase was requested. */
  rebaseRequested: string;
  reviewPreview: string;
  reviewChanges: string;
  reviewCanvas: string;
  beforeChange: string;
  afterChange: string;
  reviewConfirmation: string;
  rejectSuggestion: string;
  applyReviewedChanges: string;
  reviewWorking: string;
  /** Shown on a change whose Markdown was combined with newer human edits. */
  reviewMerged: string;
  savingDecline: string;
  savingAcceptance: string;
  noPendingSuggestions: string;
  reviewDocumentation: string;
  reviewKind: string;
  reviewUpdateDocumentation: string;
  reviewMoveTable: string;
  reviewChangeAppearance: string;
  reviewChangeArrow: string;
  reviewAddAnnotation: string;
  reviewUpdateAnnotation: string;
  reviewDeleteAnnotation: string;
  reviewDiagramNotice: string;
  reviewVisible: string;
  collapseSuggestions: string;
  expandSuggestions: string;
  goToSuggestion: string;
  reviewReason: string;
  reviewPosition: string;
  reviewSize: string;
  reviewRetry: string;
  reviewUnchangedLines: string;
};

export type SchemaCanvasFeatures = {
  contextExport: boolean;
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
  /** The host supplies pending proposals and authenticated human review callbacks. */
  proposalReview?: CanvasProposalReviewControls;
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
  /** Read a snapshot of current documentation and resolved spatial bounds; never saves. */
  getContext(query?: CanvasContextQuery): Promise<CanvasContext>;
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
  sourceTable: "Source table",
  targetTable: "Target table",
  goToTable: "Go to table",
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
  editorLoading: "Loading editor…",
  editorLoadFailed:
    "The formatted editor could not load. You can still edit the Markdown source.",
  markdownSource: "Markdown source",
  writeFormatted: "Write",
  source: "Source",
  expandEditor: "Expand editor",
  collapseEditor: "Collapse editor",
  expand: "Expand",
  doneEditing: "Done",
  markdownSourceOnly: "This content uses formatting available in Source mode.",
  formatting: "Text formatting",
  textStyle: "Text style",
  paragraph: "Text",
  heading: "Heading",
  bold: "Bold",
  italic: "Italic",
  bulletList: "Bulleted list",
  orderedList: "Numbered list",
  list: "List",
  inlineCode: "Inline code",
  link: "Link",
  linkUrl: "Link URL",
  applyLink: "Apply",
  removeLink: "Remove",
  invalidLink: "Enter a web address, email, phone number, or relative link.",

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
  aiContext: "AI context",
  closeContext: "Close context",
  contextExplanation:
    "A read-only snapshot with documentation, spatial observations, and an optional matching diagram.",
  downloadMarkdown: "Markdown",
  downloadJson: "JSON",
  downloadDiagram: "Diagram (SVG)",
  contextDiagram: "Matching diagram",
  contextText: "Canvas context text",
  loadingContext: "Preparing context…",
  reviewSuggestions: "Suggestions",
  closeReview: "Close review",
  reviewUnsaved: "Finish saving your edits before deciding a suggestion.",
  backToSuggestions: "All suggestions",
  proposedBy: "Proposed by",
  staleTitle: "Out of date.",
  staleProposal:
    "The same lines were edited by hand since this suggestion, so it can no longer be applied. Decline it, or ask the agent to redo it on the current text.",
  requestRebase: "Ask agent to rebase",
  rebaseRequested: "Rebase on the current text requested from",
  reviewPreview: "Preview",
  reviewChanges: "Changes",
  reviewCanvas: "Canvas",
  beforeChange: "Before",
  afterChange: "After",
  reviewConfirmation: "Only Accept updates the live documentation.",
  rejectSuggestion: "Decline",
  applyReviewedChanges: "Accept",
  reviewWorking: "Working…",
  reviewMerged:
    "Combined with edits made after this suggestion. Your lines are kept; the diff shows only the suggested change.",
  savingDecline: "Declining",
  savingAcceptance: "Applying",
  noPendingSuggestions: "No suggestions awaiting review.",
  reviewDocumentation: "Documentation",
  reviewKind: "Type",
  reviewUpdateDocumentation: "Update documentation",
  reviewMoveTable: "Move table",
  reviewChangeAppearance: "Change appearance",
  reviewChangeArrow: "Change arrow",
  reviewAddAnnotation: "Add annotation",
  reviewUpdateAnnotation: "Update annotation",
  reviewDeleteAnnotation: "Delete annotation",
  reviewDiagramNotice:
    "Focused schematic with estimated sizes. Objects are arranged for this preview; the live canvas is unchanged.",
  reviewVisible: "Visible",
  collapseSuggestions: "Collapse suggestions",
  expandSuggestions: "Expand suggestions",
  goToSuggestion: "Go to",
  reviewReason: "Why this change?",
  reviewPosition: "Position",
  reviewSize: "Size",
  reviewRetry: "Refresh review",
  reviewUnchangedLines: "unchanged lines",
};

export const defaultSchemaCanvasFeatures: SchemaCanvasFeatures = {
  contextExport: true,
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
