// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { migrateSchemaAnnotationsFile } from "../src/server/annotations/index.js";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixtureFile(value: unknown) {
  const directory = await mkdtemp(path.join(tmpdir(), "schema-canvas-test-"));
  temporaryDirectories.push(directory);
  const file = path.join(directory, "annotations.json");
  await writeFile(file, JSON.stringify(value));
  return file;
}

describe("annotation file migration", () => {
  it("rewrites legacy titles and bodies once without losing an image source", async () => {
    const file = await fixtureFile({
      annotations: [
        {
          id: "note",
          kind: "note",
          label: "Review",
          text: "Check this",
          x: 0,
          y: 0,
          width: 300,
          height: 180,
        },
        {
          id: "heading",
          kind: "text",
          label: "Starships",
          text: "Starships",
          x: 0,
          y: 200,
          width: 300,
          height: 100,
        },
        {
          id: "image",
          kind: "image",
          label: "Diagram",
          src: "data:image/png;base64,AAAA",
          x: 0,
          y: 320,
          width: 300,
          height: 180,
        },
      ],
    });
    expect((await migrateSchemaAnnotationsFile(file)).changed).toBe(true);
    const migrated = JSON.parse(await readFile(file, "utf8"));
    expect(migrated.annotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ markdown: "# Review\n\nCheck this" }),
        expect.objectContaining({ markdown: "Starships" }),
        expect.objectContaining({ src: "data:image/png;base64,AAAA" }),
      ]),
    );
    expect(migrated.annotations[0]).not.toHaveProperty("label");
    expect((await migrateSchemaAnnotationsFile(file)).changed).toBe(false);
  });

  it("refuses unknown fields before rewriting a file", async () => {
    const value = [
      {
        id: "note",
        kind: "note",
        label: "Review",
        customData: "preserve me",
        x: 0,
        y: 0,
        width: 300,
        height: 180,
      },
    ];
    const file = await fixtureFile(value);
    await expect(migrateSchemaAnnotationsFile(file)).rejects.toThrow(
      "unsupported fields",
    );
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(value);
  });

  it("refuses mixed old and new content that cannot be merged unambiguously", async () => {
    const value = [
      {
        id: "note",
        kind: "note",
        label: "Old title",
        markdown: "# New title",
        x: 0,
        y: 0,
        width: 300,
        height: 180,
      },
    ];
    const file = await fixtureFile(value);
    await expect(migrateSchemaAnnotationsFile(file)).rejects.toThrow(
      "both Markdown and legacy content",
    );
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(value);
  });

  it("preserves geometry, order, and bytes when there is nothing to migrate", async () => {
    const value = {
      annotations: [
        {
          id: "zulu",
          kind: "note",
          label: "Travel log",
          x: 15,
          y: 17,
          width: 125,
          height: 95,
          color: "amber",
        },
        {
          id: "alpha",
          kind: "text",
          markdown: "# Planet map",
          x: 39,
          y: 41,
          width: 175,
          height: 115,
          fontSize: 19,
        },
      ],
    };
    const file = await fixtureFile(value);
    await migrateSchemaAnnotationsFile(file);
    const after = JSON.parse(await readFile(file, "utf8"));
    expect(after.annotations[0]).toEqual({
      id: "zulu",
      kind: "note",
      markdown: "# Travel log",
      x: 15,
      y: 17,
      width: 125,
      height: 95,
      color: "amber",
    });
    expect(after.annotations[1]).toEqual(value.annotations[1]);
    const bytes = await readFile(file, "utf8");
    expect((await migrateSchemaAnnotationsFile(file)).changed).toBe(false);
    expect(await readFile(file, "utf8")).toBe(bytes);
  });

  it("does not publish the old default Text label as visible content", async () => {
    const file = await fixtureFile([
      {
        id: "caption",
        kind: "text",
        label: "Text",
        text: "A quiet caption",
        x: 15,
        y: 25,
        width: 300,
        height: 100,
      },
    ]);
    await migrateSchemaAnnotationsFile(file);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual([
      {
        id: "caption",
        kind: "text",
        x: 15,
        y: 25,
        width: 300,
        height: 100,
        markdown: "A quiet caption",
      },
    ]);
  });
});
