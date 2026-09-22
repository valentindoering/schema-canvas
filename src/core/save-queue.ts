import type { SaveRequest, SaveResponse, SaveState } from "./types.js";

export type SaveQueueOptions<T> = {
  save: (request: SaveRequest<T>) => Promise<SaveResponse<T>>;
  revision?: string;
  debounceMs?: number;
  onStateChange?: (state: SaveState) => void;
  onSaved?: (value: T, revision?: string) => void;
  onSnapshotChange?: (snapshot: SaveQueueSnapshot) => void;
};

export type SaveQueueSnapshot = {
  /** Includes debounced, in-flight, and failed values. */
  dirty: boolean;
  /** True while a timer or write is active; failed writes remain dirty. */
  pending: boolean;
  state: SaveState;
};

export type SaveQueue<T> = {
  enqueue(value: T): void;
  flush(): Promise<void>;
  /** Wait without bypassing debounce or retrying a failed write. */
  whenIdle(): Promise<void>;
  getSnapshot(): SaveQueueSnapshot;
  /** Accept an external revision only while no local edits are outstanding. */
  setRevision(revision: string | undefined): void;
  /** Explicitly cancel queued work. Prefer flush before disposal. */
  dispose(): void;
  getRevision(): string | undefined;
};

export function createSaveQueue<T>(options: SaveQueueOptions<T>): SaveQueue<T> {
  let revision = options.revision;
  let queued: { value: T } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;
  let disposed = false;
  let active = false;
  let state: SaveState = { status: "idle" };
  const waiters = new Set<{ resolve(): void; reject(error: Error): void }>();

  const getSnapshot = (): SaveQueueSnapshot => ({
    dirty: queued !== undefined || active,
    pending: timer !== undefined || active,
    state,
  });
  function notify() {
    const snapshot = getSnapshot();
    options.onSnapshotChange?.(snapshot);
    if (!snapshot.pending) {
      for (const waiter of waiters) {
        if (state.status === "error") waiter.reject(state.error);
        else waiter.resolve();
      }
      waiters.clear();
    }
  }
  function emit(next: SaveState) {
    state = next;
    options.onStateChange?.(state);
    notify();
  }
  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function drain(): Promise<void> {
    if (inFlight) return inFlight;
    if (disposed || queued === undefined) return Promise.resolve();
    active = true;
    inFlight = Promise.resolve()
      .then(async () => {
        while (queued !== undefined && !disposed) {
          const { value } = queued;
          queued = undefined;
          emit({ status: "saving" });
          try {
            const response = await options.save({
              value,
              ...(revision === undefined ? {} : { expectedRevision: revision }),
            });
            const savedValue = response.value ?? value;
            revision = response.revision ?? revision;
            options.onSaved?.(savedValue, revision);
            if (queued === undefined) emit({ status: "saved" });
          } catch (cause) {
            const error =
              cause instanceof Error ? cause : new Error(String(cause));
            queued ??= { value };
            clearTimer();
            emit({ status: "error", error });
            throw error;
          }
        }
      })
      .finally(() => {
        inFlight = undefined;
        active = false;
        notify();
      });
    return inFlight;
  }

  return {
    enqueue(value) {
      if (disposed) return;
      queued = { value };
      clearTimer();
      if (!active && state.status !== "error") {
        timer = setTimeout(() => {
          timer = undefined;
          void drain().catch(() => undefined);
        }, options.debounceMs ?? 300);
      }
      notify();
    },
    async flush() {
      clearTimer();
      await drain();
    },
    whenIdle() {
      if (!getSnapshot().pending) {
        return state.status === "error"
          ? Promise.reject(state.error)
          : Promise.resolve();
      }
      return new Promise<void>((resolve, reject) => {
        waiters.add({ resolve, reject });
      });
    },
    getSnapshot,
    setRevision(next) {
      if (!getSnapshot().dirty) revision = next;
    },
    dispose() {
      disposed = true;
      clearTimer();
      queued = undefined;
      notify();
    },
    getRevision() {
      return revision;
    },
  };
}
