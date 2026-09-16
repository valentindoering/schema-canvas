// @vitest-environment node

import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createJsonStore,
  RevisionConflictError,
} from "../src/server/json-store/index.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

describe("JSON store", () => {
  it("writes atomically and enforces opaque revisions", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "schema-canvas-"));
    directories.push(directory);
    const filePath = path.join(directory, "layout.json");
    const store = createJsonStore<{ count: number }>({
      filePath,
      missing: () => ({ count: 0 }),
      parse(candidate) {
        if (
          !candidate ||
          typeof candidate !== "object" ||
          !("count" in candidate) ||
          typeof candidate.count !== "number"
        ) {
          throw new Error("count is required");
        }
        return { count: candidate.count };
      },
    });
    const missing = await store.read();
    const written = await store.write({ count: 1 }, missing.revision);
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual({ count: 1 });
    await expect(
      store.write({ count: 2 }, missing.revision),
    ).rejects.toBeInstanceOf(RevisionConflictError);
    expect(
      (await readdir(directory)).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
    expect((await store.read()).revision).toBe(written.revision);
  });

  it("serializes concurrent writes", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "schema-canvas-"));
    directories.push(directory);
    const store = createJsonStore<number>({
      filePath: path.join(directory, "value.json"),
      missing: () => 0,
      parse(value) {
        if (typeof value !== "number") throw new Error("number required");
        return value;
      },
    });
    await Promise.all([store.write(1), store.write(2), store.write(3)]);
    expect((await store.read()).value).toBe(3);
  });
});
