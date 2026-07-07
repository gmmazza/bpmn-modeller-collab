/// <reference types="vite/client" />
// Type stubs for bpmn-js plugin packages that ship no TypeScript declarations.
declare module "bpmn-js-color-picker" {
  const module: object;
  export default module;
}
declare module "bpmn-js-properties-panel" {
  export const BpmnPropertiesPanelModule: object;
  export const BpmnPropertiesProviderModule: object;
}
declare module "diagram-js-minimap" {
  const module: object;
  export default module;
}
declare module "diagram-js-grid" {
  const module: object;
  export default module;
}
declare module "bpmn-js-token-simulation" {
  const module: object;
  export default module;
}
declare module "bpmn-js-token-simulation/lib/simulation-support" {
  const module: object;
  export default module;
}
declare module "bpmn-js-sketchy" {
  const module: object;
  export default module;
}

declare module "bpmn-js-bpmnlint";
declare module "bpmnlint";
declare module "./linting/bpmnlintConfig.js";
declare module "*/bpmnlintConfig.js";

// Vendored canon-BPMN profile plugin (src/canonProfile/, ADR-NNN D5) — plain ESM JS,
// no type declarations (same pattern as the bpmnlint packed config above).
declare module "*/canonProfile/plugin.js";

// Vite raw imports (e.g. the user manual markdown bundled into the app).
declare module "*.md?raw" {
  const content: string;
  export default content;
}

declare const __BPMN_JS_VERSION__: string;
declare const __APP_BUILD__: string;

interface Window {
  versionApi?: { latestBpmnJs(): Promise<string | null> };
  appUpdate?: {
    currentVersion(): Promise<string>;
    checkFeed(): Promise<unknown | null>;
    openDownload(url: string): void;
    downloadAndInstall(): Promise<{ ok: boolean }>;
    onProgress(cb: (p: { phase: string; received?: number; total?: number }) => void): () => void;
  };
}
