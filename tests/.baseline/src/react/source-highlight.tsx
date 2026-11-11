import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

for (const [name, grammar] of Object.entries({
  bash,
  css,
  javascript,
  json,
  python,
  sql,
  typescript,
  xml,
  yaml,
})) {
  hljs.registerLanguage(name, grammar);
}

const extensions: Record<string, string> = {
  bash: "bash",
  css: "css",
  html: "xml",
  htm: "xml",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  mjs: "javascript",
  py: "python",
  sh: "bash",
  sql: "sql",
  ts: "typescript",
  tsx: "typescript",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
};

export function HighlightedSource({
  path,
  source,
}: {
  path: string;
  source: string;
}) {
  const extension = path.split(/[?#]/, 1)[0]?.split(".").at(-1)?.toLowerCase();
  const language = extension ? extensions[extension] : undefined;
  if (!language) return <code>{source}</code>;
  try {
    const html = hljs.highlight(source, {
      language,
      ignoreIllegals: true,
    }).value;
    return (
      <code
        className={`hljs language-${language}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return <code>{source}</code>;
  }
}
