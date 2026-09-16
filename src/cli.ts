#!/usr/bin/env node

import { readFile } from "node:fs/promises";

import { validateSchemaGraph, type SchemaGraph } from "./core/index.js";
import {
  addMissingLayoutEntries,
  checkSchemaLayoutFile,
  createLayoutStore,
} from "./server/layout/index.js";

const [command, ...arguments_] = process.argv.slice(2);
const graphPath = option(arguments_, "--graph");
const layoutPath = option(arguments_, "--layout");

if (!graphPath || !layoutPath || (command !== "check" && command !== "fix")) {
  console.error(
    "Usage: schema-canvas <check|fix> --graph <graph.json> --layout <layout.json>",
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
