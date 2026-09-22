import {
  assertRecord,
  clamp,
  finiteNumber,
  optionalString,
  requiredString,
  snap,
} from "./shared.js";
import type {
  SchemaAnnotation,
  SchemaAnnotationColor,
  SchemaAnnotationKind,
} from "./types.js";

const kinds = new Set<SchemaAnnotationKind>(["frame", "note", "text", "image"]);
const colors = new Set<SchemaAnnotationColor>([
  "slate",
  "blue",
  "emerald",
  "amber",
]);
const idPattern = /^[a-zA-Z0-9_-]+$/;

export type ParseAnnotationsOptions = {
  gridSize?: number;
  resolveImage?: (asset: string) => string | undefined;
};

export function parseSchemaAnnotations(
  candidate: unknown,
  options: ParseAnnotationsOptions = {},
): SchemaAnnotation[] {
  const value =
    candidate !== null &&
    typeof candidate === "object" &&
    !Array.isArray(candidate) &&
    "annotations" in candidate
      ? (candidate as { annotations: unknown }).annotations
      : candidate;
  if (!Array.isArray(value)) {
    throw new Error("Schema annotations must be an array or wrapper object.");
  }
  const gridSize = options.gridSize ?? 20;
  const ids = new Set<string>();
  return value
    .map((item, index): SchemaAnnotation => {
      assertRecord(item, `Annotation ${index + 1} must be an object.`);
      const id = requiredString(
        item.id,
        `Annotation ${index + 1} needs an id.`,
        100,
      );
      if (!idPattern.test(id)) {
        throw new Error(
          `Annotation id \"${id}\" contains unsupported characters.`,
        );
      }
      if (ids.has(id)) throw new Error(`Duplicate annotation id \"${id}\".`);
      ids.add(id);

      const rawKind = item.kind ?? "frame";
      if (
        typeof rawKind !== "string" ||
        !kinds.has(rawKind as SchemaAnnotationKind)
      ) {
        throw new Error(`Annotation \"${id}\" has an invalid kind.`);
      }
      const kind = rawKind as SchemaAnnotationKind;
      const rawColor = item.color ?? "slate";
      if (
        typeof rawColor !== "string" ||
        !colors.has(rawColor as SchemaAnnotationColor)
      ) {
        throw new Error(`Annotation \"${id}\" has an invalid color.`);
      }
      const text = optionalString(
        item.text,
        `Annotation \"${id}\" text must be a string.`,
        4000,
      );
      const asset = optionalString(
        item.asset,
        `Annotation \"${id}\" asset must be a string.`,
        500,
      );
      if (asset && kind !== "image") {
        throw new Error(
          `Annotation \"${id}\" can only use an asset when it is an image.`,
        );
      }
      const storedSrc = optionalString(
        item.src ?? item.imageSrc,
        `Annotation \"${id}\" src must be a string.`,
        8 * 1024 * 1024,
      );
      const src = (asset && options.resolveImage?.(asset)) || storedSrc;
      const annotation: SchemaAnnotation = {
        id,
        kind,
        label: requiredString(
          item.label,
          `Annotation \"${id}\" needs a label.`,
          120,
        ),
        x: snap(
          finiteNumber(item.x, `Annotation \"${id}\" needs a finite x.`),
          gridSize,
        ),
        y: snap(
          finiteNumber(item.y, `Annotation \"${id}\" needs a finite y.`),
          gridSize,
        ),
        width: clamp(
          snap(
            finiteNumber(
              item.width,
              `Annotation \"${id}\" needs a finite width.`,
            ),
            gridSize,
          ),
          120,
          5000,
        ),
        height: clamp(
          snap(
            finiteNumber(
              item.height,
              `Annotation \"${id}\" needs a finite height.`,
            ),
            gridSize,
          ),
          80,
          5000,
        ),
        color: rawColor as SchemaAnnotationColor,
      };
      if (text) annotation.text = text;
      if (asset) annotation.asset = asset;
      if (src) annotation.src = src;
      if (kind === "text") {
        annotation.fontSize = clamp(
          typeof item.fontSize === "number" && Number.isFinite(item.fontSize)
            ? Math.round(item.fontSize)
            : 32,
          12,
          160,
        );
      }
      return annotation;
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function serializeSchemaAnnotations(
  annotations: readonly SchemaAnnotation[],
  envelope: "array" | "object" = "object",
  options: { omitDefaults?: boolean } = {},
) {
  const value = annotations.map(
    ({ src: _src, ...annotation }): Omit<SchemaAnnotation, "src"> | object => {
      if (!options.omitDefaults) return annotation;
      return {
        id: annotation.id,
        ...(annotation.kind !== "frame" ? { kind: annotation.kind } : {}),
        label: annotation.label,
        ...(annotation.kind === "note" && annotation.text
          ? { text: annotation.text }
          : {}),
        ...(annotation.kind === "image" && annotation.asset
          ? { asset: annotation.asset }
          : {}),
        x: annotation.x,
        y: annotation.y,
        width: annotation.width,
        height: annotation.height,
        ...(annotation.color !== "slate" ? { color: annotation.color } : {}),
        ...(annotation.kind === "text" && annotation.text
          ? { text: annotation.text }
          : {}),
        ...(annotation.kind === "text" && annotation.fontSize !== undefined
          ? { fontSize: annotation.fontSize }
          : {}),
      };
    },
  );
  return envelope === "array" ? value : { annotations: value };
}
