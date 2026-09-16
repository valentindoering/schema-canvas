import { parseSchemaAnnotations } from "@valentindoering/schema-canvas/core";
import { SchemaCanvas } from "@valentindoering/schema-canvas/react";
import { parseConvexSchema } from "@valentindoering/schema-canvas/server/convex";
import { createJsonStore } from "@valentindoering/schema-canvas/server/json-store";
import { checkSchemaLayout } from "@valentindoering/schema-canvas/server/layout";
import { parsePostgresSchema } from "@valentindoering/schema-canvas/server/postgres";

const graph = parsePostgresSchema(
  "CREATE TABLE public.accounts (id uuid PRIMARY KEY);",
);
const layout = checkSchemaLayout({}, graph).layout;
parseSchemaAnnotations([]);

export const adapters = { parseConvexSchema, createJsonStore };

export const canvas = (
  <SchemaCanvas graph={graph} layout={layout} writable={false} />
);
