import {
  canvasDigest,
  canvasKeys,
  canonicalCanvasJson,
  canvasSnapshot,
  canvasText,
  parseCanvasDocument,
  type CanvasDocument,
  type CanvasSnapshot,
} from "./canvas-document.js";
import {
  findCanvasTables,
  getCanvasContext,
  type CanvasContextOptions,
  type CanvasContextQuery,
} from "./canvas-context.js";
import {
  parseCanvasProposalInput,
  previewCanvasProposal,
  type CanvasProposal,
  type CanvasProposalInput,
  type CanvasProposalReview,
} from "./canvas-proposals.js";
import { assertRecord } from "./shared.js";

export type StoredCanvasProposal = CanvasProposal & {
  baseDocument: CanvasDocument;
  review?: {
    token: string;
    reviewerId: string;
    digest: string;
    expiresAt: number;
  };
};
export type CanvasReviewState = {
  version: 1;
  document: CanvasDocument;
  proposals: StoredCanvasProposal[];
};
/** Implement transact as one atomic operation over the document and proposal ledger. */
export type CanvasReviewStore = {
  read(): Promise<CanvasReviewState>;
  transact<T>(
    operation: (
      state: CanvasReviewState,
    ) => Promise<{ state: CanvasReviewState; result: T }>,
  ): Promise<T>;
};
export type CanvasReviewDecision = { proposalId: string; reviewToken: string };
export type CanvasReviewIdentity = { reviewerId: string };
export class CanvasRevisionConflictError extends Error {
  constructor() {
    super(
      "The canvas changed. Read the latest context and submit a new proposal for review.",
    );
    this.name = "CanvasRevisionConflictError";
  }
}

/** Conservative object-level preconditions allow independent suggestions to coexist.
 * Graph/view changes invalidate every proposal; saves still use the full revision.
 */
function proposalConflicts(
  document: CanvasDocument,
  proposal: StoredCanvasProposal,
): boolean {
  const base = proposal.baseDocument;
  const equal = (a: unknown, b: unknown) =>
    canonicalCanvasJson(a ?? null) === canonicalCanvasJson(b ?? null);
  if (!equal(document.graph, base.graph) || !equal(document.views, base.views))
    return true;
  const tableIds = new Set<string>();
  const annotationIds = new Set<string>();
  for (const operation of proposal.operations) {
    if ("tableId" in operation) tableIds.add(operation.tableId);
    else if (operation.op === "update_edge") {
      const edge = base.graph.edges.find(
        (edge) => edge.id === operation.edgeId,
      );
      if (!edge) return true;
      tableIds.add(edge.source);
    } else
      annotationIds.add(
        operation.op === "add_annotation"
          ? operation.annotation.id
          : operation.annotationId,
      );
  }
  for (const id of tableIds) {
    const before = Object.hasOwn(base.layout, id) ? base.layout[id] : null;
    const current = Object.hasOwn(document.layout, id)
      ? document.layout[id]
      : null;
    if (!equal(before, current)) return true;
  }
  for (const id of annotationIds)
    if (
      !equal(
        base.annotations.find((annotation) => annotation.id === id),
        document.annotations.find((annotation) => annotation.id === id),
      )
    )
      return true;
  return false;
}

