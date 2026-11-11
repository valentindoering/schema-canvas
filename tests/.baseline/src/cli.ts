#!/usr/bin/env node

import { readFile } from "node:fs/promises";

import { validateSchemaGraph, type SchemaGraph } from "./core/index.js";
import {
  addMissingLayoutEntries,
  checkSchemaLayoutFile,
  createLayoutStore,
} from "./server/layout/index.js";
import { migrateSchemaAnnotationsFile } from "./server/annotations/index.js";

const [command, ...arguments_] = process.argv.slice(2);
const graphPath = option(arguments_, "--graph");
const layoutPath = option(arguments_, "--layout");
const annotationsPath = option(arguments_, "--annotations");

const reviewPath = option(arguments_, "--state");
if (command === "agent" && reviewPath) {
  const { createCanvasReviewService } = await import("./core/canvas-review.js");
  const { createFileCanvasReviewStore } =
    await import("./server/review-store/index.js");
  const { createCanvasAgentServer } = await import("./server/agent/index.js");
  const { StdioServerTransport } =
    await import("@modelcontextprotocol/server/stdio");
  const store = createFileCanvasReviewStore({ filePath: reviewPath });
  await store.read();
  const service = createCanvasReviewService({
    store,
    authorizeReview: () => {
      throw new Error(
        "Human approval is unavailable over the agent transport.",
      );
    },
  });
  const reviewUrl = option(arguments_, "--review-url");
  const server = createCanvasAgentServer(
    service.agent(option(arguments_, "--actor") ?? "local-agent"),
    reviewUrl
      ? {
          reviewUrl: (id) => {
            const url = new URL(reviewUrl);
            url.searchParams.set("proposal", id);
            return url.href;
          },
        }
      : {},
  );
  await server.connect(new StdioServerTransport());
} else if (
  command === "init-review" &&
  reviewPath &&
  option(arguments_, "--document")
) {
  const { initializeCanvasReviewFile } =
    await import("./server/review-store/index.js");
  await initializeCanvasReviewFile(
    reviewPath,
    JSON.parse(await readFile(option(arguments_, "--document")!, "utf8")),
  );
  console.log("Initialized canvas documentation and its proposal ledger.");
} else if (command === "migrate-annotations" && annotationsPath) {
  const result = await migrateSchemaAnnotationsFile(annotationsPath);
  console.log(
    result.changed
      ? `Migrated ${result.annotations.length} annotation(s).`
      : "Annotations already use the current format.",
  );
} else if (
  !graphPath ||
  !layoutPath ||
  (command !== "check" && command !== "fix")
) {
  console.error(
    "Usage: schema-canvas <check|fix> --graph <graph.json> --layout <layout.json> | migrate-annotations --annotations <annotations.json> | init-review --document <document.json> --state <review.json> | agent --state <review.json> [--actor <id>] [--review-url <url>]",
  );
  process.exitCode = 2;
} else {
  const graph = validateSchemaGraph(
    JSON.parse(await readFile(graphPath, "utf8")) as SchemaGraph,
  );
  const result = await checkSchemaLayoutFile(layoutPath, graph);
  if (command === "check") {
    if (result.missingTableIds.length) {
      console.error(
        `Layout is missing ${result.missingTableIds.length} table(s): ${result.missingTableIds.join(", ")}`,
      );
      process.exitCode = 1;
    } else {
      console.log("Schema layout is valid and complete.");
    }
  } else {
    const store = createLayoutStore({ filePath: layoutPath, graph });
    const fixed = addMissingLayoutEntries(graph, result.layout);
    await store.write(fixed);
    console.log(`Added ${result.missingTableIds.length} missing table(s).`);
  }
}

function option(arguments_: string[], name: string) {
  const index = arguments_.indexOf(name);
  return index >= 0 ? arguments_[index + 1] : undefined;
}
