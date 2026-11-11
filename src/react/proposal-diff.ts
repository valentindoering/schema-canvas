export type ProposalDiffLine = {
  kind: "context" | "added" | "removed";
  text: string;
};

/** Line diff with bounded work for long or adversarial documentation. */
export function diffProposalText(
  before: string,
  after: string,
): ProposalDiffLine[] {
  const a = before ? before.split("\n") : [];
  const b = after ? after.split("\n") : [];
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix])
    prefix++;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  )
    suffix++;
  const old = a.slice(prefix, a.length - suffix);
  const next = b.slice(prefix, b.length - suffix);
  const result: ProposalDiffLine[] = a
    .slice(0, prefix)
    .map((text) => ({ kind: "context", text }));
  if (old.length * next.length > 100_000) {
    result.push(
      ...old.map((text) => ({ kind: "removed" as const, text })),
      ...next.map((text) => ({ kind: "added" as const, text })),
    );
  } else {
    const width = next.length + 1;
    const lengths = new Uint32Array((old.length + 1) * width);
    for (let i = old.length - 1; i >= 0; i--)
      for (let j = next.length - 1; j >= 0; j--)
        lengths[i * width + j] =
          old[i] === next[j]
            ? lengths[(i + 1) * width + j + 1]! + 1
            : Math.max(
                lengths[(i + 1) * width + j]!,
                lengths[i * width + j + 1]!,
              );
    let i = 0,
      j = 0;
    while (i < old.length || j < next.length) {
      if (i < old.length && j < next.length && old[i] === next[j]) {
        result.push({ kind: "context", text: old[i++]! });
        j++;
      } else if (
        i < old.length &&
        (j === next.length ||
          lengths[(i + 1) * width + j]! >= lengths[i * width + j + 1]!)
      ) {
        result.push({ kind: "removed", text: old[i++]! });
      } else result.push({ kind: "added", text: next[j++]! });
    }
  }
  result.push(
    ...a
      .slice(a.length - suffix)
      .map((text) => ({ kind: "context" as const, text })),
  );
  return result;
}

/** Part of a changed line; `changed` marks words added or removed inside it. */
export type ProposalDiffSegment = { text: string; changed: boolean };

function tokens(line: string) {
  return line.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];
}

/**
 * Word-level changes inside a removed line and the added line that replaces it.
 * Returns null when the lines share too little to make word marks useful.
 */
export function diffProposalWords(
  before: string,
  after: string,
): { removed: ProposalDiffSegment[]; added: ProposalDiffSegment[] } | null {
  const a = tokens(before);
  const b = tokens(after);
  if (!a.length || !b.length || a.length * b.length > 40_000) return null;
  const width = b.length + 1;
  const lengths = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lengths[i * width + j] =
        a[i] === b[j]
          ? lengths[(i + 1) * width + j + 1]! + 1
          : Math.max(
              lengths[(i + 1) * width + j]!,
              lengths[i * width + j + 1]!,
            );
  const removed: ProposalDiffSegment[] = [];
  const added: ProposalDiffSegment[] = [];
  const push = (
    list: ProposalDiffSegment[],
    text: string,
    changed: boolean,
  ) => {
    const last = list[list.length - 1];
    if (last && last.changed === changed) last.text += text;
    else list.push({ text, changed });
  };
  let shared = 0;
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      if (a[i]!.trim()) shared += a[i]!.length;
      push(removed, a[i++]!, false);
      push(added, b[j++]!, false);
    } else if (
      i < a.length &&
      (j === b.length ||
        lengths[(i + 1) * width + j]! >= lengths[i * width + j + 1]!)
    )
      push(removed, a[i++]!, true);
    else push(added, b[j++]!, true);
  }
  // Whitespace between two changed words reads as part of the change.
  for (const list of [removed, added])
    for (let k = 1; k < list.length - 1; k++)
      if (
        !list[k]!.changed &&
        !list[k]!.text.trim() &&
        list[k - 1]!.changed &&
        list[k + 1]!.changed
      ) {
        list[k - 1]!.text += list[k]!.text + list[k + 1]!.text;
        list.splice(k, 2);
        k--;
      }
  const visible = Math.max(before.trim().length, after.trim().length);
  return shared * 3 >= visible ? { removed, added } : null;
}

/**
 * Word marks for a line diff: within each block of changes, the n-th removed
 * line is compared with the n-th added line.
 */
export function proposalWordChanges(
  lines: readonly ProposalDiffLine[],
): Map<number, ProposalDiffSegment[]> {
  const result = new Map<number, ProposalDiffSegment[]>();
  for (let start = 0; start < lines.length;) {
    if (lines[start]!.kind === "context") {
      start++;
      continue;
    }
    let end = start;
    while (end < lines.length && lines[end]!.kind !== "context") end++;
    const removed: number[] = [];
    const added: number[] = [];
    for (let k = start; k < end; k++)
      (lines[k]!.kind === "removed" ? removed : added).push(k);
    for (let k = 0; k < Math.min(removed.length, added.length); k++) {
      const words = diffProposalWords(
        lines[removed[k]!]!.text,
        lines[added[k]!]!.text,
      );
      if (!words) continue;
      result.set(removed[k]!, words.removed);
      result.set(added[k]!, words.added);
    }
    start = end;
  }
  return result;
}
