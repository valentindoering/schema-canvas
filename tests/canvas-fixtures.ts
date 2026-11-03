import type { CanvasDocument } from "../src/core/index.js";
import { graph, layout } from "./fixtures.js";

export const canvasDocument: CanvasDocument = {
  graph,
  layout,
  views: [
    {
      id: "all",
      label: "Everything",
      tableIds: ["projects", "accounts"],
      edgeIds: graph.edges.map((e) => e.id),
    },
  ],
  annotations: [
    {
      id: "system",
      kind: "frame",
      label: "Fictional system",
      x: -40,
      y: -40,
      width: 800,
      height: 400,
      color: "blue",
    },
    {
      id: "guide",
      kind: "note",
      markdown: "# Guide\n\nKeep **exact** text.  \n",
      x: 0,
      y: 160,
      width: 220,
      height: 120,
      color: "slate",
    },
  ],
};
