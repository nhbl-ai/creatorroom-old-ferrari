import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

process.env.PLAYWRIGHT_BROWSERS_PATH ||= resolve(".cache/ms-playwright");

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: "http://localhost:3100",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node server/index.js --demo",
    env: {
      PORT: "3100",
      APP_ORIGIN: "http://localhost:3100",
      CREATORROOM_DEMO_DATA_PATH: resolve(`.cache/e2e-${process.pid}.json`),
    },
    url: "http://localhost:3100/api/health",
    reuseExistingServer: false,
  },
});
