import type { SaveRequest, SaveResponse, SaveState } from "./types.js";

export type SaveQueueOptions<T> = {
  save: (request: SaveRequest<T>) => Promise<SaveResponse<T>>;
  revision?: string;
  debounceMs?: number;
  onStateChange?: (state: SaveState) => void;
  onSaved?: (value: T, revision?: string) => void;
};

export type SaveQueue<T> = {
  enqueue(value: T): void;
  flush(): Promise<void>;
  dispose(): void;
  getRevision(): string | undefined;
};

export function createSaveQueue<T>(options: SaveQueueOptions<T>): SaveQueue<T> {
  let revision = options.revision;
  let queued: T | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;
  let disposed = false;

  const emit = (state: SaveState) => options.onStateChange?.(state);

  async function drain() {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      while (queued !== undefined && !disposed) {
        const value = queued;
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
          emit({ status: "saved" });
        } catch (cause) {
          const error =
            cause instanceof Error ? cause : new Error(String(cause));
          emit({ status: "error", error });
          throw error;
        }
      }
    })().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  }

  return {
    enqueue(value) {
      if (disposed) return;
      queued = value;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void drain().catch(() => undefined);
      }, options.debounceMs ?? 300);
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      await drain();
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
    },
    getRevision() {
      return revision;
    },
  };
}
