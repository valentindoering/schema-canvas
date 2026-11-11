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
  applyCanvasProposalBase,
  canvasProposalBase,
  focusCanvasDocument,
  parseCanvasProposalBase,
  parseCanvasProposalInput,
  previewCanvasProposal,
  rebaseCanvasProposal,
  type CanvasProposal,
  type CanvasProposalBase,
  type CanvasProposalChange,
  type CanvasProposalConflict,
  type CanvasProposalInput,
  type CanvasProposalReview,
} from "./canvas-proposals.js";
import { assertRecord } from "./shared.js";

export type StoredCanvasProposal = CanvasProposal & {
  /**
   * Present while pending: the base values of the objects the proposal writes.
   * Dropped once decided. Ledgers written before 0.6.0 stored a full
   * `baseDocument` instead; parsing converts it to this excerpt.
   */
  base?: CanvasProposalBase;
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

/** Decided proposals keep their audit record, not their baseline. */
function compact(state: CanvasReviewState): CanvasReviewState {
  return {
    ...state,
    proposals: state.proposals.map((proposal) => {
      if (proposal.status === "pending") return proposal;
      const {
        base: _base,
        rebaseRequest: _rebaseRequest,
        ...decided
      } = proposal;
      return decided;
    }),
  };
}
function baseline(proposal: StoredCanvasProposal): CanvasProposalBase {
  if (!proposal.base) throw new Error("A pending proposal needs its baseline.");
  return proposal.base;
}
function assess(document: CanvasDocument, proposal: StoredCanvasProposal) {
  return rebaseCanvasProposal(
    baseline(proposal),
    document,
    proposal.operations,
  );
}
/** What a review receipt binds: the proposal as submitted and the base it is compared with. */
function receiptDigest(proposal: StoredCanvasProposal) {
  // A rebase request is the reviewer's own note, not a change to review.
  const { rebaseRequest: _rebaseRequest, ...visible } =
    publicCanvasProposal(proposal);
  return canvasDigest({ proposal: visible, base: proposal.base ?? null });
}
/** Convert a pre-0.6.0 full baseline document to the excerpt the proposal needs. */
function legacyBase(candidate: unknown, input: CanvasProposalInput) {
  assertRecord(candidate, "Invalid stored baseline document.");
  assertRecord(candidate.graph, "Invalid stored baseline document.");
  assertRecord(candidate.layout, "Invalid stored baseline document.");
  if (
    !Array.isArray(candidate.graph.edges) ||
    !Array.isArray(candidate.annotations)
  )
    throw new Error("Invalid stored baseline document.");
  return canvasProposalBase(
    candidate as unknown as CanvasDocument,
    input.operations,
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
        "base",
        "baseDocument",
        "rebaseRequest",
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
    if (raw.rebaseRequest !== undefined) {
      assertRecord(raw.rebaseRequest, "Invalid rebase request.");
      canvasKeys(raw.rebaseRequest, ["reviewerId", "at"], "Rebase request");
      canvasText(raw.rebaseRequest.reviewerId, "reviewerId", 500);
      canvasText(raw.rebaseRequest.at, "at", 500);
      if (
        raw.status !== "pending" ||
        !Number.isFinite(Date.parse(raw.rebaseRequest.at as string))
      )
        throw new Error("Invalid rebase request.");
    }
    const { baseDocument, base: rawBase, ...rest } = raw;
    const stored = {
      ...structuredClone(rest),
      ...input,
    } as StoredCanvasProposal;
    if (raw.status === "pending") {
      if (rawBase === undefined && baseDocument === undefined)
        throw new Error("A pending proposal needs its baseline.");
      stored.base = parseCanvasProposalBase(
        rawBase ?? legacyBase(baseDocument, input),
      );
    }
    return stored;
  });
  return { version: 1, document, proposals };
}
export function publicCanvasProposal(
  proposal: StoredCanvasProposal,
): CanvasProposal {
  const {
    review: _review,
    base: _base,
    baseDocument: _baseDocument,
    ...visible
  } = proposal as StoredCanvasProposal & { baseDocument?: unknown };
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
  /** Whether a pending proposal still applies, and which fields block it. */
  const staleness = (
    state: CanvasReviewState,
    proposal: StoredCanvasProposal,
  ): { stale: boolean; conflicts: CanvasProposalConflict[] } => {
    if (proposal.status !== "pending") return { stale: false, conflicts: [] };
    const { conflicts } = assess(state.document, proposal);
    return { stale: conflicts.length > 0, conflicts };
  };
  /** Everything a reviewer sees, computed without writing. `state` is already validated. */
  async function prepareReview(
    state: CanvasReviewState,
    proposal: StoredCanvasProposal,
  ) {
    const revision = await canvasDigest(state.document);
    const rebase = assess(state.document, proposal);
    const stale = rebase.conflicts.length > 0;
    // A stale proposal shows what it meant: its operations on its own base.
    let before = stale
      ? applyCanvasProposalBase(state.document, baseline(proposal))
      : state.document;
    let after = before;
    let changes: CanvasProposalChange[] = [];
    try {
      const preview = previewCanvasProposal(before, {
        ...proposal,
        operations: stale ? proposal.operations : rebase.operations,
      });
      after = preview.document;
      changes = preview.changes;
    } catch (cause) {
      // Its target is gone from the schema: only the conflicts remain to show.
      if (!stale) throw cause;
      before = after = state.document;
    }
    const merged = new Set(stale ? [] : rebase.merged);
    const objects = [
      ...changes.map((change) => change.objectId),
      ...rebase.conflicts.map((conflict) => conflict.objectId),
    ];
    return {
      revision,
      stale,
      conflicts: rebase.conflicts,
      before: focusCanvasDocument(before, objects),
      after: focusCanvasDocument(after, objects),
      changes: changes.map((change) =>
        merged.has(change.index)
          ? { ...change, merged: true as const }
          : change,
      ),
      digest: await receiptDigest(proposal),
      resultDigest: await canvasDigest(rebase.operations),
    };
  }
  const checkReceipt = async (
    proposal: StoredCanvasProposal,
    input: CanvasReviewDecision,
    who: CanvasReviewIdentity,
  ) => {
    const receipt = proposal.review;
    if (
      !receipt ||
      receipt.token !== input.reviewToken ||
      receipt.reviewerId !== who.reviewerId ||
      receipt.expiresAt <= now() ||
      receipt.digest !== (await receiptDigest(proposal))
    )
      throw new Error(
        "Open this exact proposal in the canvas before confirming it. The review may have expired.",
      );
    return receipt;
  };
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
      const receipt = await checkReceipt(proposal, input, who);
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
      delete proposal.rebaseRequest;
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
              base: canvasProposalBase(state.document, input.operations),
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
            ...staleness(state, proposal),
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
              ...staleness(state, proposal),
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
            delete proposal.rebaseRequest;
            return { state, result: publicCanvasProposal(proposal) };
          });
        },
      };
    },
    async listProposals() {
      return (await read()).proposals.map(publicCanvasProposal);
    },
    async readDocument(): Promise<CanvasSnapshot> {
      const { document } = await read();
      return { revision: await canvasDigest(document), document };
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
        currentRevision: review.revision,
        stale: review.stale,
        conflicts: review.conflicts,
        before: review.before,
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
    /**
     * A human asks the proposing agent to redo a suggestion on the current text,
     * typically because it became stale. Writes only the request; the agent sees
     * it in its own proposal list and proposes again.
     */
    async requestRebase(input: CanvasReviewDecision, context: ReviewContext) {
      const who = await identity(context);
      canvasText(input.proposalId, "Proposal id", 500);
      canvasText(input.reviewToken, "Review token", 500);
      return transact(async (state) => {
        const proposal = pending(state, input.proposalId);
        await checkReceipt(proposal, input, who);
        proposal.rebaseRequest = {
          reviewerId: who.reviewerId,
          at: new Date(now()).toISOString(),
        };
        return { state, result: publicCanvasProposal(proposal) };
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
