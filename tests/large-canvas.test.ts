// @vitest-environment node
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import {
  createCanvasReviewService,
  createCanvasReviewState,
  parseCanvasReviewState,
  parseCanvasDocument,
  type CanvasContext,
} from "../src/core/index.js";
import { createCanvasAgentServer } from "../src/server/agent/index.js";
import {
  largeDocument,
  largeRegions,
} from "../examples/playground/large-schema.js";

describe("large fictional architecture context", () => {
  it("has eight spaced regions, complete references, and positioned documentation", () => {
    const document = parseCanvasDocument(largeDocument);
    expect(document.graph.tables).toHaveLength(96);
    expect(largeRegions).toHaveLength(8);
    expect(document.graph.warnings).toEqual([]);
    expect(new Set(document.graph.tables.map((t) => t.group)).size).toBe(8);
    for (const table of document.graph.tables) {
      expect(document.layout[table.id]?.markdown).toBeTruthy();
      expect(table.fields.length).toBeGreaterThanOrEqual(5);
    }
    expect(document.graph.edges.length).toBeGreaterThan(120);
    expect(document.annotations.filter((a) => a.kind === "frame")).toHaveLength(
      9,
    );
    for (const a of largeRegions)
      for (const b of largeRegions) {
        if (a === b) continue;
        expect(
          a.x + 1580 < b.x ||
            b.x + 1580 < a.x ||
            a.y + 2020 < b.y ||
            b.y + 2020 < a.y,
        ).toBe(true);
      }
  });

  it("retrieves architectural evidence through the actual MCP tools", async () => {
    let state = await createCanvasReviewState(largeDocument);
    const service = createCanvasReviewService({
      store: {
        async read() {
          return structuredClone(state);
        },
        async transact(operation) {
          const next = await operation(structuredClone(state));
          state = parseCanvasReviewState(next.state);
          return next.result;
        },
      },
      authorizeReview: () => ({ reviewerId: "fictional-reviewer" }),
      contextOptions: { automaticMuteDistance: 650 },
    });
    const server = createCanvasAgentServer(
      service.agent("architecture-reader"),
    );
    const client = new Client({
      name: "architecture-exercise",
      version: "1.0.0",
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const read = async (table: string) => {
      const response = await client.callTool({
        name: "get_canvas_context",
        arguments: { table, hops: 0 },
      });
      expect(response.isError).not.toBe(true);
      return {
        context: response.structuredContent as unknown as CanvasContext,
        text: response.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n"),
      };
    };
    try {
      const voyage = await read("voyages");
      expect(voyage.context.tables).toHaveLength(1);
      expect(voyage.text).toContain("Cancellation is a workflow");
      expect(voyage.text).toContain("settled receipts are not deleted");
      expect(voyage.text).toContain("crosses context boundary");
      const cargo = await read("cargo_crates");
      expect(cargo.text).toContain("cargo-identity-region");
      expect(cargo.text).toContain("cargo-boundary");
      expect(
        cargo.context.annotations.find(
          (a) => a.annotation.id === "cargo-boundary",
        )?.nearbyTableIds,
      ).toEqual([]);
      const work = await read("work_orders");
      expect(work.text).toContain("maintenance.released");
      expect(work.text).toContain("no foreign-key arrow");
      expect(work.text).toContain("never revokes a maintenance release");
      const grounding = await read("grounding_events");
      expect(grounding.text).toContain('Declared group: "Maintenance"');
      expect(grounding.text).toContain("Inside frames: fleet-region");
      const release = await read("release_certificates");
      expect(
        release.context.relationships.find((r) => r.field === "airshipId"),
      ).toMatchObject({ muted: false, muteReason: "explicit" });
      const audit = await read("audit_entries");
      expect(audit.context.relationships[0]).toMatchObject({
        hidden: true,
        optional: true,
      });
      expect(state.proposals).toEqual([]);
      expect(state.document).toEqual(largeDocument);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