export function parseCanvasReviewState(candidate: unknown): CanvasReviewState {
  assertRecord(candidate, "Review state must be an object.");
  canvasKeys(candidate, ["version", "document", "proposals"], "Review state");
  if (candidate.version !== 1)
    throw new Error(
      "Unsupported canvas review state version. An explicit migration is required.",
    );
  const document = parseCanvasDocument(candidate.document);
  if (!Array.isArray(candidate.proposals))
    throw new Error("Proposal ledger must be an array.");
  const ids = new Set<string>();
  const proposals = candidate.proposals.map((raw) => {
    assertRecord(raw, "Invalid stored proposal.");
    canvasKeys(
      raw,
      [
        "id",
        "actorId",
        "createdAt",
        "status",
        "decision",
        "review",
        "baseDocument",
        "baseRevision",
        "title",
        "reason",
        "operations",
      ],
      "Stored proposal",
    );
    const input = parseCanvasProposalInput({
      baseRevision: raw.baseRevision,
      title: raw.title,
      reason: raw.reason,
      operations: raw.operations,
    });
    for (const key of ["id", "actorId", "createdAt"])
      canvasText(raw[key], key, 500);
    if (ids.has(raw.id as string)) throw new Error("Duplicate proposal id.");
    ids.add(raw.id as string);
    if (
      !["pending", "accepted", "rejected"].includes(raw.status as string) ||
      !Number.isFinite(Date.parse(raw.createdAt as string))
    )
      throw new Error("Invalid proposal status or timestamp.");
    if (raw.review !== undefined) {
      assertRecord(raw.review, "Invalid review receipt.");
      canvasKeys(
        raw.review,
        ["token", "reviewerId", "digest", "expiresAt"],
        "Review receipt",
      );
      for (const key of ["token", "reviewerId", "digest"])
        canvasText(raw.review[key], key, 500);
      if (
        typeof raw.review.expiresAt !== "number" ||
        !Number.isFinite(raw.review.expiresAt)
      )
        throw new Error("Invalid review expiry.");
    }
    if (raw.status !== "pending") {
      assertRecord(raw.decision, "Decided proposal needs an audit record.");
      canvasKeys(
        raw.decision,
        ["reviewerId", "at", "revision"],
        "Proposal decision",
      );
      for (const key of ["reviewerId", "at", "revision"])
        canvasText(raw.decision[key], key, 500);
      if (
        !Number.isFinite(Date.parse(raw.decision.at as string)) ||
        raw.review !== undefined
      )
        throw new Error("Invalid decided proposal audit record.");
    } else if (raw.decision !== undefined)
      throw new Error("Pending proposal cannot have a decision.");
    const baseDocument = parseCanvasDocument(raw.baseDocument);
    return {
      ...structuredClone(raw),
      ...input,
      baseDocument,
    } as StoredCanvasProposal;
  });
  return { version: 1, document, proposals };
}
export function publicCanvasProposal(
  proposal: StoredCanvasProposal,
): CanvasProposal {
  const { review: _review, baseDocument: _baseDocument, ...visible } = proposal;
  return structuredClone(visible);
}
export async function createCanvasReviewState(
  document: CanvasDocument,
): Promise<CanvasReviewState> {
  return { version: 1, document: parseCanvasDocument(document), proposals: [] };
}

