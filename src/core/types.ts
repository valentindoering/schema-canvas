export type SchemaMetadataValue =
  | string
  | number
  | boolean
  | null
  | readonly SchemaMetadataValue[]
  | { readonly [key: string]: SchemaMetadataValue };

export type SchemaField = {
  name: string;
  type: string;
  optional: boolean;
  primaryKey?: boolean;
  foreignKeyTargets: string[];
  arrowsDisabled?: boolean;
  variants?: string[];
  discriminatedUnion?: SchemaDiscriminatedUnion;
  metadata?: Readonly<Record<string, SchemaMetadataValue>>;
};

export type SchemaDiscriminatedUnion = {
  discriminator: string;
  variants: Array<{
    discriminatorValue: string;
    fields: SchemaField[];
  }>;
};

export type SchemaTable = {
  id: string;
  label: string;
  fields: SchemaField[];
  group?: string;
  external?: boolean;
  metadata?: Readonly<Record<string, SchemaMetadataValue>>;
};

export type SchemaEdge = {
  id: string;
  source: string;
  target: string;
  field: string;
  optional: boolean;
  sourceFields?: string[];
  targetFields?: string[];
  metadata?: Readonly<Record<string, SchemaMetadataValue>>;
};

export type SchemaGraph = {
  tables: SchemaTable[];
  edges: SchemaEdge[];
  warnings: string[];
};

export type SchemaPortSide =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type SchemaEdgeRouteMode = "straight" | "smoothstep";
export type SchemaTableAppearance = "standard" | "quiet" | "highlighted";
export type SchemaTableFieldDisplay = "all" | "concise";
export type SchemaEdgeStrokeStyle = "solid" | "dashed" | "dotted";

export type SchemaEdgeLayout = {
  targetTable?: string;
  source?: SchemaPortSide;
  target?: SchemaPortSide;
  route?: SchemaEdgeRouteMode;
  hidden?: boolean;
  muted?: boolean;
  shift?: {
    direction: "left" | "right" | "up" | "down";
    amount: number;
  };
  style?: SchemaEdgeStrokeStyle;
};

export type SchemaTableLayout = {
  x: number;
  y: number;
  appearance?: SchemaTableAppearance;
  fieldDisplay?: SchemaTableFieldDisplay;
  highlightedFields?: string[];
  hideArrows?: boolean;
  hideIncomingArrows?: boolean;
  hideMutedIncomingArrows?: boolean;
  foreignKeys?: Record<string, SchemaEdgeLayout>;
};

export type SchemaLayout = Record<string, SchemaTableLayout>;

export type SchemaAnnotationKind = "frame" | "note" | "text" | "image";
export type SchemaAnnotationColor = "slate" | "blue" | "emerald" | "amber";

export type SchemaAnnotation = {
  id: string;
  kind: SchemaAnnotationKind;
  label: string;
  text?: string;
  asset?: string;
  src?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: SchemaAnnotationColor;
  fontSize?: number;
};

export type SchemaView = {
  id: string;
  label: string;
  tableIds: string[];
  edgeIds: string[];
};

export type SaveRequest<T> = {
  value: T;
  expectedRevision?: string;
};

export type SaveResponse<T> = {
  value?: T;
  revision?: string;
};

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; error: Error };

export type LayoutValidationOptions = {
  gridSize?: number;
  allowUnknownTables?: boolean;
  defaultFieldDisplay?:
    SchemaTableFieldDisplay | ((table: SchemaTable) => SchemaTableFieldDisplay);
};
