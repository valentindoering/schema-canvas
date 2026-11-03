import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  previewCanvasProposal,
  type CanvasProposal,
  type CanvasProposalReview,
} from "../src/core/index.js";
import {
  CanvasProposalInbox,
  defaultSchemaCanvasLabels as labels,
  type CanvasProposalReviewControls,
} from "../src/react/index.js";
import { canvasDocument } from "./canvas-fixtures.js";
afterEach(cleanup);
function fixture(id = "proposal-1") {
  const proposal: CanvasProposal = {
    id,
    baseRevision: "revision-1",
    title: `Guide ${id}`,
    reason: "Explain the fictional project boundary.",
    actorId: "example assistant",
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "pending",
    operations: [
      {
        op: "set_table_markdown",
        tableId: "projects",
        markdown: "# Proposed guide",
      },
    ],
  };
  const preview = previewCanvasProposal(canvasDocument, proposal);
  const review: CanvasProposalReview = {
    proposal,
    reviewToken: "human-receipt",
    baseRevision: proposal.baseRevision,
    currentRevision: proposal.baseRevision,
    stale: false,
    before: canvasDocument,
    after: preview.document,
    changes: preview.changes,
  };
  const controls: CanvasProposalReviewControls = {
    revision: proposal.baseRevision,
    proposals: [proposal],
    onOpenReview: vi.fn(async () => review),
    onAccept: vi.fn(async () => undefined),
    onReject: vi.fn(async () => undefined),
  };
  return { proposal, review, controls };
}
describe("persistent suggestion panel", () => {
  it("shows the exact diff automatically and accepts with one explicit click", async () => {
    const { controls } = fixture();
    render(
      <StrictMode>
        <CanvasProposalInbox
          controls={controls}
          labels={labels}
          hasUnsavedChanges={false}
        />
      </StrictMode>,
    );
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Accept" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect(
      screen.getByRole("complementary", { name: "Suggestions" }),
    ).toBeTruthy();
    expect(screen.getByText("# Proposed guide")).toBeTruthy();
    expect(
      screen.getAllByRole("img", { name: "After" }).length,
    ).toBeGreaterThan(0);
    expect(controls.onOpenReview).toHaveBeenCalledTimes(1);
    expect(controls.onAccept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() =>
      expect(controls.onAccept).toHaveBeenCalledWith({
        proposalId: "proposal-1",
        reviewToken: "human-receipt",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
  });
  it("folds long unchanged sections while keeping every edited line visible", async () => {
    const { controls, proposal, review } = fixture();
    const before = structuredClone(canvasDocument);
    before.layout.projects!.markdown = Array.from(
      { length: 80 },
      (_, i) => `Unchanged rule ${i}`,
    ).join("\n");
    proposal.operations = [
      {
        op: "set_table_markdown",
        tableId: "projects",
        markdown: `${before.layout.projects!.markdown}\nNew explicit rule`,
      },
    ];
    const preview = previewCanvasProposal(before, proposal);
    controls.onOpenReview = vi.fn(async () => ({
      ...review,
      proposal,
      before,
      after: preview.document,
      changes: preview.changes,
    }));
    render(
      <CanvasProposalInbox
        controls={controls}
        labels={labels}
        hasUnsavedChanges={false}
      />,
    );
    await screen.findByText("New explicit rule");
    const group = screen.getByRole("group", { name: "Documentation" });
    const folded = group.querySelector("details")!;
    expect(folded.open).toBe(false);
    expect(folded.textContent).toContain("78 unchanged lines");
    expect(folded.contains(screen.getByText("New explicit rule"))).toBe(false);
    expect(
      group.querySelectorAll(".schema-canvas__diff-line--added"),
    ).toHaveLength(1);
  });
  it("declines individual cards without applying another suggestion", async () => {
    const a = fixture(),
      b = fixture("proposal-2");
    const controls = {
      ...a.controls,
      proposals: [a.proposal, b.proposal],
      onOpenReview: vi.fn(async (id: string) =>
        id === a.proposal.id ? a.review : b.review,
      ),
    };
    render(
      <CanvasProposalInbox
        controls={controls}
        labels={labels}
        hasUnsavedChanges={false}
      />,
    );
    const first = within(
      screen.getByRole("article", { name: a.proposal.title }),
    );
    await waitFor(() =>
      expect(
        (first.getByRole("button", { name: "Decline" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.click(first.getByRole("button", { name: "Decline" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("article", { name: a.proposal.title }),
      ).toBeNull(),
    );
    expect(
      screen.getByRole("article", { name: b.proposal.title }),
    ).toBeTruthy();
    expect(controls.onAccept).not.toHaveBeenCalled();
    expect(controls.onReject).toHaveBeenCalledTimes(1);
  });
  it("blocks stale or unsaved acceptance and preserves the panel on a failed decision", async () => {
    const { controls } = fixture();
    controls.onAccept = vi.fn(async () => {
      throw new Error("Save failed");
    });
    const view = render(
      <CanvasProposalInbox
        controls={controls}
        labels={labels}
        hasUnsavedChanges={true}
      />,
    );
    await screen.findByText("# Proposed guide");
    expect(
      (screen.getByRole("button", { name: "Accept" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    view.rerender(
      <CanvasProposalInbox
        controls={controls}
        labels={labels}
        hasUnsavedChanges={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await screen.findByText("Save failed");
    expect(screen.getByRole("article")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh review" }));
    await waitFor(() => expect(controls.onOpenReview).toHaveBeenCalledTimes(2));
  });
  it("blocks a conflicting review while still allowing decline", async () => {
    const { controls, review } = fixture();
    controls.revision = "changed";
    controls.onOpenReview = vi.fn(async () => ({
      ...review,
      currentRevision: "changed",
      stale: true,
    }));
    render(
      <CanvasProposalInbox
        controls={controls}
        labels={labels}
        hasUnsavedChanges={false}
      />,
    );
    await screen.findByText("# Proposed guide");
    expect(
      (screen.getByRole("button", { name: "Accept" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Decline" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
  it("does not enable actions before a review loads, and retries load failures", async () => {
    const { controls, review } = fixture();
    controls.onOpenReview = vi
      .fn()
      .mockRejectedValueOnce(new Error("Review unavailable"))
      .mockResolvedValue(review);
    render(
      <CanvasProposalInbox
        controls={controls}
        labels={labels}
        hasUnsavedChanges={false}
      />,
    );
    expect(
      (screen.getByRole("button", { name: "Accept" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await screen.findByText("Review unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Refresh review" }));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Accept" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
  });
  it("collapses and reopens without losing suggestions or requesting a second receipt", async () => {
    const { controls } = fixture();
    render(
      <CanvasProposalInbox
        controls={controls}
        labels={labels}
        hasUnsavedChanges={false}
      />,
    );
    await screen.findByText("# Proposed guide");
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse suggestions" }),
    );
    expect(screen.queryByRole("article")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand suggestions" }));
    await screen.findByText("# Proposed guide");
    expect(controls.onOpenReview).toHaveBeenCalledTimes(1);
  });
  it("targets the affected table without deciding or changing the live document", async () => {
    const { controls, review } = fixture();
    const onNavigate = vi.fn();
    render(
      <CanvasProposalInbox
        controls={controls}
        labels={labels}
        hasUnsavedChanges={false}
        onNavigate={onNavigate}
      />,
    );
    await screen.findByText("# Proposed guide");
    fireEvent.click(screen.getByRole("button", { name: "Go to Projects" }));
    await waitFor(() =>
      expect(onNavigate).toHaveBeenCalledWith({
        tableIds: ["projects"],
        annotationIds: [],
      }),
    );
    expect(controls.onAccept).not.toHaveBeenCalled();
    expect(review.before).toEqual(canvasDocument);
  });
  it("refuses a review for a different proposal", async () => {
    const { controls } = fixture();
    controls.onOpenReview = vi.fn(async () => fixture("another").review);
    render(
      <CanvasProposalInbox
        controls={controls}
        labels={labels}
        hasUnsavedChanges={false}
      />,
    );
    await screen.findByText(/does not match this suggestion/);
    expect(
      (screen.getByRole("button", { name: "Accept" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("disables both decisions while a request is in flight", async () => {
    const { controls } = fixture();
    let finish!: () => void;
    controls.onAccept = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <CanvasProposalInbox
        controls={controls}
        labels={labels}
        hasUnsavedChanges={false}
      />,
    );
    await screen.findByText("# Proposed guide");
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(
      (screen.getByRole("button", { name: "Decline" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(controls.onAccept).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });
});
