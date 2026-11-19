/**
 * Icons and their colours are named by the host (for example "landmark",
 * "link-2" or "amber"). The package stores and validates only names; the host
 * renders icons and maps colour names to CSS values.
 */
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const maxNameLength = 64;

function isName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= maxNameLength &&
    namePattern.test(value)
  );
}

/** A lowercase kebab-case icon name with letters and digits, at most 64 characters. */
export function isSchemaIconName(value: unknown): value is string {
  return isName(value);
}

/** A lowercase kebab-case palette name such as "amber"; never a CSS colour value. */
export function isSchemaIconColorName(value: unknown): value is string {
  return isName(value);
}

/** The inline Markdown token for an icon: `:icon[name]` or `:icon[name]{color=amber}`. */
export function schemaIconToken(name: string, color?: string): string {
  if (!isSchemaIconName(name)) throw new Error(`Invalid icon name "${name}".`);
  if (color !== undefined && !isSchemaIconColorName(color))
    throw new Error(`Invalid icon colour name "${color}".`);
  return `:icon[${name}]${color === undefined ? "" : `{color=${color}}`}`;
}

export type SchemaIconTextPart =
  | { kind: "text"; text: string }
  | { kind: "icon"; name: string; color?: string; token: string };

const nameSource = "[a-z0-9]+(?:-[a-z0-9]+)*";
const tokenSource = `:icon\\[(${nameSource})\\](?:\\{color=(${nameSource})\\})?`;
const tokenPattern = new RegExp(tokenSource, "g");
/** Matches one token at the start of a string. */
export const schemaIconTokenAtStart = new RegExp(`^${tokenSource}`);

/**
 * Split plain text into text and inline icon tokens. Text that only looks like
 * a token (an invalid name) stays text.
 */
export function splitSchemaIconTokens(text: string): SchemaIconTextPart[] {
  const parts: SchemaIconTextPart[] = [];
  let position = 0;
  for (const match of text.matchAll(tokenPattern)) {
    const name = match[1]!;
    const color = match[2];
    if (!isSchemaIconName(name)) continue;
    if (color !== undefined && !isSchemaIconColorName(color)) continue;
    if (match.index > position)
      parts.push({ kind: "text", text: text.slice(position, match.index) });
    parts.push({
      kind: "icon",
      name,
      ...(color === undefined ? {} : { color }),
      token: match[0],
    });
    position = match.index + match[0].length;
  }
  if (position < text.length)
    parts.push({ kind: "text", text: text.slice(position) });
  return parts;
}

/** Every distinct icon name used as an inline token, in order of first use. */
export function schemaIconTokenNames(markdown: string): string[] {
  return [
    ...new Set(
      splitSchemaIconTokens(markdown).flatMap((part) =>
        part.kind === "icon" ? [part.name] : [],
      ),
    ),
  ];
}
