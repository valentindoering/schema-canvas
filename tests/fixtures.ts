import type { SchemaGraph, SchemaLayout } from "../src/core/index.js";

export const graph: SchemaGraph = {
  tables: [
    {
      id: "accounts",
      label: "Accounts",
      fields: [
        {
          name: "id",
          type: "id<accounts>",
          optional: false,
          primaryKey: true,
          foreignKeyTargets: [],
        },
        {
          name: "name",
          type: "string",
          optional: false,
          foreignKeyTargets: [],
        },
      ],
    },
    {
      id: "projects",
      label: "Projects",
      fields: [
        {
          name: "id",
          type: "id<projects>",
          optional: false,
          primaryKey: true,
          foreignKeyTargets: [],
        },
        {
          name: "accountId",
          type: "id<accounts>",
          optional: false,
          foreignKeyTargets: ["accounts"],
        },
      ],
    },
  ],
  edges: [
    {
      id: "edge-projects.accountId.accounts",
      source: "projects",
      target: "accounts",
      field: "accountId",
      optional: false,
    },
  ],
  warnings: [],
};

export const layout: SchemaLayout = {
  accounts: { x: 400, y: 0 },
  projects: { x: 0, y: 0 },
};
