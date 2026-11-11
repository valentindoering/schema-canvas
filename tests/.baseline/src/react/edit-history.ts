import type { SchemaAnnotation, SchemaLayout } from "../core/index.js";

export type CanvasEditSnapshot = {
  layout: SchemaLayout;
  annotations: SchemaAnnotation[];
};

export class CanvasEditHistory {
  private past: CanvasEditSnapshot[] = [];
  private future: CanvasEditSnapshot[] = [];
  private gestureStart: CanvasEditSnapshot | null = null;
  private lastGroup: { key: string; time: number } | null = null;

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  beginGesture(snapshot: CanvasEditSnapshot) {
    this.gestureStart ??= snapshot;
  }

  record(
    before: CanvasEditSnapshot,
    after: CanvasEditSnapshot,
    group?: string,
  ) {
    const start = this.gestureStart ?? before;
    this.gestureStart = null;
    if (
      start.layout === after.layout &&
      start.annotations === after.annotations
    ) {
      return;
    }
    this.future = [];
    const now = Date.now();
    if (
      group &&
      this.lastGroup?.key === group &&
      now - this.lastGroup.time < 750
    ) {
      this.lastGroup.time = now;
      return;
    }
    this.past.push(start);
    if (this.past.length > 100) this.past.shift();
    this.lastGroup = group ? { key: group, time: now } : null;
  }

  undo(current: CanvasEditSnapshot) {
    const previous = this.past.pop();
    if (!previous) return undefined;
    this.future.push(current);
    this.gestureStart = null;
    this.lastGroup = null;
    return previous;
  }

  redo(current: CanvasEditSnapshot) {
    const next = this.future.pop();
    if (!next) return undefined;
    this.past.push(current);
    this.gestureStart = null;
    this.lastGroup = null;
    return next;
  }

  clear() {
    this.past = [];
    this.future = [];
    this.gestureStart = null;
    this.lastGroup = null;
  }
}
