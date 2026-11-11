// @vitest-environment node
import { it } from "vitest";
import { runReviewAtScale } from "./review-scale.js";
import { runReviewAtScale as baseline } from "./review-scale-baseline.js";
import { scaleDocument } from "./scale-fixture.js";

it("measures", async () => {
  console.log("doc bytes", JSON.stringify(scaleDocument()).length);
  for (const pending of [3, 8]) {
    console.log("before", pending, await baseline(pending));
    console.log("after", pending, await runReviewAtScale(pending));
  }
}, 600_000);
