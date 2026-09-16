import { describe, expect, it } from "vitest";

import {
  canonicalEdgeKey,
  getSchemaEdgeLayout,
  parseSchemaAnnotations,
  parseSchemaLayout,
  serializeSchemaAnnotations,
  setSchemaEdgeLayout,
  validateSchemaGraph,
} from "../src/core/index.js";
import { graph, layout } from "./fixtures.js";

describe("core contracts", () => {
  it("fails loudly for broken graph topology", () => {
    expect(() =>
      validateSchemaGraph({
        tables: graph.tables,
        edges: [{ ...graph.edges[0]!, target: "missing" }],
        warnings: [],
      }),
    ).toThrow("unknown table");
  });

  it("accepts every legacy edge key and writes the canonical key", () => {
    const edge = graph.edges[0]!;
    for (const key of [edge.field, edge.id, canonicalEdgeKey(edge)]) {
      const parsed = parseSchemaLayout(
        {
          ...layout,
          projects: {
            x: 3,
            y: 17,
            foreignKeys: {
              [key]: {
                targetTable: "accounts",
                source: "bottom-right",
                target: "top-left",
                route: "straight",
                hidden: true,
                muted: true,
                shift: { direction: "right", amount: 12 },
                style: "dashed",
              },
            },
          },
        },
        graph,
      );
      expect(parsed.projects).toMatchObject({ x: 0, y: 20 });
      expect(getSchemaEdgeLayout(parsed, edge)).toMatchObject({
        hidden: true,
        muted: true,
        style: "dashed",
      });
    }
    const updated = setSchemaEdgeLayout(layout, edge, { route: "smoothstep" });
    expect(updated.projects?.foreignKeys).toEqual({
      "accountId->accounts": {
        route: "smoothstep",
        targetTable: "accounts",
      },
    });
  });

  it("reads a composite edge route stored under a source-column key", () => {
    const compositeGraph = {
      tables: [
        { id: "accounts", label: "Accounts", fields: [] },
        {
          id: "memberships",
          label: "Memberships",
          fields: [
            {
              name: "account_id",
              type: "uuid",
              optional: false,
              foreignKeyTargets: ["accounts"],
            },
          ],
        },
      ],
      edges: [
        {
          id: "edge-memberships.account_id+kind.accounts.0",
          source: "memberships",
          target: "accounts",
          field: "account_id, kind",
          sourceFields: ["account_id", "kind"],
          optional: false,
        },
      ],
      warnings: [],
    };
    const parsed = parseSchemaLayout(
      {
        memberships: {
          x: 0,
          y: 0,
          foreignKeys: {
            "account_id->accounts": {
              targetTable: "accounts",
              route: "straight",
            },
          },
        },
      },
      compositeGraph,
    );

    expect(parsed.memberships?.foreignKeys?.["account_id->accounts"]).toEqual({
      targetTable: "accounts",
      route: "straight",
    });
  });

  it("retains table density, highlights, and all hide controls", () => {
    const parsed = parseSchemaLayout(
      {
        projects: {
          x: 0,
          y: 0,
          appearance: "highlighted",
          fieldDisplay: "concise",
          highlightedFields: ["accountId"],
          hideArrows: true,
          hideIncomingArrows: true,
          hideMutedIncomingArrows: true,
        },
      },
      graph,
    );
    expect(parsed.projects).toMatchObject({
      appearance: "highlighted",
      fieldDisplay: "concise",
      highlightedFields: ["accountId"],
      hideArrows: true,
      hideIncomingArrows: true,
      hideMutedIncomingArrows: true,
    });
  });

  it("rejects unknown tables, fields, and malformed edge settings", () => {
    expect(() => parseSchemaLayout({ missing: { x: 0, y: 0 } }, graph)).toThrow(
      "unknown table",
    );
    expect(() =>
      parseSchemaLayout(
        {
          projects: {
            x: 0,
            y: 0,
            highlightedFields: ["missing"],
          },
        },
        graph,
      ),
    ).toThrow("unknown field");
  });

  it("normalizes all four annotation kinds from arrays and wrappers", () => {
    const raw = [
      {
        id: "frame-1",
        kind: "frame",
        label: "Planning area",
        x: 3,
        y: 18,
        width: 633,
        height: 397,
      },
      {
        id: "note-1",
        kind: "note",
        label: "Review",
        text: "Check ownership",
        x: 0,
        y: 0,
        width: 300,
        height: 180,
        color: "blue",
      },
      {
        id: "text-1",
        kind: "text",
        label: "Roadmap",
        x: 0,
        y: 0,
        width: 300,
        height: 100,
        fontSize: 44,
      },
      {
        id: "image-1",
        kind: "image",
        label: "Reference",
        asset: "assets/reference.png",
        x: 0,
        y: 0,
        width: 320,
        height: 220,
      },
    ];
    const parsed = parseSchemaAnnotations(
      { annotations: raw },
      {
        resolveImage: (asset) => `/static/${asset}`,
      },
    );
    expect(parsed.map((annotation) => annotation.kind)).toEqual([
      "frame",
      "image",
      "note",
      "text",
    ]);
    expect(parsed.find((annotation) => annotation.kind === "image")?.src).toBe(
      "/static/assets/reference.png",
    );
    expect(serializeSchemaAnnotations(parsed)).not.toContain("src");
    expect(parseSchemaAnnotations(raw)).toHaveLength(4);
  });

  it("treats a missing annotation kind as a legacy frame", () => {
    expect(
      parseSchemaAnnotations([
        {
          id: "legacy",
          label: "Legacy group",
          x: 0,
          y: 0,
          width: 300,
          height: 200,
        },
      ])[0]?.kind,
    ).toBe("frame");
  });

  it("can serialize legacy annotations without explicit defaults", () => {
    const parsed = parseSchemaAnnotations([
      {
        id: "legacy",
        label: "Legacy group",
        x: 0,
        y: 0,
        width: 300,
        height: 200,
      },
      {
        id: "note",
        kind: "note",
        label: "Reminder",
        text: "Keep this nearby",
        x: 20,
        y: 40,
        width: 300,
        height: 200,
      },
    ]);

    expect(
      serializeSchemaAnnotations(parsed, "object", { omitDefaults: true }),
    ).toEqual({
      annotations: [
        {
          id: "legacy",
          label: "Legacy group",
          x: 0,
          y: 0,
          width: 300,
          height: 200,
        },
        {
          id: "note",
          kind: "note",
          label: "Reminder",
          text: "Keep this nearby",
          x: 20,
          y: 40,
          width: 300,
          height: 200,
        },
      ],
    });
  });
});
