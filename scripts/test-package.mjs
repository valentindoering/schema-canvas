import { access, readFile, stat } from "node:fs/promises";

const publicModules = [
  "@valentindoering/schema-canvas/core",
  "@valentindoering/schema-canvas/react",
  "@valentindoering/schema-canvas/server/convex",
  "@valentindoering/schema-canvas/server/postgres",
  "@valentindoering/schema-canvas/server/json-store",
  "@valentindoering/schema-canvas/server/layout",
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

for (const entry of ["core/index.js", "react/index.js"]) {
  const source = await readFile(
    new URL(`../dist/${entry}`, import.meta.url),
    "utf8",
  );
  if (/from ["']node:/.test(source)) {
    throw new Error(`${entry} imports a Node.js module.`);
  }
}

console.log("Every public JavaScript and CSS subpath imports successfully.");
