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
