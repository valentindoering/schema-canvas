import { describe, expect, it } from "vitest";

import {
  CanvasEditHistory,
  type CanvasEditSnapshot,
} from "../src/react/edit-history.js";

const initial: CanvasEditSnapshot = { layout: {}, annotations: [] };

describe("canvas edit history", () => {
  it("undoes and redoes a layout edit", () => {
    const history = new CanvasEditHistory();
    const moved = { ...initial, layout: { planets: { x: 40, y: 20 } } };
    history.record(initial, moved);
    expect(history.undo(moved)).toBe(initial);
    expect(history.redo(initial)).toBe(moved);
  });

  it("treats an entire drag as one edit", () => {
    const history = new CanvasEditHistory();
    const middle = { ...initial, layout: { planets: { x: 20, y: 0 } } };
    const end = { ...initial, layout: { planets: { x: 60, y: 0 } } };
    history.beginGesture(initial);
    history.beginGesture(middle);
    history.record(middle, end);
    expect(history.undo(end)).toBe(initial);
    expect(history.canUndo).toBe(false);
  });

  it("groups consecutive Markdown edits and clears redo after a new edit", () => {
    const history = new CanvasEditHistory();
    const first = {
      ...initial,
      layout: { planets: { x: 0, y: 0, markdown: "A" } },
    };
    const second = {
      ...initial,
      layout: { planets: { x: 0, y: 0, markdown: "AB" } },
    };
    history.record(initial, first, "planets:markdown");
    history.record(first, second, "planets:markdown");
    expect(history.undo(second)).toBe(initial);
    const replacement = { ...initial, layout: { stars: { x: 0, y: 0 } } };
    history.record(initial, replacement);
    expect(history.canRedo).toBe(false);
  });
});
