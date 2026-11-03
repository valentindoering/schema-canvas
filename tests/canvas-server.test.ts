// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createCanvasReviewService } from "../src/core/index.js";
import {
  createFileCanvasReviewStore,
  initializeCanvasReviewFile,
} from "../src/server/review-store/index.js";
import { createCanvasAgentServer } from "../src/server/agent/index.js";
import { canvasDocument } from "./canvas-fixtures.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "schema-canvas-agent-"));
  directories.push(dir);
  const filePath = join(dir, "review.json");
  await initializeCanvasReviewFile(filePath, canvasDocument);
  const store = createFileCanvasReviewStore({ filePath });
  const service = createCanvasReviewService({
    store,
    authorizeReview: (session: string) => {
      if (session !== "verified-human-session")
        throw new Error("Human authorization required");
      return { reviewerId: "reviewer" };
    },
  });
  return { dir, filePath, service, store, agent: service.agent("test-agent") };
}

describe("durable review storage and MCP", () => {
  it("persists proposals and decisions across service restarts without applying on submission", async () => {
    const { filePath, service, agent } = await setup();
    const context = await agent.getContext({ table: "projects" });
    const proposal = await agent.propose({
      baseRevision: context.revision,
      title: "Document projects",
      reason: "Fictional documentation",
      operations: [
        {
          op: "set_table_markdown",
          tableId: "projects",
          markdown: "# Project guide",
        },
      ],
    });
    expect((await service.readDocument()).document).toEqual(canvasDocument);
    const restarted = createCanvasReviewService({
      store: createFileCanvasReviewStore({ filePath }),
      authorizeReview: () => ({ reviewerId: "reviewer" }),
    });
    expect((await restarted.listProposals())[0]?.id).toBe(proposal.id);
    const review = await restarted.openReview(proposal.id, undefined);
    await restarted.accept(
      { proposalId: proposal.id, reviewToken: review.reviewToken },
      undefined,
    );
    const saved = JSON.parse(await readFile(filePath, "utf8"));
    expect(saved.document.layout.projects.markdown).toBe("# Project guide");
    expect(saved.proposals[0]).toMatchObject({
      status: "accepted",
      decision: { reviewerId: "reviewer" },
    });
    expect(saved.proposals[0]).not.toHaveProperty("review");
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });
  it("refuses malformed authority files, unsupported formats, and an active writer lock", async () => {
    const { filePath, store } = await setup();
    const original = await readFile(filePath, "utf8");
    await writeFile(`${filePath}.lock`, "existing writer");
    await expect(
      store.transact(async (state) => ({ state, result: true })),
    ).rejects.toThrow("locked");
    expect(await readFile(filePath, "utf8")).toBe(original);
    await rm(`${filePath}.lock`);
    await writeFile(filePath, "{ broken");
    await expect(store.read()).rejects.toThrow("invalid JSON");
    await writeFile(filePath, '{"version":99}');
    await expect(store.read()).rejects.toThrow("explicit migration");
    await expect(
      initializeCanvasReviewFile(filePath, canvasDocument),
    ).rejects.toThrow();
  });
  it("exposes real MCP read/proposal tools, matching PNGs, and no approval capability", async () => {
    const { service, agent } = await setup();
    const server = createCanvasAgentServer(agent, {
      reviewUrl: (id) => `https://example.com/canvas?proposal=${id}`,
    });
    const client = new Client({ name: "canvas-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    try {
      await client.connect(clientTransport);
      const listed = await client.listTools();
      expect(listed.tools.map((t) => t.name).sort()).toEqual([
        "find_canvas_tables",
        "get_canvas_context",
        "get_canvas_proposal",
        "propose_canvas_change",
      ]);
      expect(
        listed.tools.find((t) => t.name === "propose_canvas_change")
          ?.annotations?.readOnlyHint,
      ).toBe(false);
      const context = await client.callTool({
        name: "get_canvas_context",
        arguments: { table: "projects", hops: 1, includeImage: true },
      });
      expect(context.isError).not.toBe(true);
      const structured = context.structuredContent as {
        revision: string;
        snapshotId: string;
      };
      const image = context.content.find((c) => c.type === "image");
      expect(image?.type).toBe("image");
      if (image?.type !== "image") throw new Error("Expected PNG");
      const png = Buffer.from(image.data, "base64");
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect(png.readUInt32BE(16)).toBeLessThanOrEqual(1600);
      expect(png.readUInt32BE(20)).toBeLessThanOrEqual(1200);
      expect(context.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining(structured.snapshotId),
      });
      const proposed = await client.callTool({
        name: "propose_canvas_change",
        arguments: {
          baseRevision: structured.revision,
          title: "Guide",
          reason: "Explain projects",
          operations: [
            {
              op: "set_table_markdown",
              tableId: "projects",
              markdown: "# Pending guide",
            },
          ],
        },
      });
      expect(proposed.isError).not.toBe(true);
      expect(proposed.structuredContent).toMatchObject({
        proposal: { status: "pending", actorId: "test-agent" },
        reviewUrl: expect.stringContaining("https://example.com/canvas"),
      });
      expect((await service.readDocument()).document).toEqual(canvasDocument);
      await expect(
        client.callTool({ name: "approve_canvas_change", arguments: {} }),
      ).rejects.toThrow();
      const bad = await client.callTool({
        name: "propose_canvas_change",
        arguments: {
          baseRevision: structured.revision,
          title: "Unsafe",
          reason: "Invalid operation",
          operations: [{ op: "delete_table", tableId: "projects" }],
        },
      });
      expect(bad.isError).toBe(true);
      expect(await service.listProposals()).toHaveLength(1);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
