import { describe, expect, it } from "vitest";
import {
  canvasContextMarkdown,
  canvasContextSvg,
  canvasDigest,
  canvasSnapshot,
  getCanvasContext,
  findCanvasTables,
  parseCanvasDocument,
  parseCanvasContextQuery,
  previewCanvasProposal,
} from "../src/core/index.js";
import { graph } from "./fixtures.js";

import { canvasDocument as document } from "./canvas-fixtures.js";

describe("AI canvas context", () => {
  it("queries by table name and bounded hops, retaining crossing relationships", async () => {
    const context = await getCanvasContext(document, {
      table: "Projects",
      hops: 0,
    });
    expect(context.tables.map((t) => t.table.id)).toEqual(["projects"]);
    expect(context.relationships[0]).toMatchObject({
      source: "projects",
      target: "accounts",
      boundary: true,
    });
    expect(context.annotations.map((a) => a.annotation.id)).toContain("guide");
    expect(context.spatial).toContainEqual({
      kind: "contains",
      from: "annotation:system",
      to: "projects",
      evidence: "geometry",
      estimated: true,
    });
    expect(context.policy).toContain("read-only for agents");
    expect(
      (await getCanvasContext(document, { table: "projects", hops: 1 })).tables,
    ).toHaveLength(2);
    expect(findCanvasTables(document, "pro").tables).toEqual([
      { id: "projects", label: "Projects" },
    ]);
  });
  it("includes distant frame documentation without claiming proximity or leaking sibling notes", async () => {
    const candidate = structuredClone(document);
    candidate.annotations = [
      {
        id: "parent",
        kind: "frame",
        label: "System",
        x: -100,
        y: -100,
        width: 4000,
        height: 4000,
        color: "slate",
      },
      {
        id: "first",
        kind: "frame",
        label: "First",
        x: 0,
        y: 0,
        width: 1000,
        height: 2000,
        color: "blue",
      },
      {
        id: "second",
        kind: "frame",
        label: "Second",
        x: 2000,
        y: 0,
        width: 1000,
        height: 2000,
        color: "blue",
      },
      {
        id: "local-guide",
        kind: "note",
        markdown: "First region rules",
        x: 100,
        y: 1500,
        width: 300,
        height: 100,
        color: "slate",
      },
      {
        id: "sibling-guide",
        kind: "note",
        markdown: "Second region rules",
        x: 2100,
        y: 1500,
        width: 300,
        height: 100,
        color: "slate",
      },
      {
        id: "parent-guide",
        kind: "note",
        markdown: "Whole system rules",
        x: 100,
        y: 3000,
        width: 300,
        height: 100,
        color: "slate",
      },
    ];
    const context = await getCanvasContext(candidate, {
      table: "projects",
      hops: 0,
    });
    const ids = context.annotations.map((a) => a.annotation.id);
    expect(ids).toContain("local-guide");
    expect(ids).toContain("parent-guide");
    expect(ids).not.toContain("sibling-guide");
    expect(
      context.annotations.find((a) => a.annotation.id === "local-guide")
        ?.nearbyTableIds,
    ).toEqual([]);
    expect(
      context.spatial.some(
        (r) => r.kind === "near" && r.from === "annotation:local-guide",
      ),
    ).toBe(false);
  });
  it("does not label distant nearest neighbors as near", async () => {
    const candidate = structuredClone(document);
    candidate.layout.accounts = { x: 0, y: -3000 };
    const context = await getCanvasContext(candidate);
    expect(
      context.spatial.some(
        (r) =>
          r.kind === "near" && r.from === "projects" && r.to === "accounts",
      ),
    ).toBe(false);
  });
  it("supports view, frame, selection, and bounds with explicit truncation", async () => {
    for (const query of [{ view: "Everything" }, { frame: "Fictional system" }])
      expect((await getCanvasContext(document, query)).tables).toHaveLength(2);
    expect(
      (await getCanvasContext(document, { tableIds: ["accounts"] })).tables.map(
        (t) => t.table.id,
      ),
    ).toEqual(["accounts"]);
    expect(
      (
        await getCanvasContext(document, {
          bounds: { x: -1, y: -1, width: 290, height: 120 },
        })
      ).tables.map((t) => t.table.id),
    ).toEqual(["projects"]);
    const truncated = await getCanvasContext(document, { maxTables: 1 });
    expect(truncated.omittedTableIds).toEqual(["projects"]);
    expect(canvasContextMarkdown(truncated)).toContain("TRUNCATED");
    const limitedNotes = await getCanvasContext(document, {
      maxAnnotations: 1,
    });
    expect(limitedNotes.omittedAnnotationIds).toEqual(["guide"]);
    expect(canvasContextMarkdown(limitedNotes)).toContain(
      "annotations omitted",
    );
  });
  it("retains the root under a table budget and global notes in a whole-schema view", async () => {
    const limited = await getCanvasContext(document, {
      table: "projects",
      hops: 1,
      maxTables: 1,
    });
    expect(limited.tables.map((t) => t.table.id)).toEqual(["projects"]);
    expect(limited.omittedTableIds).toEqual(["accounts"]);
    const candidate = structuredClone(document);
    candidate.annotations.push({
      id: "global-guide",
      kind: "note",
      markdown: "Whole system guide",
      x: 5000,
      y: 5000,
      width: 300,
      height: 200,
      color: "slate",
    });
    const whole = await getCanvasContext(candidate, { view: "all" });
    expect(whole.annotations.map((a) => a.annotation.id)).toContain(
      "global-guide",
    );
  });
  it("distinguishes measured geometry, automatic gray arrows, and explicit presentation", async () => {
    const context = await getCanvasContext(
      document,
      {},
      {
        geometry: { projects: { x: 0, y: 0, width: 280, height: 100 } },
        automaticMuteDistance: 100,
      },
    );
    expect(
      context.tables.find((t) => t.table.id === "projects")?.geometry,
    ).toBe("measured");
    expect(context.relationships[0]).toMatchObject({
      muted: true,
      muteReason: "distance",
    });
    const changed = previewCanvasProposal(document, {
      baseRevision: "revision",
      title: "Presentation",
      reason: "Fictional example",
      operations: [
        {
          op: "update_edge",
          edgeId: graph.edges[0]!.id,
          changes: { hidden: true, muted: false },
        },
      ],
    }).document;
    const explicit = await getCanvasContext(
      changed,
      {},
      { automaticMuteDistance: 100 },
    );
    expect(explicit.relationships[0]).toMatchObject({
      hidden: true,
      hiddenReasons: ["edge-hidden"],
      muted: false,
      muteReason: "explicit",
    });
  });
  it("keeps exact Markdown, uses deterministic revisions, and never embeds executable SVG content", async () => {
    const candidate = structuredClone(document);
    candidate.annotations[1]!.markdown =
      '# <script>alert("x")</script>\n\n![remote](https://example.com/a.png)\n';
    const context = await getCanvasContext(candidate, { includeImage: true });
    expect(canvasContextMarkdown(context)).toContain(
      candidate.annotations[1]!.markdown!,
    );
    const svg = canvasContextSvg(context);
    expect(svg).toContain(`data-snapshot-id="${context.snapshotId}"`);
    expect(svg).toContain(`data-revision="${context.revision}"`);
    expect(svg).not.toMatch(/<script|<image|foreignObject|onload=/);
    expect(await canvasDigest({ b: 2, a: 1 })).toBe(
      await canvasDigest({ a: 1, b: 2 }),
    );
    expect((await canvasSnapshot(candidate)).document).toEqual(candidate);
  });
  it("rejects ambiguous names, unknown ids, malformed documents, and conflicting scopes", async () => {
    const ambiguous = structuredClone(document);
    ambiguous.graph.tables[0]!.label = "Projects";
    await expect(
      getCanvasContext(ambiguous, { table: "Projects" }),
    ).rejects.toThrow("Ambiguous");
    await expect(
      getCanvasContext(document, { table: "missing" }),
    ).rejects.toThrow("Unknown table");
    expect(() =>
      parseCanvasContextQuery({ table: "projects", view: "all" }),
    ).toThrow("one context scope");
    expect(() =>
      parseCanvasContextQuery({ table: "projects", hops: 100 }),
    ).toThrow();
    expect(() =>
      parseCanvasDocument({ ...document, graph: { tables: [] } }),
    ).toThrow();
    expect(() =>
      parseCanvasDocument({
        ...document,
        annotations: [{ ...document.annotations[0], width: -1 }],
      }),
    ).toThrow();
    await expect(canvasDigest({ invalid: undefined })).rejects.toThrow();
  });
});
