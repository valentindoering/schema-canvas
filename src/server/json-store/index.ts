import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export class RevisionConflictError extends Error {
  readonly expectedRevision: string;
  readonly actualRevision: string;

  constructor(expectedRevision: string, actualRevision: string) {
    super("The persisted schema state changed. Reload it before saving again.");
    this.name = "RevisionConflictError";
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export type JsonSnapshot<T> = {
  value: T;
  revision: string;
  exists: boolean;
};

export type JsonStoreOptions<T> = {
  filePath: string;
  parse: (candidate: unknown) => T;
  serialize?: (value: T) => unknown;
  missing?: () => T;
};

export type JsonStore<T> = {
  read(): Promise<JsonSnapshot<T>>;
  write(value: unknown, expectedRevision?: string): Promise<JsonSnapshot<T>>;
};

const writeLocks = new Map<string, Promise<void>>();

export function jsonRevision(contents: string | null) {
  return createHash("sha256")
    .update(contents === null ? "\0missing" : contents)
    .digest("hex");
}

export async function readJsonText(filePath: string) {
  try {
    const contents = await readFile(filePath, "utf8");
    return { contents, revision: jsonRevision(contents), exists: true };
  } catch (cause) {
    if (isNodeError(cause) && cause.code === "ENOENT") {
      return { contents: null, revision: jsonRevision(null), exists: false };
    }
    throw cause;
  }
}

export async function writeJsonAtomic(filePath: string, value: unknown) {
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, contents, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, filePath);
    return jsonRevision(contents);
  } catch (cause) {
    await unlink(temporaryPath).catch(() => undefined);
    throw cause;
  }
}

export function withJsonWriteLock<T>(
  filePath: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = writeLocks.get(filePath) ?? Promise.resolve();
  const result = previous.then(operation);
  writeLocks.set(
    filePath,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

export function createJsonStore<T>(options: JsonStoreOptions<T>): JsonStore<T> {
  async function read(): Promise<JsonSnapshot<T>> {
    const snapshot = await readJsonText(options.filePath);
    if (snapshot.contents === null) {
      if (!options.missing) {
        throw new Error(
          `Required JSON file does not exist: ${options.filePath}`,
        );
      }
      return {
        value: options.missing(),
        revision: snapshot.revision,
        exists: false,
      };
    }
    let candidate: unknown;
    try {
      candidate = JSON.parse(snapshot.contents);
    } catch (cause) {
      throw new Error(`Invalid JSON in ${options.filePath}.`, { cause });
    }
    return {
      value: options.parse(candidate),
      revision: snapshot.revision,
      exists: true,
    };
  }

  return {
    read,
    write(candidate, expectedRevision) {
      return withJsonWriteLock(options.filePath, async () => {
        const current = await readJsonText(options.filePath);
        if (
          expectedRevision !== undefined &&
          expectedRevision !== current.revision
        ) {
          throw new RevisionConflictError(expectedRevision, current.revision);
        }
        const value = options.parse(candidate);
        const revision = await writeJsonAtomic(
          options.filePath,
          options.serialize?.(value) ?? value,
        );
        return { value, revision, exists: true };
      });
    },
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
