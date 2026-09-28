import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
  root: "examples/playground",
  server: { host: "127.0.0.1", port: 4180, allowedHosts: [".ts.net"] },
  build: {
    emptyOutDir: true,
    outDir: "../../example-dist",
  },
});
