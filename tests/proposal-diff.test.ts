import { describe, expect, it } from "vitest";
import { diffProposalText } from "../src/react/proposal-diff.js";

describe("documentation review diff", () => {
  const examples = [
    [
      "# Guide\n\nKeep this.\nOld rule.\n",
      "# Guide\n\nKeep this.\nNew rule.\n",
    ],
    ["", "New\n"],
    ["Removed\n", ""],
    ["a\nb\na\nb", "b\na\nb\na"],
    ["# Heading\r\n\r\n**Before**", "# Heading\r\n\r\n**After**"],
    ["<script>old</script>", "<script>new</script>"],
    [
      Array.from({ length: 1000 }, (_, i) => `old-${i}`).join("\n"),
      Array.from({ length: 1000 }, (_, i) => `new-${i}`).join("\n"),
    ],
  ];
  for (const [index, [before, after]] of examples.entries())
    it(`preserves exact source on both sides (${index})`, () => {
      const diff = diffProposalText(before!, after!);
      expect(
        diff
          .filter((line) => line.kind !== "added")
          .map((line) => line.text)
          .join("\n"),
      ).toBe(before);
      expect(
        diff
          .filter((line) => line.kind !== "removed")
          .map((line) => line.text)
          .join("\n"),
      ).toBe(after);
    });
  it("keeps unchanged context between distinct edits", () => {
    expect(diffProposalText("old\nkeep\nremove", "new\nkeep\nadd")).toEqual([
      { kind: "removed", text: "old" },
      { kind: "added", text: "new" },
      { kind: "context", text: "keep" },
      { kind: "removed", text: "remove" },
      { kind: "added", text: "add" },
    ]);
  });
});
