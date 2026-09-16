import { describe, expect, it, vi } from "vitest";

import { createSaveQueue } from "../src/core/index.js";

describe("save queue", () => {
  it("serializes writes and keeps only the latest queued value", async () => {
    vi.useFakeTimers();
    const resolvers: Array<() => void> = [];
    const calls: number[] = [];
    const queue = createSaveQueue<number>({
      revision: "r1",
      debounceMs: 10,
      save: async ({ value, expectedRevision }) => {
        calls.push(value);
        expect(expectedRevision).toBe(calls.length === 1 ? "r1" : "r2");
        await new Promise<void>((resolve) => resolvers.push(resolve));
        return { revision: calls.length === 1 ? "r2" : "r3" };
      },
    });
    queue.enqueue(1);
    await vi.advanceTimersByTimeAsync(10);
    queue.enqueue(2);
    queue.enqueue(3);
    await vi.advanceTimersByTimeAsync(10);
    expect(calls).toEqual([1]);
    resolvers.shift()?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual([1, 3]);
    resolvers.shift()?.();
    await queue.flush();
    expect(queue.getRevision()).toBe("r3");
    vi.useRealTimers();
  });

  it("surfaces failed saves", async () => {
    const states: string[] = [];
    const queue = createSaveQueue({
      debounceMs: 0,
      save: async () => {
        throw new Error("disk full");
      },
      onStateChange: (state) => states.push(state.status),
    });
    queue.enqueue({ value: 1 });
    await expect(queue.flush()).rejects.toThrow("disk full");
    expect(states).toEqual(["saving", "error"]);
  });
});
