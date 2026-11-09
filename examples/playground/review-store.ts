import {
  parseCanvasReviewState,
  type CanvasReviewState,
  type CanvasReviewStore,
} from "../../src/core/index.js";

export const reviewKey = "schema-canvas-example-review";

/** Demo storage only. Production hosts put this behind server authentication. */
export function createPlaygroundReviewStore(
  initial: CanvasReviewState,
  onCommit: (state: CanvasReviewState) => void,
  storageKey = reviewKey,
  /** Simulated host round trip per read or write, e.g. `?latency=600`. */
  latencyMs = 0,
): CanvasReviewStore {
  let tail = Promise.resolve();
  const delay = () =>
    latencyMs > 0
      ? new Promise((resolve) => setTimeout(resolve, latencyMs))
      : Promise.resolve();
  const read = async () => {
    await delay();
    const stored = localStorage.getItem(storageKey);
    return parseCanvasReviewState(
      stored ? JSON.parse(stored) : structuredClone(initial),
    );
  };
  return {
    read,
    transact(operation) {
      const task = async () => {
        const { state, result } = await operation(await read());
        const validated = parseCanvasReviewState(state);
        localStorage.setItem(storageKey, JSON.stringify(validated));
        onCommit(validated);
        return result;
      };
      const result = tail.then(async () =>
        navigator.locks
          ? await navigator.locks.request(storageKey, task)
          : await task(),
      );
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}
