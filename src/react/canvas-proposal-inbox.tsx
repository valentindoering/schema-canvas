import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  canvasContextSvg,
  canvasDigest,
  canonicalCanvasJson,
  getCanvasContext,
  type CanvasBounds,
  type CanvasProposal,
  type CanvasProposalChange,
  type CanvasProposalReview,
  type CanvasReviewDecision,
} from "../core/index.js";
import { CanvasMarkdown } from "./markdown.js";
import { diffProposalText } from "./proposal-diff.js";
import type { SchemaCanvasLabels } from "./types.js";

export type CanvasProposalReviewControls = {
  /** The current authoritative composite document revision, updated by the host. */
  revision: string;
  proposals: readonly CanvasProposal[];
  /** Called when a suggestion is displayed, before its decision actions become available. */
  onOpenReview: (proposalId: string) => Promise<CanvasProposalReview>;
  /** These callbacks must invoke authenticated HUMAN endpoints, never agent tools. */
  onAccept: (decision: CanvasReviewDecision) => Promise<void>;
  onReject: (decision: CanvasReviewDecision) => Promise<void>;
};
export type CanvasProposalLocation = {
  tableIds: string[];
  annotationIds: string[];
  edgeId?: string;
  /** Used to locate a proposed annotation that does not exist on the live canvas yet. */
  bounds?: CanvasBounds;
};

