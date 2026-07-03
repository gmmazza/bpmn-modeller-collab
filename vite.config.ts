import { readFileSync } from "node:fs";
import { defineConfig, configDefaults } from "vitest/config";

const bpmnJsVersion = JSON.parse(
  readFileSync("node_modules/bpmn-js/package.json", "utf8"),
).version;

export default defineConfig({
  // Relative asset paths so the built index.html works from file:// in Electron.
  base: "./",
  define: {
    __BPMN_JS_VERSION__: JSON.stringify(bpmnJsVersion),
    // Build timestamp so the running build is identifiable in the ⚙ popover
    // (confirms an updated .exe is actually the one being launched).
    __APP_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC"),
  },
  test: {
    environment: "happy-dom",
    globals: true,
    // e2e/*.spec.ts are Playwright specs (run via `npm run e2e`), not vitest.
    exclude: [...configDefaults.exclude, "e2e/**"],
    environmentOptions: {
      happyDOM: {
        settings: {
          disableJavaScriptEvaluation: true,
          navigation: {
            disableMainFrameNavigation: true,
            disableChildFrameNavigation: true,
            disableChildPageNavigation: true,
          },
        },
      },
    },
  },
});
