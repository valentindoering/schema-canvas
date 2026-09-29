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
});
