import { open, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createCanvasReviewState,
  parseCanvasReviewState,
  type CanvasDocument,
  type CanvasReviewStore,
} from "../../core/index.js";
import {
  readJsonText,
  withJsonWriteLock,
  writeJsonAtomic,
} from "../json-store/index.js";

/** Explicit initialization never replaces an existing authority file. */
export async function initializeCanvasReviewFile(
  filePath: string,
  document: CanvasDocument,
) {
  const state = await createCanvasReviewState(document);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return state;
}

/** One atomic file holds both the live document and the proposal/audit ledger. */
export function createFileCanvasReviewStore(options: {
  filePath: string;
}): CanvasReviewStore {
  const filePath = path.resolve(options.filePath);
  const lockPath = `${filePath}.lock`;
  async function read() {
    const snapshot = await readJsonText(filePath);
    if (snapshot.contents === null)
      throw new Error(
        "The canvas review file must be explicitly initialized before use.",
      );
    let candidate: unknown;
    try {
      candidate = JSON.parse(snapshot.contents);
    } catch (cause) {
      throw new Error("The canvas review file contains invalid JSON.", {
        cause,
      });
    }
    return parseCanvasReviewState(candidate);
  }
  return {
    read,
    transact(operation) {
      return withJsonWriteLock(filePath, async () => {
        let lock;
        try {
          lock = await open(lockPath, "wx", 0o600);
        } catch (cause) {
          if (
            cause &&
            typeof cause === "object" &&
            "code" in cause &&
            cause.code === "EEXIST"
          )
            throw new Error(
              "Canvas storage is locked by another writer. Retry after it finishes. After a crash, the host must verify the writer is stopped before removing the lock.",
            );
          throw cause;
        }
        try {
          await lock.writeFile(
            JSON.stringify({
              pid: process.pid,
              createdAt: new Date().toISOString(),
            }),
          );
          const { state, result } = await operation(await read());
          const validated = parseCanvasReviewState(state);
          await writeJsonAtomic(filePath, validated, { mode: 0o600 });
          return result;
        } finally {
          await lock.close();
          await unlink(lockPath);
        }
      });
    },
  };
}
