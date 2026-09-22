import { afterEach, describe, expect, it, vi } from "vitest";

import { createSaveQueue } from "../src/core/index.js";

afterEach(() => vi.useRealTimers());

describe("save queue", () => {
  it("reports dirty state during debounce and whenIdle waits without forcing a write", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => ({}));
    const queue = createSaveQueue({ save });
    queue.enqueue("draft");
    expect(queue.getSnapshot()).toMatchObject({ dirty: true, pending: true });
    let settled = false;
    const idle = queue.whenIdle().then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(299);
    expect(save).not.toHaveBeenCalled();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await idle;
    expect(queue.getSnapshot()).toMatchObject({ dirty: false, pending: false });
  });

  it("retains failed values, blocks automatic retries, and retries the newest value explicitly", async () => {
    vi.useFakeTimers();
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("revision conflict"))
      .mockResolvedValue({ revision: "r2" });
    const queue = createSaveQueue<number>({ save, revision: "r1" });
    queue.enqueue(1);
    await expect(queue.flush()).rejects.toThrow("revision conflict");
    expect(queue.getSnapshot()).toMatchObject({
      dirty: true,
      pending: false,
      state: { status: "error" },
    });
    queue.enqueue(2);
    queue.setRevision("unrelated");
    await vi.advanceTimersByTimeAsync(1000);
    await expect(queue.whenIdle()).rejects.toThrow("revision conflict");
    expect(save).toHaveBeenCalledTimes(1);
    await queue.flush();
    expect(save).toHaveBeenLastCalledWith({ value: 2, expectedRevision: "r1" });
    expect(queue.getSnapshot()).toMatchObject({ dirty: false, pending: false });
    queue.setRevision("r3");
    expect(queue.getRevision()).toBe("r3");
  });

  it("does not discard a successor when an active write fails", async () => {
    let reject!: (error: Error) => void;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, fail) => {
            reject = fail;
          }),
      )
      .mockResolvedValue({});
    const queue = createSaveQueue<number>({ save });
    queue.enqueue(1);
    const flush = queue.flush();
    await Promise.resolve();
    queue.enqueue(2);
    reject(new Error("offline"));
    await expect(flush).rejects.toThrow("offline");
    await queue.flush();
    expect(save).toHaveBeenLastCalledWith({ value: 2 });
  });

  it("allows undefined as a queued value and coalesces concurrent flushes", async () => {
    const save = vi.fn(async () => ({}));
    const queue = createSaveQueue<undefined>({ save });
    queue.enqueue(undefined);
    await Promise.all([queue.flush(), queue.flush(), queue.whenIdle()]);
    expect(save).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshot().dirty).toBe(false);
  });
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
