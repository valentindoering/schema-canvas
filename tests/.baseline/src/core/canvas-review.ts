import {
  canvasDigest,
  canvasKeys,
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
  rebaseCanvasProposal,
  type CanvasProposal,
  type CanvasProposalInput,
  type CanvasProposalReview,
} from "./canvas-proposals.js";
import { assertRecord } from "./shared.js";

export type StoredCanvasProposal = CanvasProposal & {
  /** Present while pending. Dropped once decided to keep the ledger small. */
  baseDocument?: CanvasDocument;
  review?: {
    token: string;
    reviewerId: string;
    /** Digest of the proposal as submitted. */
    digest: string;
    /** Digest of the exact operations shown to the reviewer after merging. */
    resultDigest?: string;
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

/** Decided proposals keep their audit record, not their multi-megabyte baseline. */
function compact(state: CanvasReviewState): CanvasReviewState {
  return {
    ...state,
    proposals: state.proposals.map((proposal) => {
      if (proposal.status === "pending" || !proposal.baseDocument)
        return proposal;
      const { baseDocument: _baseDocument, ...decided } = proposal;
      return decided;
    }),
  };
}
function baseline(proposal: StoredCanvasProposal): CanvasDocument {
  if (!proposal.baseDocument)
    throw new Error("A pending proposal needs its baseline document.");
  return proposal.baseDocument;
}
function assess(document: CanvasDocument, proposal: StoredCanvasProposal) {
  return rebaseCanvasProposal(
    baseline(proposal),
    document,
    proposal.operations,
  );
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
      !["pending", "accepted", "rejected", "withdrawn"].includes(
        raw.status as string,
      ) ||
      !Number.isFinite(Date.parse(raw.createdAt as string))
    )
      throw new Error("Invalid proposal status or timestamp.");
    if (raw.review !== undefined) {
      assertRecord(raw.review, "Invalid review receipt.");
      canvasKeys(
        raw.review,
        ["token", "reviewerId", "digest", "resultDigest", "expiresAt"],
        "Review receipt",
      );
      for (const key of ["token", "reviewerId", "digest"])
        canvasText(raw.review[key], key, 500);
      if (raw.review.resultDigest !== undefined)
        canvasText(raw.review.resultDigest, "resultDigest", 500);
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
    if (raw.status === "pending" && raw.baseDocument === undefined)
      throw new Error("A pending proposal needs its baseline document.");
    const stored = {
      ...structuredClone(raw),
      ...input,
    } as StoredCanvasProposal;
    if (raw.baseDocument !== undefined)
      stored.baseDocument = parseCanvasDocument(raw.baseDocument);
    return stored;
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
  const transact = <T>(
    operation: (
      state: CanvasReviewState,
    ) => Promise<{ state: CanvasReviewState; result: T }>,
  ) =>
    options.store.transact(async (raw) => {
      const { state, result } = await operation(parseCanvasReviewState(raw));
      return { state: compact(state), result };
    });
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
  const verifyBaseline = async (proposal: StoredCanvasProposal) => {
    if ((await canvasDigest(baseline(proposal))) !== proposal.baseRevision)
      throw new Error("Proposal baseline does not match its revision.");
  };
  /** Everything a reviewer sees, computed without writing. */
  async function prepareReview(
    state: CanvasReviewState,
    proposal: StoredCanvasProposal,
  ) {
    await verifyBaseline(proposal);
    const snapshot = await canvasSnapshot(state.document);
    const rebase = assess(snapshot.document, proposal);
    const stale = rebase.conflicts.length > 0;
    const before = stale ? baseline(proposal) : snapshot.document;
    const preview = previewCanvasProposal(before, {
      ...proposal,
      operations: stale ? proposal.operations : rebase.operations,
    });
    const merged = new Set(stale ? [] : rebase.merged);
    return {
      snapshot,
      stale,
      conflicts: rebase.conflicts,
      before,
      after: preview.document,
      changes: preview.changes.map((change) =>
        merged.has(change.index)
          ? { ...change, merged: true as const }
          : change,
      ),
      digest: await canvasDigest(publicCanvasProposal(proposal)),
      resultDigest: await canvasDigest(rebase.operations),
    };
  }
  async function decide(
    input: CanvasReviewDecision,
    context: ReviewContext,
    accept: boolean,
  ) {
    const who = await identity(context);
    canvasText(input.proposalId, "Proposal id", 500);
    canvasText(input.reviewToken, "Review token", 500);
    return transact(async (state) => {
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
      await verifyBaseline(proposal);
      let document = state.document;
      if (accept) {
        const rebase = assess(state.document, proposal);
        if (rebase.conflicts.length) throw new CanvasRevisionConflictError();
        // A merge depends on the live text. Apply only the exact result the human saw.
        if (receipt.resultDigest !== (await canvasDigest(rebase.operations)))
          throw new Error(
            "The suggestion was merged with newer edits. Review the updated result before confirming it.",
          );
        document = previewCanvasProposal(state.document, {
          ...proposal,
          operations: rebase.operations,
        }).document;
      }
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
          return transact(async (state) => {
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
              assess(state.document, proposal).conflicts.length > 0,
          };
        },
        /** This agent's own proposals, newest first. */
        async listProposals(status?: CanvasProposal["status"]) {
          const state = await read();
          return state.proposals
            .filter(
              (p) => p.actorId === actorId && (!status || p.status === status),
            )
            .reverse()
            .map((proposal) => ({
              ...publicCanvasProposal(proposal),
              stale:
                proposal.status === "pending" &&
                assess(state.document, proposal).conflicts.length > 0,
            }));
        },
        /** Decline one of this agent's own pending proposals, e.g. after it became obsolete. Never applies anything. */
        async withdraw(id: string) {
          canvasText(id, "Proposal id", 500);
          return transact(async (state) => {
            const proposal = pending(state, id);
            if (proposal.actorId !== actorId)
              throw new Error(
                "An agent may only withdraw its own pending proposals.",
              );
            proposal.status = "withdrawn";
            proposal.decision = {
              reviewerId: actorId,
              at: new Date(now()).toISOString(),
              revision: await canvasDigest(state.document),
            };
            delete proposal.review;
            return { state, result: publicCanvasProposal(proposal) };
          });
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
      return transact(async (state) => {
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
      const reusable = (
        proposal: StoredCanvasProposal,
        review: Awaited<ReturnType<typeof prepareReview>>,
      ) => {
        const existing = proposal.review;
        return (
          !!existing &&
          existing.reviewerId === who.reviewerId &&
          existing.digest === review.digest &&
          existing.resultDigest === review.resultDigest &&
          existing.expiresAt > now()
        );
      };
      const result = (
        proposal: StoredCanvasProposal,
        review: Awaited<ReturnType<typeof prepareReview>>,
      ): CanvasProposalReview => ({
        proposal: publicCanvasProposal(proposal),
        reviewToken: proposal.review!.token,
        baseRevision: proposal.baseRevision,
        currentRevision: review.snapshot.revision,
        stale: review.stale,
        conflicts: review.conflicts,
        before: structuredClone(review.before),
        after: review.after,
        changes: review.changes,
      });
      // An always-visible inbox reopens every card after each change. A still-valid
      // receipt for this reviewer and this exact result needs no write.
      const state = await read();
      const proposal = pending(state, id);
      const review = await prepareReview(state, proposal);
      if (reusable(proposal, review)) return result(proposal, review);
      return transact(async (state) => {
        const proposal = pending(state, id);
        const review = await prepareReview(state, proposal);
        // Several tabs may show the same proposal. Reuse a valid receipt for this
        // reviewer instead of invalidating those tabs.
        const existing = proposal.review;
        if (
          !existing ||
          existing.reviewerId !== who.reviewerId ||
          existing.digest !== review.digest ||
          existing.expiresAt <= now()
        )
          proposal.review = {
            token: crypto.randomUUID(),
            reviewerId: who.reviewerId,
            digest: review.digest,
            resultDigest: review.resultDigest,
            expiresAt: now() + lifetime,
          };
        else
          proposal.review = { ...existing, resultDigest: review.resultDigest };
        return { state, result: result(proposal, review) };
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