function proposalKey(proposal: CanvasProposal) {
  // Host receipts may change while opening a review; they are not proposal edits.
  return canonicalCanvasJson({
    id: proposal.id,
    actorId: proposal.actorId,
    baseRevision: proposal.baseRevision,
    title: proposal.title,
    reason: proposal.reason,
    operations: proposal.operations,
  });
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
function locationFor(
  change: CanvasProposalChange,
  review: CanvasProposalReview,
): CanvasProposalLocation {
  const edge = review.before.graph.edges.find((e) => e.id === change.objectId);
  if (edge)
    return {
      tableIds: [edge.source, edge.target],
      annotationIds: [],
      edgeId: edge.id,
    };
  if (!change.objectId.startsWith("annotation:"))
    return { tableIds: [change.objectId], annotationIds: [] };
  const id = change.objectId.slice("annotation:".length);
  const annotation =
    review.before.annotations.find((a) => a.id === id) ??
    review.after.annotations.find((a) => a.id === id);
  return {
    tableIds: [],
    annotationIds: [id],
    ...(annotation
      ? {
          bounds: {
            x: annotation.x,
            y: annotation.y,
            width: annotation.width,
            height: annotation.height,
          },
        }
      : {}),
  };
}
function titleFor(change: CanvasProposalChange, review: CanvasProposalReview) {
  const table = review.before.graph.tables.find(
    (t) => t.id === change.objectId,
  );
  const edge = review.before.graph.edges.find((e) => e.id === change.objectId);
  const annotation = [
    ...review.before.annotations,
    ...review.after.annotations,
  ].find((a) => `annotation:${a.id}` === change.objectId);
  return (
    table?.label ??
    (edge
      ? `${edge.source}.${edge.field} → ${edge.target}`
      : (annotation?.label ??
        annotation?.markdown?.split("\n")[0]?.replace(/^#+\s*/, "") ??
        change.objectId))
  );
}
function display(
  value: unknown,
  key: string,
  labels: SchemaCanvasLabels,
): string {
  if (key === "muted")
    return value === true
      ? labels.toneMuted
      : value === false
        ? labels.toneDark
        : labels.toneAuto;
  if (key === "hidden")
    return value === true ? labels.hidden : labels.reviewVisible;
  if (key === "route")
    return value === "smoothstep" ? labels.elbow : labels.straight;
  return value === undefined
    ? "—"
    : typeof value === "string"
      ? value
      : JSON.stringify(value);
}

function UnifiedDiff({
  before,
  after,
  labels,
}: {
  before: string;
  after: string;
  labels: SchemaCanvasLabels;
}) {
  const lines = diffProposalText(before, after);
  const row = (line: (typeof lines)[number], index: number) => (
    <span
      className={`schema-canvas__diff-line schema-canvas__diff-line--${line.kind}`}
      key={index}
    >
      <span
        role={line.kind === "context" ? undefined : "img"}
        aria-hidden={line.kind === "context"}
        aria-label={
          line.kind === "added"
            ? labels.afterChange
            : line.kind === "removed"
              ? labels.beforeChange
              : undefined
        }
      >
        {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}
      </span>
      <span>{line.text || " "}</span>
    </span>
  );
  const parts = [];
  for (let i = 0; i < lines.length;) {
    if (lines[i]!.kind !== "context") {
      parts.push(row(lines[i]!, i));
      i++;
      continue;
    }
    let end = i;
    while (end < lines.length && lines[end]!.kind === "context") end++;
    const lead = i === 0 ? 0 : 2;
    const tail = end === lines.length ? 0 : 2;
    if (end - i > lead + tail + 2) {
      parts.push(
        ...lines.slice(i, i + lead).map((line, index) => row(line, i + index)),
      );
      parts.push(
        <details className="schema-canvas__diff-context" key={`context-${i}`}>
          <summary>
            … {end - i - lead - tail} {labels.reviewUnchangedLines}
          </summary>
          {lines
            .slice(i + lead, end - tail)
            .map((line, index) => row(line, i + lead + index))}
        </details>,
      );
      parts.push(
        ...lines
          .slice(end - tail, end)
          .map((line, index) => row(line, end - tail + index)),
      );
    } else
      parts.push(
        ...lines.slice(i, end).map((line, index) => row(line, i + index)),
      );
    i = end;
  }
  return (
    <div
      className="schema-canvas__proposal-diff"
      role="group"
      aria-label={labels.reviewDocumentation}
    >
      {parts}
    </div>
  );
}

function ChangeDetails({
  change,
  labels,
}: {
  change: CanvasProposalChange;
  labels: SchemaCanvasLabels;
}) {
  const before = record(change.before),
    after = record(change.after);
  const keys = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ].filter(
    (key) =>
      key !== "id" &&
      canonicalCanvasJson(before[key] ?? null) !==
        canonicalCanvasJson(after[key] ?? null),
  );
  const names: Record<string, string> = {
    label: labels.label,
    appearance: labels.appearance,
    color: labels.color,
    hidden: labels.hidden,
    muted: labels.edgeTone,
    route: labels.route,
    fontSize: labels.fontSize,
    kind: labels.reviewKind,
    targetTable: labels.targetTable,
  };
  const position =
    change.after !== null && keys.some((key) => key === "x" || key === "y");
  const size =
    change.after !== null &&
    keys.some((key) => key === "width" || key === "height");
  return (
    <div className="schema-canvas__proposal-details">
      {change.operation === "delete_annotation" ? (
        <p className="schema-canvas__proposal-delete">
          {labels.reviewDeleteAnnotation}
        </p>
      ) : null}
      {position ? (
        <p className="schema-canvas__proposal-property">
          <span>{labels.reviewPosition}</span>
          <code>
            {change.before ? `(${before.x}, ${before.y}) → ` : ""}(
            {display(after.x, "x", labels)}, {display(after.y, "y", labels)})
          </code>
        </p>
      ) : null}
      {size ? (
        <p className="schema-canvas__proposal-property">
          <span>{labels.reviewSize}</span>
          <code>
            {change.before ? `${before.width} × ${before.height} → ` : ""}
            {display(after.width, "width", labels)} ×{" "}
            {display(after.height, "height", labels)}
          </code>
        </p>
      ) : null}
      {keys
        .filter((key) => !["x", "y", "width", "height"].includes(key))
        .map((key) =>
          key === "markdown" || key === "text" ? (
            <UnifiedDiff
              key={key}
              before={
                typeof before[key] === "string" ? (before[key] as string) : ""
              }
              after={
                typeof after[key] === "string" ? (after[key] as string) : ""
              }
              labels={labels}
            />
          ) : (
            <p className="schema-canvas__proposal-property" key={key}>
              <span>{names[key] ?? key}</span>
              <span>
                <del>{display(before[key], key, labels)}</del>{" "}
                <span aria-hidden="true">→</span>{" "}
                <ins>{display(after[key], key, labels)}</ins>
              </span>
            </p>
          ),
        )}
    </div>
  );
}

function FocusedPreview({
  change,
  review,
  labels,
}: {
  change: CanvasProposalChange;
  review: CanvasProposalReview;
  labels: SchemaCanvasLabels;
}) {
  const [expanded, setExpanded] = useState(false);
  const [image, setImage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    const location = locationFor(change, review);
    const document =
      change.operation === "delete_annotation" ? review.before : review.after;
    void getCanvasContext(
      document,
      location.tableIds.length
        ? { tableIds: location.tableIds }
        : { annotationIds: location.annotationIds },
    )
      .then(async (context) => {
        // A table preview must never expand to the surrounding frames or their notes.
        context.annotations = context.annotations.filter((a) =>
          location.annotationIds.includes(a.annotation.id),
        );
        context.tables = context.tables.filter((t) =>
          location.tableIds.includes(t.table.id),
        );
        context.spatial = [];
        // Keep even distant arrow endpoints legible in a compact card preview.
        context.tables = context.tables.map((table, index) => ({
          ...table,
          bounds: table.bounds
            ? { ...table.bounds, x: index * 360, y: 0 }
            : null,
          frameIds: [],
        }));
        context.relationships = context.relationships.filter(
          (e) =>
            location.tableIds.includes(e.source) &&
            location.tableIds.includes(e.target),
        );
        context.snapshotId = await canvasDigest({ ...context, snapshotId: "" });
        if (!cancelled) setImage(canvasContextSvg(context));
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, change, review]);
  return (
    <details
      className="schema-canvas__proposal-preview"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>{labels.reviewPreview}</summary>
      {expanded ? (
        error ? (
          <p role="alert">{error}</p>
        ) : image ? (
          <>
            <img
              alt={`${labels.reviewPreview}: ${titleFor(change, review)}`}
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(image)}`}
            />
            <p>{labels.reviewDiagramNotice}</p>
          </>
        ) : (
          <p role="status">{labels.loadingContext}</p>
        )
      ) : null}
    </details>
  );
}

function ProposalCard({
  proposal,
  controls,
  labels,
  hasUnsavedChanges,
  loadReview,
  onNavigate,
  onDecided,
  deciding,
  setDeciding,
}: {
  proposal: CanvasProposal;
  controls: CanvasProposalReviewControls;
  labels: SchemaCanvasLabels;
  hasUnsavedChanges: boolean;
  loadReview: (
    proposal: CanvasProposal,
    revision: string,
    refresh?: boolean,
  ) => Promise<CanvasProposalReview>;
  onNavigate?: (location: CanvasProposalLocation) => void;
  onDecided: (id: string) => void;
  deciding: boolean;
  setDeciding: (value: boolean) => void;
}) {
  const [review, setReview] = useState<CanvasProposalReview>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [working, setWorking] = useState(false);
  const latest = useRef({ controls, proposal });
  latest.current = { controls, proposal };
  const fingerprint = proposalKey(proposal);
  useEffect(() => {
    let cancelled = false;
    setReview(undefined);
    setError("");
    void loadReview(
      latest.current.proposal,
      controls.revision,
      attempt > 0,
    ).then(
      (value) => {
        if (!cancelled) setReview(value);
      },
      (cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fingerprint, loadReview, attempt, controls.revision]);
  const exact = review && proposalKey(review.proposal) === fingerprint;
  const stale =
    !!review && (review.stale || review.currentRevision !== controls.revision);
  const decide = async (accept: boolean) => {
    if (
      !exact ||
      !review ||
      deciding ||
      working ||
      hasUnsavedChanges ||
      (accept && stale)
    )
      return;
    setDeciding(true);
    setWorking(true);
    setError("");
    try {
      const decision = {
        proposalId: proposal.id,
        reviewToken: review.reviewToken,
      };
      if (accept) await latest.current.controls.onAccept(decision);
      else await latest.current.controls.onReject(decision);
      onDecided(proposal.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setWorking(false);
      setDeciding(false);
    }
  };
  return (
    <article
      className="schema-canvas__proposal-card"
      aria-label={proposal.title}
      aria-busy={working}
    >
      <h3>{proposal.title}</h3>
      <p className="schema-canvas__proposal-author">
        {labels.proposedBy} {proposal.actorId}
      </p>
      {exact && review ? (
        <div className="schema-canvas__review-changes">
          {review.changes.map((change) => (
            <section
              className="schema-canvas__proposal-change"
              key={change.index}
              aria-label={titleFor(change, review)}
            >
              <header>
                <strong>{titleFor(change, review)}</strong>
                {onNavigate ? (
                  <button
                    type="button"
                    onClick={() => onNavigate(locationFor(change, review))}
                    aria-label={`${labels.goToSuggestion} ${titleFor(change, review)}`}
                  >
                    {labels.goToSuggestion} <span aria-hidden="true">↗</span>
                  </button>
                ) : null}
              </header>
              <ChangeDetails change={change} labels={labels} />
              {change.operation !== "move_table" ? (
                <FocusedPreview
                  change={change}
                  review={review}
                  labels={labels}
                />
              ) : null}
            </section>
          ))}
        </div>
      ) : !error ? (
        <p role="status">{labels.reviewWorking}</p>
      ) : null}
      <details className="schema-canvas__proposal-reason">
        <summary>{labels.reviewReason}</summary>
        <CanvasMarkdown source={proposal.reason} />
      </details>
      {stale ? (
        <p className="schema-canvas__proposal-warning" role="alert">
          {labels.staleProposal}
        </p>
      ) : null}
      {error ? (
        <div className="schema-canvas__proposal-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            disabled={deciding}
            onClick={() => setAttempt((value) => value + 1)}
          >
            {labels.reviewRetry}
          </button>
        </div>
      ) : null}
      <footer>
        <button
          type="button"
          disabled={!exact || deciding || hasUnsavedChanges}
          onClick={() => void decide(false)}
        >
          {labels.rejectSuggestion}
        </button>
        <button
          className="schema-canvas__accept-proposal"
          type="button"
          disabled={!exact || deciding || stale || hasUnsavedChanges}
          onClick={() => void decide(true)}
        >
          {working ? labels.reviewWorking : labels.applyReviewedChanges}
        </button>
      </footer>
    </article>
  );
}

export function CanvasProposalInbox({
  controls,
  labels,
  hasUnsavedChanges,
  onNavigate,
}: {
  controls: CanvasProposalReviewControls;
  labels: SchemaCanvasLabels;
  hasUnsavedChanges: boolean;
  onNavigate?: (location: CanvasProposalLocation) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [decided, setDecided] = useState<Set<string>>(() => new Set());
  const [deciding, setDeciding] = useState(false);
  const pending = controls.proposals.filter(
    (p) => p.status === "pending" && !decided.has(p.id),
  );
  const listId = useId();
  const panel = useRef<HTMLElement>(null);
  const latest = useRef(controls);
  latest.current = controls;
  const requests = useRef(new Map<string, Promise<CanvasProposalReview>>());
  const loadReview = useCallback(
    (proposal: CanvasProposal, revision: string, refresh = false) => {
      const key = canonicalCanvasJson({
        proposal: proposalKey(proposal),
        revision,
      });
      let request = requests.current.get(key);
      if (!request || refresh) {
        request = Promise.resolve()
          .then(() => latest.current.onOpenReview(proposal.id))
          .then((review) => {
            if (proposalKey(review.proposal) !== proposalKey(proposal))
              throw new Error(
                "The returned review does not match this suggestion. Refresh it before deciding.",
              );
            return review;
          });
        requests.current.set(key, request);
        void request.catch(() => {
          if (requests.current.get(key) === request)
            requests.current.delete(key);
        });
      }
      return request;
    },
    [],
  );
  useEffect(() => {
    const active = new Set(
      controls.proposals
        .filter((proposal) => proposal.status === "pending")
        .map((proposal) =>
          canonicalCanvasJson({
            proposal: proposalKey(proposal),
            revision: controls.revision,
          }),
        ),
    );
    for (const key of requests.current.keys())
      if (!active.has(key)) requests.current.delete(key);
  }, [controls.proposals, controls.revision]);
  if (!pending.length) return null;
  return (
    <aside
      ref={panel}
      className={`schema-canvas__proposal-inbox${collapsed ? " schema-canvas__proposal-inbox--collapsed" : ""}`}
      aria-label={labels.reviewSuggestions}
    >
      <button
        className="schema-canvas__proposal-inbox-heading"
        type="button"
        aria-label={
          collapsed ? labels.expandSuggestions : labels.collapseSuggestions
        }
        aria-expanded={!collapsed}
        aria-controls={listId}
        onClick={() => setCollapsed((value) => !value)}
      >
        <span>
          {labels.reviewSuggestions}{" "}
          <span className="schema-canvas__proposal-count">
            {pending.length}
          </span>
        </span>
        <span aria-hidden="true">{collapsed ? "+" : "−"}</span>
      </button>
      <div
        className="schema-canvas__proposal-inbox-list"
        id={listId}
        hidden={collapsed}
      >
        {!collapsed ? (
          <>
            {hasUnsavedChanges ? (
              <p className="schema-canvas__proposal-warning" role="status">
                {labels.reviewUnsaved}
              </p>
            ) : null}
            {pending.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                controls={controls}
                labels={labels}
                hasUnsavedChanges={hasUnsavedChanges}
                loadReview={loadReview}
                deciding={deciding}
                setDeciding={setDeciding}
                onDecided={(id) =>
                  setDecided((current) => new Set([...current, id]))
                }
                {...(onNavigate
                  ? {
                      onNavigate: (location: CanvasProposalLocation) => {
                        const width =
                          panel.current?.closest(".schema-canvas")?.clientWidth;
                        if (width && width <= 760) setCollapsed(true);
                        requestAnimationFrame(() => onNavigate(location));
                      },
                    }
                  : {})}
              />
            ))}
          </>
        ) : null}
      </div>
    </aside>
  );
}
