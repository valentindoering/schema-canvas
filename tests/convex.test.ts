// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  ConvexSchemaError,
  parseConvexSchema,
  type ConvexSourceReader,
} from "../src/server/convex/index.js";

describe("Convex adapter", () => {
  it("parses split tables, validator aliases, unions, and optional relationships", () => {
    const sources = new Map([
      [
        "/schema.ts",
        `
          import { defineSchema } from "convex/server";
          import { projectTables } from "./projects";
          import { defineTable } from "convex/server";
          import { v } from "convex/values";
          export default defineSchema({
            accounts: defineTable({ name: v.string() }),
            ...projectTables,
          });
        `,
      ],
      [
        "/projects.ts",
        `
          import { defineTable } from "convex/server";
          import { v } from "convex/values";
          const accountReference = v.optional(v.id("accounts"));
          const member = v.object({ accountId: v.id("accounts") });
          export const projectTables = {
            projects: defineTable({
              accountId: accountReference,
              owner: v.union(member, v.null()),
              tags: v.array(v.string()),
            }).index("by_account", ["accountId"]),
          };
        `,
      ],
    ]);
    const graph = parseConvexSchema("/schema.ts", {
      sourceReader: reader(sources),
      tableLabel: (id) => id.toUpperCase(),
      tableGroup: () => "fictional",
    });
    expect(graph.tables.map((table) => table.id)).toEqual([
      "accounts",
      "projects",
    ]);
    expect(graph.tables[1]).toMatchObject({
      label: "PROJECTS",
      group: "fictional",
    });
    expect(graph.tables[1]?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "accountId",
          type: "id<accounts>",
          optional: true,
          foreignKeyTargets: ["accounts"],
        }),
        expect.objectContaining({
          name: "owner",
          foreignKeyTargets: ["accounts"],
        }),
      ]),
    );
    expect(graph.edges).toHaveLength(2);
  });

  it("fails when a relationship target is missing", () => {
    const sources = new Map([
      [
        "/schema.ts",
        `
          import { defineSchema, defineTable } from "convex/server";
          import { v } from "convex/values";
          export default defineSchema({
            projects: defineTable({ accountId: v.id("accounts") }),
          });
        `,
      ],
    ]);
    expect(() =>
      parseConvexSchema("/schema.ts", { sourceReader: reader(sources) }),
    ).toThrow(ConvexSchemaError);
  });

  it("supports host-declared external tables", () => {
    const sources = new Map([
      [
        "/schema.ts",
        `
          import { defineSchema, defineTable } from "convex/server";
          import { v } from "convex/values";
          export default defineSchema({
            projects: defineTable({ accountId: v.id("accounts") }),
          });
        `,
      ],
    ]);
    const graph = parseConvexSchema("/schema.ts", {
      sourceReader: reader(sources),
      externalTables: new Set(["accounts"]),
    });
    expect(graph.edges).toEqual([]);
    expect(graph.tables[0]?.fields[0]?.arrowsDisabled).toBe(true);
  });

  it("expands the public Convex Auth table module", () => {
    const sources = new Map([
      [
        "/schema.ts",
        `
          import { defineSchema } from "convex/server";
          import { authTables } from "@convex-dev/auth/server";
          export default defineSchema({ ...authTables });
        `,
      ],
    ]);
    const graph = parseConvexSchema("/schema.ts", {
      sourceReader: reader(sources),
    });
    expect(graph.tables.map((table) => table.id)).toEqual(
      expect.arrayContaining(["users", "authSessions", "authAccounts"]),
    );
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "authSessions",
          target: "users",
          field: "userId",
        }),
      ]),
    );
  });

  it("lets explicit tables override spread declarations", () => {
    const sources = new Map([
      [
        "/schema.ts",
        `
          import { defineSchema, defineTable } from "convex/server";
          import { v } from "convex/values";
          const defaults = { accounts: defineTable({ legacy: v.boolean() }) };
          export default defineSchema({
            ...defaults,
            accounts: defineTable({ name: v.string() }),
          });
        `,
      ],
    ]);
    const graph = parseConvexSchema("/schema.ts", {
      sourceReader: reader(sources),
    });
    expect(graph.tables).toHaveLength(1);
    expect(graph.tables[0]?.fields.map((field) => field.name)).toEqual([
      "name",
    ]);
  });

  it("keeps nested validator imports opaque unless explicitly enabled", () => {
    const sources = new Map([
      [
        "/schema.ts",
        `
          import { defineSchema } from "convex/server";
          import { tables } from "./tables";
          export default defineSchema({ ...tables });
        `,
      ],
      [
        "/tables.ts",
        `
          import { defineTable } from "convex/server";
          import { v } from "convex/values";
          import { ownerValidator } from "./validators";
          export const tables = {
            accounts: defineTable({ name: v.string() }),
            projects: defineTable({ owner: ownerValidator }),
          };
        `,
      ],
      [
        "/validators.ts",
        `
          import { v } from "convex/values";
          export const ownerValidator = v.id("accounts");
        `,
      ],
    ]);

    const compatible = parseConvexSchema("/schema.ts", {
      sourceReader: reader(sources),
    });
    const expanded = parseConvexSchema("/schema.ts", {
      sourceReader: reader(sources),
      followTransitiveImports: true,
    });

    expect(compatible.edges).toEqual([]);
    expect(expanded.edges).toEqual([
      expect.objectContaining({
        source: "projects",
        target: "accounts",
        field: "owner",
      }),
    ]);
  });

  it("supports cast table fields and source arrow directives", () => {
    const sources = new Map([
      [
        "/schema.ts",
        `
          import { defineSchema, defineTable } from "convex/server";
          import { v } from "convex/values";
          const projectFields = {
            accountId: v.id("accounts"),
            reviewerId: v.id("accounts"),
          };
          const projects = defineTable(
            projectFields as unknown as typeof projectFields
          );
          // @noArrowFields(reviewerId)
          export default defineSchema({
            accounts: defineTable({ name: v.string() }),
            projects,
          });
        `,
      ],
    ]);

    const graph = parseConvexSchema("/schema.ts", {
      sourceReader: reader(sources),
    });

    expect(graph.edges.map((edge) => edge.id)).toEqual([
      "edge-projects.accountId.accounts",
    ]);
    expect(
      graph.tables
        .find((table) => table.id === "projects")
        ?.fields.find((field) => field.name === "reviewerId")?.arrowsDisabled,
    ).toBe(true);
  });
});

function reader(sources: Map<string, string>): ConvexSourceReader {
  return {
    readFile: (filePath) => sources.get(filePath),
    fileExists: (filePath) => sources.has(filePath),
  };
}
