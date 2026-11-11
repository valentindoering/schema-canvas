// @vitest-environment node
import { expect, it } from "vitest";
import { runReviewAtScale } from "./review-scale.js";

// Regression guard at the scale of a large production canvas (about 200 tables,
// eight pending table-note suggestions), with the document kept in separate
// layout and annotation files beside the proposal ledger. Before 0.6.0 every
// pending proposal stored a full document copy and each review returned two,
// so one accept and the following refresh of the other cards took seconds
// (measured on CI: accept 614 ms, refresh 2.7 s; since 0.6.0: 76 ms, 0.5 s).
it("accepts a suggestion and refreshes the other cards quickly at production scale", async () => {
  const run = await runReviewAtScale(8);
  console.info(
    `200 tables, 8 pending: accept ${run.accept.toFixed(0)} ms, refresh ${run.refresh.toFixed(0)} ms, review ${run.reviewBytes} B, ledger ${run.ledgerBytes} B`,
  );
  // Eight pending proposals; before 0.6.0 this ledger was about 9 MB.
  expect(run.ledgerBytes).toBeLessThan(60_000);
  expect(run.reviewBytes).toBeLessThan(40_000);
  // Generous for slow CI machines; locally both are well below this.
  expect(run.accept).toBeLessThan(1_500);
  expect(run.refresh).toBeLessThan(4_000);
}, 60_000);
