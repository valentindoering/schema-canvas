import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HighlightedSource } from "../src/react/source-highlight.js";

describe("definition highlighting", () => {
  it("recognizes TypeScript and SQL by extension", () => {
    const typescript = renderToStaticMarkup(
      <HighlightedSource
        path="schema/ports.ts"
        source="export const ports = 1;"
      />,
    );
    const sql = renderToStaticMarkup(
      <HighlightedSource
        path="schema/ports.sql"
        source="CREATE TABLE ports (id TEXT);"
      />,
    );
    expect(typescript).toContain("language-typescript");
    expect(sql).toContain("language-sql");
    expect(sql).toContain("hljs-keyword");
  });

  it("escapes source text for known and unknown file types", () => {
    for (const path of ["schema/ports.ts", "schema/ports.unknown"]) {
      const markup = renderToStaticMarkup(
        <HighlightedSource path={path} source={'<img src=x onerror="x">'} />,
      );
      expect(markup).toContain("&lt;img");
      expect(markup).not.toContain("<img");
    }
  });
});
