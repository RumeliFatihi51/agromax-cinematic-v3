import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/setup.ts",
  workers: 1,
  timeout: 60000,
  reporter: [
    ["list"],
    ["html", { outputFolder: "data/browser-report", open: "never" }],
  ],
  outputDir: "data/browser-results",
  use: {
    baseURL: "http://127.0.0.1:5182",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15000,
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
