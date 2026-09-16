// @vitest-environment node

import { describe, expect, it } from "vitest";

import { parsePostgresSchema } from "../src/server/postgres/index.js";

describe("PostgreSQL adapter", () => {
  const sources = [
    {
      path: "accounts.sql",
      contents: `
        CREATE TABLE public.accounts (
          id uuid PRIMARY KEY,
          name text NOT NULL
        );
        COMMENT ON TABLE public.accounts IS 'Workspace owners';
        COMMENT ON COLUMN public.accounts.name IS 'Display name';
      `,
    },
    {
      path: "projects.sql",
      contents: `
        CREATE TABLE public.projects (
          id uuid PRIMARY KEY,
          account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
          code text NOT NULL,
          region text NOT NULL,
          CONSTRAINT projects_region_unique UNIQUE (code, region)
        );

        CREATE TABLE "archive"."project_members" (
          project_id uuid NOT NULL,
          account_id uuid,
          CONSTRAINT member_project_fk FOREIGN KEY (project_id)
            REFERENCES public.projects(id) ON DELETE RESTRICT,
          FOREIGN KEY (account_id, project_id)
            REFERENCES external.directory(account_id, project_id)
        );
      `,
    },
  ];

  it("parses quoted names, inline and table references, composites, comments, and externals", () => {
    const graph = parsePostgresSchema(sources, {
      tableGroup: ({ schema }) => schema,
      tableLabel: ({ name }) => name.replaceAll("_", " "),
    });
    expect(graph.tables.map((table) => table.id)).toEqual([
      "accounts",
      "archive.project_members",
      "external.directory",
      "projects",
    ]);
    expect(graph.edges).toHaveLength(3);
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "projects",
          target: "accounts",
          sourceFields: ["account_id"],
          targetFields: ["id"],
          optional: false,
          metadata: expect.objectContaining({ onDelete: "CASCADE" }),
        }),
        expect.objectContaining({
          source: "archive.project_members",
          target: "external.directory",
          sourceFields: ["account_id", "project_id"],
        }),
      ]),
    );
    const accounts = graph.tables.find((table) => table.id === "accounts");
    expect(accounts?.metadata).toMatchObject({ comment: "Workspace owners" });
    expect(
      accounts?.fields.find((field) => field.name === "name")?.metadata,
    ).toEqual({
      comment: "Display name",
    });
  });

  it("fails when reference accounting is incomplete", () => {
    expect(() =>
      parsePostgresSchema(`
        CREATE TABLE public.projects (
          id uuid PRIMARY KEY,
          account_id uuid REFERENCES unsupported_syntax
        );
      `),
    ).toThrow("foreign-key references");
  });

  it("can reject external targets", () => {
    expect(() =>
      parsePostgresSchema(sources, { includeExternalTargets: false }),
    ).toThrow("unknown tables");
  });
});
