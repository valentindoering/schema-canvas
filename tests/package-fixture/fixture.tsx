import { parseSchemaAnnotations } from "schema-canvas/core";
import { createRef } from "react";
import {
  SchemaCanvas,
  type SchemaCanvasHandle,
  type SchemaCanvasSaveState,
} from "schema-canvas/react";
import { parseConvexSchema } from "schema-canvas/server/convex";
import { createJsonStore } from "schema-canvas/server/json-store";
import { checkSchemaLayout } from "schema-canvas/server/layout";
import { parsePostgresSchema } from "schema-canvas/server/postgres";

const graph = parsePostgresSchema(
  "CREATE TABLE public.accounts (id uuid PRIMARY KEY);",
);
const layout = checkSchemaLayout({}, graph).layout;
parseSchemaAnnotations([]);

export const adapters = { parseConvexSchema, createJsonStore };

export const canvas = (
  <SchemaCanvas
    ref={createRef<SchemaCanvasHandle>()}
    graph={graph}
    layout={layout}
    writable={false}
    onSaveStateChange={(state: SchemaCanvasSaveState) => {
      void state.dirty;
    }}
  />
);
