// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  canvasDigest,
  createCanvasReviewService,
  createCanvasReviewState,
  mergeCanvasText,
  parseCanvasReviewState,
  type CanvasDocument,
  type CanvasReviewState,
  type CanvasReviewStore,
} from "../src/core/index.js";
import { canvasDocument } from "./canvas-fixtures.js";
import { scaleDocument } from "./scale-fixture.js";

const note = [
  "- drafts stay local until the voyage is planned",
  "",
  "**Loading**",
  "",
  "- creates one manifest row per voyage",
  "- one entry per container",
  "  - one seal on the container",
  "- the harbor log later updates the status",
  "",
  "**Unloading**",
  "",
  "- crews unload by crane",
  "- one entry per crate",
].join("\n");
const edit = (text: string, from: string, to: string) => {
  expect(text).toContain(from);
  return text.replace(from, to);
};

describe("Markdown three-way merge", () => {
  it("combines edits of neighbouring lines", () => {
    const ours = edit(
      note,
      "  - one seal on the container",
      "  - one seal on the container and one on the crane",
    );
    const theirs = edit(
      note,
      "- the harbor log later updates the status",
      "- the harbor log later brings new entries",
    );
    expect(mergeCanvasText(note, ours, theirs)).toBe(
      edit(
        ours,
        "- the harbor log later updates the status",
        "- the harbor log later brings new entries",
      ),
    );
  });
  it("keeps both insertions at the same place, live text first", () => {
    expect(
      mergeCanvasText(
        "- a\n- b",
        "- a\n- b\n- from agent",
        "- a\n- b\n- by hand",
      ),
    ).toBe("- a\n- b\n- by hand\n- from agent");
    expect(
      mergeCanvasText("- a\n- b", "- a\n- b\n- same", "- a\n- b\n- same"),
    ).toBe("- a\n- b\n- same");
  });
  it("conflicts only when both changed the same line differently", () => {
    expect(
      mergeCanvasText("- a\n- b", "- a\n- agent b", "- a\n- human b"),
    ).toBe(null);
    expect(mergeCanvasText("- a\n- b", "- a\n- same b", "- a\n- same b")).toBe(
      "- a\n- same b",
    );
    // A deletion against an edit of the same line is a conflict, too.
    expect(mergeCanvasText("- a\n- b\n- c", "- a\n- c", "- a\n- B\n- c")).toBe(
      null,
    );
  });
  it("ignores how a rich-text save re-serializes untouched lines", () => {
    const base =
      "- cargo_manifests row\n- docked -> sailed\n* old bullet\n- keep";
    // The editor escapes underscores and arrows and normalizes bullets on save.
    const theirs =
      "- cargo\\_manifests row\n- docked -&gt; sailed\n- old bullet\n- keep, by hand";
    const ours =
      "- cargo_manifests row (one per voyage)\n- docked -> sailed\n* old bullet\n- keep";
    expect(mergeCanvasText(base, ours, theirs)).toBe(
      "- cargo_manifests row (one per voyage)\n- docked -&gt; sailed\n- old bullet\n- keep, by hand",
    );
  });
});

function memoryStore(initial: CanvasReviewState) {
  let state = initial;
  const store: CanvasReviewStore = {
    read: async () => structuredClone(state),
    async transact(operation) {
      const changed = await operation(structuredClone(state));
      state = parseCanvasReviewState(structuredClone(changed.state));
      return changed.result;
    },
  };
  return {
    store,
    raw: () => state,
    replace: (next: CanvasReviewState) => (state = next),
  };
}

async function documented(markdown: string): Promise<CanvasDocument> {
  const document = structuredClone(canvasDocument);
  document.layout.projects!.markdown = markdown;
  return document;
}

