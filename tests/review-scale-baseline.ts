import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createCanvasReviewService,
  parseCanvasReviewState,
  parseSchemaAnnotations,
  parseSchemaLayout,
  type CanvasDocument,
  type CanvasProposalOperation,
  type CanvasReviewState,
  type CanvasReviewStore,
  type SchemaGraph,
  type StoredCanvasProposal,
} from "./.baseline/src/core/index.js";
import {
  createJsonStore,
  readJsonText,
  withJsonWriteLock,
  writeJsonAtomic,
} from "./.baseline/src/server/json-store/index.js";
import { scaleDocument } from "./scale-fixture.js";

/**
 * A host-shaped review store: the document lives in two revision-checked JSON
 * files (layout and annotations) and pending proposals in a separate ledger
 * file, as a host that keeps its checked-in canvas files authoritative does.
 */
export function createSplitFileReviewStore(
  directory: string,
  graph: SchemaGraph,
): CanvasReviewStore {
  const ledgerPath = path.join(directory, "proposals.json");
  const layoutStore = createJsonStore({
    filePath: path.join(directory, "layout.json"),
    parse: (candidate) => parseSchemaLayout(candidate, graph),
  });
  const annotationStore = createJsonStore({
    filePath: path.join(directory, "annotations.json"),
    parse: (candidate) => parseSchemaAnnotations(candidate),
  });
  async function readLedger(): Promise<StoredCanvasProposal[]> {
    const snapshot = await readJsonText(ledgerPath);
    return snapshot.contents === null
      ? []
      : (JSON.parse(snapshot.contents) as { proposals: StoredCanvasProposal[] })
          .proposals;
  }
  async function readDocument() {
    const [layout, annotations] = await Promise.all([
      layoutStore.read(),
      annotationStore.read(),
    ]);
    const document: CanvasDocument = {
      graph: structuredClone(graph),
      layout: layout.value,
      annotations: annotations.value,
    };
    return { document, layout, annotations };
  }
  return {
    async read() {
      const [{ document }, proposals] = await Promise.all([
        readDocument(),
        readLedger(),
      ]);
      return parseCanvasReviewState({ version: 1, document, proposals });
    },
    transact: (operation) =>
      withJsonWriteLock(ledgerPath, async () => {
        const current = await readDocument();
        const before = parseCanvasReviewState({
          version: 1,
          document: current.document,
          proposals: await readLedger(),
        });
        const { state, result } = await operation(before);
        const next = parseCanvasReviewState(state);
        if (
          JSON.stringify(next.document.layout) !==
          JSON.stringify(before.document.layout)
        )
          await layoutStore.write(
            next.document.layout,
            current.layout.revision,
          );
        if (
          JSON.stringify(next.document.annotations) !==
          JSON.stringify(before.document.annotations)
        )
          await annotationStore.write(
            next.document.annotations,
            current.annotations.revision,
          );
        await writeJsonAtomic(ledgerPath, {
          version: 1,
          proposals: next.proposals,
        });
        return result;
      }),
  };
}

export type ScaleRun = {
  /** Server time of one accept, from click to saved files. */
  accept: number;
  /** Server time the host spends afterwards to show the result: reload the queue and reopen every remaining card. */
  refresh: number;
  /** The host's JSON payload size for one reopened card. */
  reviewBytes: number;
  ledgerBytes: number;
};

/**
 * Replays a reviewer accepting one table-note suggestion while others are
 * pending, as the canvas and its host do: open every card, accept one, reload
 * the queue, reopen the remaining cards.
 */
export async function runReviewAtScale(pending = 8): Promise<ScaleRun> {
  const directory = await mkdtemp(path.join(tmpdir(), "schema-canvas-scale-"));
  try {
    const document = scaleDocument();
    await writeJsonAtomic(path.join(directory, "layout.json"), document.layout);
    await writeJsonAtomic(
      path.join(directory, "annotations.json"),
      document.annotations,
    );
    const store = createSplitFileReviewStore(directory, document.graph);
    const service = createCanvasReviewService({
      store,
      authorizeReview: () => ({ reviewerId: "fictional-reviewer" }),
    });
    const agent = service.agent("fictional-agent");
    const documented = document.graph.tables
      .filter((table) => document.layout[table.id]?.markdown)
      .slice(0, pending);
    for (const table of documented) {
      const { revision } = await service.readDocument();
      const operations: CanvasProposalOperation[] = [
        {
          op: "set_table_markdown",
          tableId: table.id,
          markdown: `${document.layout[table.id]!.markdown}\n- a fictional suggested line`,
        },
      ];
      await agent.propose({
        baseRevision: revision,
        title: `Document ${table.id}`,
        reason: "Fictional suggestion.",
        operations,
      });
    }
    const host = async () => {
      const [snapshot, proposals] = await Promise.all([
        service.readDocument(),
        service.listProposals(),
      ]);
      return {
        revision: snapshot.revision,
        proposals: proposals.filter((p) => p.status === "pending"),
      };
    };
    let queue = await host();
    const reviews = [];
    for (const proposal of queue.proposals)
      reviews.push(await service.openReview(proposal.id, {}));
    const reviewBytes = JSON.stringify(reviews[0]).length;
    let started = performance.now();
    await service.accept(
      {
        proposalId: reviews[0]!.proposal.id,
        reviewToken: reviews[0]!.reviewToken,
      },
      {},
    );
    const accept = performance.now() - started;
    started = performance.now();
    queue = await host();
    for (const proposal of queue.proposals)
      JSON.stringify(await service.openReview(proposal.id, {}));
    const refresh = performance.now() - started;
    const ledger = await readJsonText(path.join(directory, "proposals.json"));
    return {
      accept,
      refresh,
      reviewBytes,
      ledgerBytes: ledger.contents?.length ?? 0,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function documentBytes(state: CanvasReviewState) {
  return JSON.stringify(state.document).length;
}
