import { access, readFile, stat } from "node:fs/promises";
import ts from "typescript";

const publicModules = [
  "schema-canvas/core",
  "schema-canvas/react",
  "schema-canvas/server/convex",
  "schema-canvas/server/postgres",
  "schema-canvas/server/json-store",
  "schema-canvas/server/layout",
  "schema-canvas/server/annotations",
  "schema-canvas/server/review-store",
  "schema-canvas/server/agent",
];

for (const specifier of publicModules) {
  const imported = await import(specifier);
  if (Object.keys(imported).length === 0) {
    throw new Error(`${specifier} has no runtime exports.`);
  }
}

await access(new URL("../dist/styles.css", import.meta.url));
if ((await stat(new URL("../dist/styles.css", import.meta.url))).size < 1000) {
  throw new Error("The packaged stylesheet is unexpectedly empty.");
}

const visited = new Set();
async function checkBrowserImports(url) {
  if (visited.has(url.href)) return;
  visited.add(url.href);
  const source = await readFile(url, "utf8");
  const ast = ts.createSourceFile(url.pathname, source, ts.ScriptTarget.Latest);
  for (const statement of ast.statements) {
    if (
      !(
        ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
      ) ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    )
      continue;
    const specifier = statement.moduleSpecifier.text;
    if (specifier.startsWith("node:")) {
      throw new Error(`${url.pathname} imports a Node.js module.`);
    }
    if (specifier.startsWith("@tiptap/")) {
      throw new Error(
        "Tiptap is included in the initial browser module graph.",
      );
    }
    if (specifier.startsWith("."))
      await checkBrowserImports(new URL(specifier, url));
  }
}
for (const entry of ["core/index.js", "react/index.js"]) {
  await checkBrowserImports(new URL(`../dist/${entry}`, import.meta.url));
}

console.log("Every public JavaScript and CSS subpath imports successfully.");
