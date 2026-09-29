import { parseSchemaAnnotations } from "../../core/index.js";
import {
  readJsonText,
  RevisionConflictError,
  withJsonWriteLock,
  writeJsonAtomic,
} from "../json-store/index.js";

const annotationKeys = new Set([
  "id",
  "kind",
  "label",
  "text",
  "markdown",
  "asset",
  "src",
  "imageSrc",
  "x",
  "y",
  "width",
  "height",
  "color",
  "fontSize",
]);

/** Rewrite legacy note/text annotations to single-field Markdown safely. */
export async function migrateSchemaAnnotationsFile(filePath: string) {
  return withJsonWriteLock(filePath, async () => {
    const snapshot = await readJsonText(filePath);
    if (snapshot.contents === null) {
      throw new Error(`Required annotations file does not exist: ${filePath}`);
    }
    let candidate: unknown;
    try {
      candidate = JSON.parse(snapshot.contents);
    } catch (cause) {
      throw new Error(`Invalid JSON in ${filePath}.`, { cause });
    }
    assertMigrationShape(candidate);
    const annotations = parseSchemaAnnotations(candidate);
    const markdownById = new Map(
      annotations.map(({ id, markdown }) => [id, markdown]),
    );
    const records = Array.isArray(candidate)
      ? candidate
      : (candidate as { annotations: Record<string, unknown>[] }).annotations;
    let changed = false;
    const migratedRecords = records.map((annotation) => {
      const record = annotation as Record<string, unknown>;
      if (
        (record.kind !== "note" && record.kind !== "text") ||
        (record.label === undefined && record.text === undefined)
      ) {
        return record;
      }
      changed = true;
      const { label: _label, text: _text, ...rest } = record;
      const markdown = markdownById.get(record.id as string);
      return markdown === undefined ? rest : { ...rest, markdown };
    });
    if (!changed) return { changed: false, annotations };
    const migrated = Array.isArray(candidate)
      ? migratedRecords
      : { annotations: migratedRecords };
    const current = await readJsonText(filePath);
    if (current.revision !== snapshot.revision) {
      throw new RevisionConflictError(snapshot.revision, current.revision);
    }
    await writeJsonAtomic(filePath, migrated);
    return { changed: true, annotations: parseSchemaAnnotations(migrated) };
  });
}

function assertMigrationShape(candidate: unknown) {
  const wrapper = !Array.isArray(candidate);
  if (wrapper) {
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      Object.keys(candidate).some((key) => key !== "annotations")
    ) {
      throw new Error("Annotations migration found unsupported wrapper data.");
    }
  }
  const annotations = wrapper
    ? (candidate as { annotations?: unknown }).annotations
    : candidate;
  if (!Array.isArray(annotations)) {
    throw new Error("Annotations migration requires an annotations array.");
  }
  for (const annotation of annotations) {
    if (annotation === null || typeof annotation !== "object") continue;
    const record = annotation as Record<string, unknown>;
    const unknown = Object.keys(annotation).filter(
      (key) => !annotationKeys.has(key),
    );
    if (unknown.length) {
      throw new Error(
        `Annotations migration found unsupported fields: ${unknown.join(", ")}.`,
      );
    }
    if (
      (record.kind === "note" || record.kind === "text") &&
      record.markdown !== undefined &&
      (record.label !== undefined || record.text !== undefined)
    ) {
      throw new Error(
        "Annotations migration found both Markdown and legacy content in one annotation.",
      );
    }
    if (
      record.kind !== "note" &&
      record.kind !== "text" &&
      record.markdown !== undefined
    ) {
      throw new Error(
        "Annotations migration found Markdown on an unsupported annotation kind.",
      );
    }
    if (
      record.kind === "image" &&
      record.asset !== undefined &&
      (record.src !== undefined || record.imageSrc !== undefined)
    ) {
      throw new Error(
        "Annotations migration found both an image asset and embedded source.",
      );
    }
  }
}
