import { defineConfig } from "@playwright/test";

// E2E suite for the collaboration flows (drafts, publish, reserva, resume, hidden
// sidecars) against the WEB dev build with an in-memory File System Access mock.
// Dev-only: this config, the e2e/ folder and @playwright/test are devDependencies
// and are excluded from the packaged app (see scripts/pack.cjs EXCLUDE).
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium", viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