describe("suggestions on a note that is edited while they are pending", () => {
  it("applies three suggestions and a hand edit to one note in any order", async () => {
    const memory = memoryStore(
      await createCanvasReviewState(await documented(note)),
    );
    const service = createCanvasReviewService({
      store: memory.store,
      authorizeReview: (context: string) => ({ reviewerId: context }),
    });
    const agent = service.agent("assistant");
    const { revision } = await service.readDocument();
    const propose = (title: string, markdown: string) =>
      agent.propose({
        baseRevision: revision,
        title,
        reason: "Fictional.",
        operations: [
          { op: "set_table_markdown", tableId: "projects", markdown },
        ],
      });
    const first = await propose(
      "1/3",
      edit(
        note,
        "- one entry per container\n  - one seal on the container",
        "- exactly one entry per container\n  - one seal on the container and one on the crane",
      ),
    );
    const second = await propose(
      "2/3",
      edit(
        note,
        "- the harbor log later updates the status",
        "- the harbor log later brings new entries\n  - a returned container reopens the slot",
      ),
    );
    const third = await propose(
      "3/3",
      edit(
        edit(note, "**Unloading**", "**Harbor log**"),
        "- crews unload by crane",
        "- crews unload by crane or ramp",
      ),
    );
    // The human edits the same note by hand, in the editor's escaped form.
    const current = await service.readDocument();
    current.document.layout.projects!.markdown = edit(
      note,
      "- creates one manifest row per voyage",
      "- creates one manifest\\_row per voyage (thin shell)",
    );
    await service.saveDocument(current.document, current.revision, "human");
    for (const proposal of [second, first, third]) {
      const review = await service.openReview(proposal.id, "human");
      expect(review.stale).toBe(false);
      expect(review.changes[0]).toMatchObject({ merged: true });
      await service.accept(
        { proposalId: proposal.id, reviewToken: review.reviewToken },
        "human",
      );
    }
    expect(
      (await service.readDocument()).document.layout.projects!.markdown,
    ).toBe(
      [
        "- drafts stay local until the voyage is planned",
        "",
        "**Loading**",
        "",
        "- creates one manifest\\_row per voyage (thin shell)",
        "- exactly one entry per container",
        "  - one seal on the container and one on the crane",
        "- the harbor log later brings new entries",
        "  - a returned container reopens the slot",
        "",
        "**Harbor log**",
        "",
        "- crews unload by crane or ramp",
        "- one entry per crate",
      ].join("\n"),
    );
  });
  it("marks a truly conflicting suggestion stale and lets the human ask the agent to rebase", async () => {
    const memory = memoryStore(
      await createCanvasReviewState(await documented(note)),
    );
    const service = createCanvasReviewService({
      store: memory.store,
      authorizeReview: (context: string) => ({ reviewerId: context }),
    });
    const agent = service.agent("assistant");
    const { revision } = await service.readDocument();
    const proposal = await agent.propose({
      baseRevision: revision,
      title: "Rename the voyage",
      reason: "Fictional.",
      operations: [
        {
          op: "set_table_markdown",
          tableId: "projects",
          markdown: edit(
            note,
            "one manifest row per voyage",
            "one manifest row per berth",
          ),
        },
      ],
    });
    const current = await service.readDocument();
    current.document.layout.projects!.markdown = edit(
      note,
      "one manifest row per voyage",
      "one manifest row per voyage and per dock",
    );
    await service.saveDocument(current.document, current.revision, "human");
    const review = await service.openReview(proposal.id, "human");
    expect(review.stale).toBe(true);
    expect(review.conflicts).toEqual([
      { index: 0, objectId: "projects", field: "markdown" },
    ]);
    // The stale card shows what the agent meant: its change on its own base.
    expect(review.before.layout.projects!.markdown).toBe(note);
    await expect(
      service.requestRebase(
        { proposalId: proposal.id, reviewToken: "forged" },
        "human",
      ),
    ).rejects.toThrow("Open this exact proposal");
    await service.requestRebase(
      { proposalId: proposal.id, reviewToken: review.reviewToken },
      "human",
    );
    expect(await agent.listProposals("pending")).toMatchObject([
      {
        id: proposal.id,
        stale: true,
        conflicts: [{ objectId: "projects", field: "markdown" }],
        rebaseRequest: { reviewerId: "human" },
      },
    ]);
    // The same receipt still declines it; the request is not a proposal change.
    await service.reject(
      { proposalId: proposal.id, reviewToken: review.reviewToken },
      "human",
    );
    expect(memory.raw().proposals[0]).not.toHaveProperty("rebaseRequest");
  });
});

describe("compact proposal ledger", () => {
  it("stores only the base values a proposal writes and keeps reviews small at scale", async () => {
    const document = scaleDocument();
    const memory = memoryStore(await createCanvasReviewState(document));
    const service = createCanvasReviewService({
      store: memory.store,
      authorizeReview: (context: string) => ({ reviewerId: context }),
    });
    const table = document.graph.tables.find(
      (t) => document.layout[t.id]?.markdown,
    )!;
    const proposal = await service.agent("assistant").propose({
      baseRevision: (await service.readDocument()).revision,
      title: "Document one table",
      reason: "Fictional.",
      operations: [
        {
          op: "set_table_markdown",
          tableId: table.id,
          markdown: `${document.layout[table.id]!.markdown}\n- one more line`,
        },
      ],
    });
    expect(JSON.stringify(document).length).toBeGreaterThan(400_000);
    expect(JSON.stringify(memory.raw().proposals).length).toBeLessThan(5_000);
    const review = await service.openReview(proposal.id, "human");
    expect(JSON.stringify(review).length).toBeLessThan(40_000);
    expect(review.before.graph.tables.map((t) => t.id)).toContain(table.id);
    expect(review.after.layout[table.id]!.markdown).toContain("one more line");
  });
  it("migrates a pending proposal stored with a full baseline document", async () => {
    const document = await documented(note);
    const baseRevision = await canvasDigest(document);
    const legacy = {
      version: 1,
      document,
      proposals: [
        {
          id: "legacy",
          actorId: "assistant",
          createdAt: "2026-01-01T00:00:00.000Z",
          status: "pending",
          baseRevision,
          baseDocument: document,
          title: "Legacy",
          reason: "Fictional.",
          operations: [
            {
              op: "set_table_markdown",
              tableId: "projects",
              markdown: `${note}\n- added`,
            },
          ],
        },
        {
          id: "decided",
          actorId: "assistant",
          createdAt: "2026-01-01T00:00:00.000Z",
          status: "rejected",
          decision: {
            reviewerId: "human",
            at: "2026-01-01T00:00:00.000Z",
            revision: baseRevision,
          },
          baseRevision,
          baseDocument: document,
          title: "Decided",
          reason: "Fictional.",
          operations: [
            { op: "set_table_markdown", tableId: "projects", markdown: "x" },
          ],
        },
      ],
    };
    const state = parseCanvasReviewState(legacy);
    expect(state.proposals[0]).not.toHaveProperty("baseDocument");
    expect(state.proposals[0]!.base).toEqual({
      layout: { projects: document.layout.projects },
      edges: {},
      annotations: {},
    });
    expect(state.proposals[1]).not.toHaveProperty("baseDocument");
    expect(state.proposals[1]).not.toHaveProperty("base");
    const memory = memoryStore(state);
    const service = createCanvasReviewService({
      store: memory.store,
      authorizeReview: (context: string) => ({ reviewerId: context }),
    });
    const review = await service.openReview("legacy", "human");
    await service.accept(
      { proposalId: "legacy", reviewToken: review.reviewToken },
      "human",
    );
    expect(
      (await service.readDocument()).document.layout.projects!.markdown,
    ).toBe(`${note}\n- added`);
  });
});
