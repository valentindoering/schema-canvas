import { cp } from "node:fs/promises";

import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "core/index": "src/core/index.ts",
    "react/index": "src/react/index.ts",
    "server/convex/index": "src/server/convex/index.ts",
    "server/postgres/index": "src/server/postgres/index.ts",
    "server/json-store/index": "src/server/json-store/index.ts",
    "server/layout/index": "src/server/layout/index.ts",
    cli: "src/cli.ts",
  },
  format: ["esm"],
  target: "node22",
  platform: "neutral",
  dts: true,
  sourcemap: false,
  splitting: false,
  clean: true,
  external: ["@xyflow/react", "react", "react-dom", "typescript"],
  async onSuccess() {
    await cp("src/styles.css", "dist/styles.css");
  },
});
