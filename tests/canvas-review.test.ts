// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  canonicalCanvasJson,
  createCanvasReviewService,
  createCanvasReviewState,
  parseCanvasProposalInput,
  type CanvasProposalInput,
  type CanvasReviewStore,
} from "../src/core/index.js";
import { canvasDocument } from "./canvas-fixtures.js";

async function setup() {
  let state = await createCanvasReviewState(canvasDocument);
  let tail = Promise.resolve();
  const store: CanvasReviewStore = {
    read: async () => structuredClone(state),
    transact(operation) {
      const result = tail.then(async () => {
        const changed = await operation(structuredClone(state));
        state = changed.state;
        return changed.result;
      });
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
  let time = Date.now();
  const service = createCanvasReviewService({
    store,
    authorizeReview(context: string) {
      if (!context.startsWith("human:"))
        throw new Error("Human session required");
      return { reviewerId: context };
    },
    now: () => time,
  });
  const agent = service.agent("assistant");
  const snapshot = await service.readDocument();
  const input: CanvasProposalInput = {
    baseRevision: snapshot.revision,
    title: "Document projects",
    reason: "Explain the fictional relationship",
    operations: [
      {
        op: "set_table_markdown",
        tableId: "projects",
        markdown: "# Project ownership\n\nProjects belong to accounts.\n",
      },
    ],
  };
  return {
    store,
    service,
    agent,
    input,
    advance: () => {
      time += 16 * 60_000;
    },
  };
}

describe("proposal-only agent capabilities", () => {
  it("persists pending proposals without changing documentation or leaking review authority", async () => {
    const { service, agent, input, store } = await setup();
    const before = await service.readDocument();
    const proposal = await agent.propose(input);
    expect(proposal.status).toBe("pending");
    expect(await service.readDocument()).toEqual(before);
    expect(Object.keys(agent).sort()).toEqual([
      "findTables",
      "getContext",
      "getProposal",
      "propose",
    ]);
    const review = await service.openReview(proposal.id, "human:reviewer");
    const visible = await agent.getProposal(proposal.id);
    expect(canonicalCanvasJson(visible)).not.toContain(review.reviewToken);
    expect(visible).not.toHaveProperty("baseDocument");
    expect(visible).not.toHaveProperty("review");
    expect((await store.read()).proposals).toHaveLength(1);
  });
  it("requires authorized opening and exact one-time approval, with an audit record", async () => {
    const { service, agent, input } = await setup();
    const proposal = await agent.propose(input);
    await expect(service.openReview(proposal.id, "agent")).rejects.toThrow(
      "Human session",
    );
    await expect(
      service.accept(
        { proposalId: proposal.id, reviewToken: "guessed" },
        "human:reviewer",
      ),
    ).rejects.toThrow("Open this exact proposal");
    const review = await service.openReview(proposal.id, "human:reviewer");
    await expect(
      service.accept(
        { proposalId: proposal.id, reviewToken: review.reviewToken },
        "human:other",
      ),
    ).rejects.toThrow("Open this exact proposal");
    const results = await Promise.allSettled([
      service.accept(
        { proposalId: proposal.id, reviewToken: review.reviewToken },
        "human:reviewer",
      ),
      service.accept(
        { proposalId: proposal.id, reviewToken: review.reviewToken },
        "human:reviewer",
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await service.readDocument()).document.layout.projects?.markdown,
    ).toBe(
      input.operations[0]!.op === "set_table_markdown"
        ? input.operations[0]!.markdown
        : "",
    );
    expect(await agent.getProposal(proposal.id)).toMatchObject({
      status: "accepted",
      decision: { reviewerId: "human:reviewer" },
    });
  });
  it("reuses a valid receipt for the same human across visible inboxes without extending its expiry", async () => {
    const { service, agent, input, advance } = await setup();
    const proposal = await agent.propose(input);
    const first = await service.openReview(proposal.id, "human:reviewer");
    const second = await service.openReview(proposal.id, "human:reviewer");
    expect(second.reviewToken).toBe(first.reviewToken);
    const other = await service.openReview(proposal.id, "human:other");
    expect(other.reviewToken).not.toBe(first.reviewToken);
    await expect(
      service.accept(
        { proposalId: proposal.id, reviewToken: first.reviewToken },
        "human:reviewer",
      ),
    ).rejects.toThrow("Open this exact proposal");
    const next = await service.openReview(proposal.id, "human:reviewer");
    advance();
    const renewed = await service.openReview(proposal.id, "human:reviewer");
    expect(renewed.reviewToken).not.toBe(next.reviewToken);
    await expect(
      service.accept(
        { proposalId: proposal.id, reviewToken: next.reviewToken },
        "human:reviewer",
      ),
    ).rejects.toThrow("Open this exact proposal");
    expect((await service.readDocument()).document).toEqual(canvasDocument);
  });
  it("refuses stale proposals and stale approval, while still allowing rejection", async () => {
    const { service, agent, input } = await setup();
    const proposal = await agent.propose(input);
    const review = await service.openReview(proposal.id, "human:reviewer");
    const current = await service.readDocument();
    current.document.layout.projects!.x += 20;
    await service.saveDocument(
      current.document,
      current.revision,
      "human:reviewer",
    );
    await expect(agent.propose(input)).rejects.toThrow("canvas changed");
    await expect(
      service.accept(
        { proposalId: proposal.id, reviewToken: review.reviewToken },
        "human:reviewer",
      ),
    ).rejects.toThrow("canvas changed");
    const stale = await service.openReview(proposal.id, "human:reviewer");
    expect(stale.stale).toBe(true);
    await service.reject(
      { proposalId: proposal.id, reviewToken: stale.reviewToken },
      "human:reviewer",
    );
    expect((await agent.getProposal(proposal.id)).status).toBe("rejected");
    expect(
      (await service.readDocument()).document.layout.projects?.markdown,
    ).toBeUndefined();
  });
  it("accepts independent suggestions from one revision without overwriting intervening edits", async () => {
    const { service, agent, input } = await setup();
    const first = await agent.propose(input);
    const second = await agent.propose({
      ...input,
      title: "Document accounts",
      operations: [
        {
          op: "set_table_markdown",
          tableId: "accounts",
          markdown: "# Account guide",
        },
      ],
    });
    const a = await service.openReview(first.id, "human:reviewer");
    const b = await service.openReview(second.id, "human:reviewer");
    await service.accept(
      { proposalId: first.id, reviewToken: a.reviewToken },
      "human:reviewer",
    );
    expect(await agent.getProposal(second.id)).toMatchObject({
      status: "pending",
      stale: false,
    });
    const refreshed = await service.openReview(second.id, "human:reviewer");
    expect(refreshed.stale).toBe(false);
    expect(refreshed.currentRevision).not.toBe(refreshed.baseRevision);
    expect(refreshed.before.layout.projects!.markdown).toContain(
      "Project ownership",
    );
    expect(refreshed.after.layout.accounts!.markdown).toBe("# Account guide");
    // The reviewed object is unchanged, so the original exact receipt also stays valid.
    await service.accept(
      { proposalId: second.id, reviewToken: b.reviewToken },
      "human:reviewer",
    );
    const saved = (await service.readDocument()).document;
    expect(saved.layout.projects!.markdown).toContain("Project ownership");
    expect(saved.layout.accounts!.markdown).toBe("# Account guide");
  });
  it("blocks conflicting suggestions, graph changes, view changes, and occupied annotation ids", async () => {
    const { service, agent, input } = await setup();
    const first = await agent.propose(input);
    const second = await agent.propose({
      ...input,
      title: "Another project guide",
      operations: [
        {
          op: "set_table_markdown",
          tableId: "projects",
          markdown: "# Different guide",
        },
      ],
    });
    const a = await service.openReview(first.id, "human:reviewer");
    const b = await service.openReview(second.id, "human:reviewer");
    await service.accept(
      { proposalId: first.id, reviewToken: a.reviewToken },
      "human:reviewer",
    );
    expect(await agent.getProposal(second.id)).toMatchObject({ stale: true });
    await expect(
      service.accept(
        { proposalId: second.id, reviewToken: b.reviewToken },
        "human:reviewer",
      ),
    ).rejects.toThrow("canvas changed");
    for (const change of ["graph", "view", "annotation"] as const) {
      const setupResult = await setup();
      const operation =
        change === "annotation"
          ? {
              op: "add_annotation" as const,
              annotation: {
                id: "new-note",
                kind: "note" as const,
                markdown: "Proposal note",
                x: 0,
                y: 500,
                width: 300,
                height: 200,
                color: "slate" as const,
              },
            }
          : setupResult.input.operations[0]!;
      const proposal = await setupResult.agent.propose({
        ...setupResult.input,
        operations: [operation],
      });
      const opened = await setupResult.service.openReview(
        proposal.id,
        "human:reviewer",
      );
      const current = await setupResult.service.readDocument();
      if (change === "graph")
        current.document.graph.tables[0]!.label = "New label";
      if (change === "view")
        current.document.views![0]!.label = "New view label";
      if (change === "annotation" && operation.op === "add_annotation")
        current.document.annotations.push({
          ...operation.annotation,
          markdown: "Human note",
        });
      await setupResult.service.saveDocument(
        current.document,
        current.revision,
        "human:reviewer",
      );
      await expect(
        setupResult.service.accept(
          { proposalId: proposal.id, reviewToken: opened.reviewToken },
          "human:reviewer",
        ),
      ).rejects.toThrow("canvas changed");
    }
  });
  it("rejects a stored baseline modified after human review", async () => {
    const { service, agent, input, store } = await setup();
    const proposal = await agent.propose(input);
    const review = await service.openReview(proposal.id, "human:reviewer");
    await store.transact(async (state) => {
      state.proposals[0]!.baseDocument.layout.projects!.x += 20;
      return { state, result: undefined };
    });
    await expect(
      service.accept(
        { proposalId: proposal.id, reviewToken: review.reviewToken },
        "human:reviewer",
      ),
    ).rejects.toThrow("baseline does not match");
    expect((await service.readDocument()).document).toEqual(canvasDocument);
  });
  it("rejects expired or modified proposals without writing their changes", async () => {
    const { service, agent, input, advance, store } = await setup();
    const proposal = await agent.propose(input);
    const review = await service.openReview(proposal.id, "human:reviewer");
    advance();
    await expect(
      service.accept(
        { proposalId: proposal.id, reviewToken: review.reviewToken },
        "human:reviewer",
      ),
    ).rejects.toThrow("expired");
    const next = await service.openReview(proposal.id, "human:reviewer");
    await store.transact(async (state) => {
      state.proposals[0]!.reason = "Changed after opening";
      return { state, result: undefined };
    });
    await expect(
      service.accept(
        { proposalId: proposal.id, reviewToken: next.reviewToken },
        "human:reviewer",
      ),
    ).rejects.toThrow("exact proposal");
    expect((await service.readDocument()).document).toEqual(canvasDocument);
  });
  it("validates explicit operations and refuses schema edits, unknown properties, and missing objects", async () => {
    const { agent, input, store } = await setup();
    for (const operation of [
      { op: "delete_table", tableId: "projects" },
      {
        op: "set_table_markdown",
        tableId: "projects",
        markdown: "text",
        approved: true,
      },
      {
        op: "update_annotation",
        annotationId: "guide",
        changes: { asset: "remote" },
      },
    ]) {
      expect(() =>
        parseCanvasProposalInput({ ...input, operations: [operation] }),
      ).toThrow();
    }
    await expect(
      agent.propose({
        ...input,
        operations: [{ op: "move_table", tableId: "missing", x: 1, y: 1 }],
      }),
    ).rejects.toThrow("Unknown table");
    expect((await store.read()).proposals).toEqual([]);
  });
});
