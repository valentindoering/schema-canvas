import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/example",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4180",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm example:dev",
    url: "http://127.0.0.1:4180",
    reuseExistingServer: !process.env.CI,
  },
});
