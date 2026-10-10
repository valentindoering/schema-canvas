import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CanvasMarkdown } from "../src/react/markdown.js";

describe("canvas Markdown", () => {
  it("renders formatting without raw HTML or embedded images", () => {
    const html = renderToStaticMarkup(
      <CanvasMarkdown
        source={
          "# Heading\n**Bold** and [link](https://example.com)\n<script>alert(1)</script>\n![image](https://example.com/picture.png)"
        }
      />,
    );
    expect(html).toContain("<h1>Heading</h1>");
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
  });

  it("keeps nested and numbered list structure, code, and quotations", () => {
    const html = renderToStaticMarkup(
      <CanvasMarkdown
        source={[
          "# Notes",
          "",
          "- first",
          "  - nested",
          "- second",
          "",
          "3. third",
          "4. fourth",
          "",
          "> a quotation",
          "",
          "`inline`",
          "",
          "```text",
          "a very long code line",
          "```",
        ].join("\n")}
      />,
    );
    expect(html).toMatch(/<ul>\s*<li>first\s*<ul>\s*<li>nested<\/li>/);
    expect(html).toMatch(/<ol start="3">\s*<li>third<\/li>\s*<li>fourth<\/li>/);
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<code>inline</code>");
    expect(html).toContain("<pre><code");
  });

  it("does not turn unsafe links or raw HTML into active content", () => {
    const html = renderToStaticMarkup(
      <CanvasMarkdown
        source={
          '[unsafe](javascript:alert(1)) <img src="x" onerror="alert(1)">'
        }
      />,
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror=");
  });
});