export function createCanvasReviewService<ReviewContext>(options: {
  store: CanvasReviewStore;
  /** Authenticate and authorize a HUMAN reviewer using server-owned context, not agent arguments. */
  authorizeReview: (
    context: ReviewContext,
  ) => CanvasReviewIdentity | Promise<CanvasReviewIdentity>;
  contextOptions?: CanvasContextOptions | (() => CanvasContextOptions);
  reviewLifetimeMs?: number;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const lifetime = options.reviewLifetimeMs ?? 15 * 60_000;
  if (!Number.isFinite(lifetime) || lifetime <= 0 || lifetime > 60 * 60_000)
    throw new Error("Review lifetime must be from 1 millisecond to one hour.");
  const read = async () => parseCanvasReviewState(await options.store.read());
  const identity = async (context: ReviewContext) => {
    const result = await options.authorizeReview(context);
    if (!result) throw new Error("Human review authorization is required.");
    canvasText(result.reviewerId, "Reviewer identity", 500);
    return result;
  };
  const pending = (state: CanvasReviewState, id: string) => {
    const proposal = state.proposals.find((p) => p.id === id);
    if (!proposal || proposal.status !== "pending")
      throw new Error("The proposal is missing or has already been decided.");
    return proposal;
  };
  async function decide(
    input: CanvasReviewDecision,
    context: ReviewContext,
    accept: boolean,
  ) {
    const who = await identity(context);
    canvasText(input.proposalId, "Proposal id", 500);
    canvasText(input.reviewToken, "Review token", 500);
    return options.store.transact(async (raw) => {
      const state = parseCanvasReviewState(raw);
      const proposal = pending(state, input.proposalId);
      const receipt = proposal.review;
      if (
        !receipt ||
        receipt.token !== input.reviewToken ||
        receipt.reviewerId !== who.reviewerId ||
        receipt.expiresAt <= now() ||
        receipt.digest !== (await canvasDigest(publicCanvasProposal(proposal)))
      )
        throw new Error(
          "Open this exact proposal in the canvas before confirming it. The review may have expired.",
        );
      const snapshot = await canvasSnapshot(state.document);
      if ((await canvasDigest(proposal.baseDocument)) !== proposal.baseRevision)
        throw new Error("Proposal baseline does not match its revision.");
      if (accept && proposalConflicts(snapshot.document, proposal))
        throw new CanvasRevisionConflictError();
      const document = accept
        ? previewCanvasProposal(state.document, proposal).document
        : state.document;
      const revision = await canvasDigest(document);
      proposal.status = accept ? "accepted" : "rejected";
      proposal.decision = {
        reviewerId: who.reviewerId,
        at: new Date(now()).toISOString(),
        revision,
      };
      delete proposal.review;
      return {
        state: { ...state, document },
        result: {
          proposal: publicCanvasProposal(proposal),
          snapshot: { document, revision },
        },
      };
    });
  }
  return {
    /** This is the complete capability object supplied to an agent transport. No approval or save method is present. */
    agent(actorId: string) {
      canvasText(actorId, "Agent identity", 500);
      return {
        async findTables(query: string, limit?: number) {
          const state = await read();
          return findCanvasTables(state.document, query, limit);
        },
        async getContext(query: CanvasContextQuery = {}) {
          const state = await read();
          return getCanvasContext(
            state.document,
            query,
            typeof options.contextOptions === "function"
              ? options.contextOptions()
              : options.contextOptions,
          );
        },
        async propose(candidate: CanvasProposalInput) {
          const input = parseCanvasProposalInput(candidate);
          return options.store.transact(async (raw) => {
            const state = parseCanvasReviewState(raw);
            if (state.proposals.length >= 1000)
              throw new Error(
                "The proposal ledger is full. The host must archive decided proposals.",
              );
            if ((await canvasDigest(state.document)) !== input.baseRevision)
              throw new CanvasRevisionConflictError();
            previewCanvasProposal(state.document, input);
            const proposal: StoredCanvasProposal = {
              ...input,
              baseDocument: structuredClone(state.document),
              id: crypto.randomUUID(),
              actorId,
              createdAt: new Date(now()).toISOString(),
              status: "pending",
            };
            return {
              state: { ...state, proposals: [...state.proposals, proposal] },
              result: publicCanvasProposal(proposal),
            };
          });
        },
        async getProposal(id: string) {
          const state = await read();
          const proposal = state.proposals.find((p) => p.id === id);
          if (!proposal) throw new Error("Unknown proposal.");
          return {
            ...publicCanvasProposal(proposal),
            stale:
              proposal.status === "pending" &&
              proposalConflicts(state.document, proposal),
          };
        },
      };
    },
    async listProposals() {
      return (await read()).proposals.map(publicCanvasProposal);
    },
    async readDocument(): Promise<CanvasSnapshot> {
      return canvasSnapshot((await read()).document);
    },
    async saveDocument(
      document: CanvasDocument,
      expectedRevision: string,
      context: ReviewContext,
    ) {
      await identity(context);
      const next = parseCanvasDocument(document);
      return options.store.transact(async (raw) => {
        const state = parseCanvasReviewState(raw);
        if ((await canvasDigest(state.document)) !== expectedRevision)
          throw new CanvasRevisionConflictError();
        return {
          state: { ...state, document: next },
          result: await canvasSnapshot(next),
        };
      });
    },
    async openReview(
      id: string,
      context: ReviewContext,
    ): Promise<CanvasProposalReview> {
      const who = await identity(context);
      return options.store.transact(async (raw) => {
        const state = parseCanvasReviewState(raw);
        const proposal = pending(state, id);
        const snapshot = await canvasSnapshot(state.document);
        if (
          (await canvasDigest(proposal.baseDocument)) !== proposal.baseRevision
        )
          throw new Error("Proposal baseline does not match its revision.");
        const stale = proposalConflicts(snapshot.document, proposal);
        const before = stale ? proposal.baseDocument : snapshot.document;
        const preview = previewCanvasProposal(before, proposal);
        const digest = await canvasDigest(publicCanvasProposal(proposal));
        // An always-visible inbox may display the same proposal in several tabs.
        // Reuse a valid receipt for this reviewer instead of invalidating those tabs.
        const existing = proposal.review;
        if (
          !existing ||
          existing.reviewerId !== who.reviewerId ||
          existing.digest !== digest ||
          existing.expiresAt <= now()
        ) {
          proposal.review = {
            token: crypto.randomUUID(),
            reviewerId: who.reviewerId,
            digest,
            expiresAt: now() + lifetime,
          };
        }
        const token = proposal.review!.token;
        return {
          state,
          result: {
            proposal: publicCanvasProposal(proposal),
            reviewToken: token,
            baseRevision: proposal.baseRevision,
            currentRevision: snapshot.revision,
            stale,
            before: structuredClone(before),
            after: preview.document,
            changes: preview.changes,
          },
        };
      });
    },
    accept: (input: CanvasReviewDecision, context: ReviewContext) =>
      decide(input, context, true),
    reject: (input: CanvasReviewDecision, context: ReviewContext) =>
      decide(input, context, false),
  };
}
export type CanvasAgentCapabilities = ReturnType<
  ReturnType<typeof createCanvasReviewService>["agent"]
>;
