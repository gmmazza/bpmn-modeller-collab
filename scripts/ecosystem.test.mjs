import { describe, it, expect } from "vitest";
import { bpmnEcosystemDeps } from "./ecosystem.mjs";

describe("bpmnEcosystemDeps", () => {
  it("selects bpmn-io ecosystem packages from deps + devDeps, sorted", () => {
    const pkg = {
      dependencies: {
        "bpmn-js": "^17.0.0",
        "bpmn-js-color-picker": "^0.7.2",
        "@bpmn-io/properties-panel": "^3.0.0",
        "diagram-js-minimap": "^5.0.0",
        "bpmn-moddle": "^10.0.0",
        "heatmap-ts": "^0.0.5",
        "vite-plugin-x": "^1.0.0",
      },
      devDependencies: { "diagram-js-grid": "^2.0.0", typescript: "^5.0.0", vite: "^5.0.0" },
    };
    expect(bpmnEcosystemDeps(pkg)).toEqual([
      "@bpmn-io/properties-panel",
      "bpmn-js",
      "bpmn-js-color-picker",
      "bpmn-moddle",
      "diagram-js-grid",
      "diagram-js-minimap",
      "heatmap-ts",
    ]);
  });

  it("returns [] when there are no ecosystem deps", () => {
    expect(bpmnEcosystemDeps({ dependencies: { vite: "^5" } })).toEqual([]);
  });
});
