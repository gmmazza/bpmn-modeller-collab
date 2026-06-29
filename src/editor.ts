import type { VizSettings } from "./vizSettings";
import * as bpmnlintConfig from "./linting/bpmnlintConfig.js";

export interface ModelerLike {
  importXML(xml: string): Promise<unknown>;
  saveXML(opts?: { format?: boolean }): Promise<{ xml?: string }>;
  saveSVG(): Promise<{ svg: string }>;
  on(event: string, cb: () => void): void;
  get(name: string): any;
}

export function createEditor(modeler: ModelerLike) {
  let dirty = false;
  let loading = false;
  const dirtyCbs: Array<(d: boolean) => void> = [];

  function setDirty(value: boolean) {
    if (dirty === value) return;
    dirty = value;
    dirtyCbs.forEach((cb) => cb(dirty));
  }

  modeler.on("commandStack.changed", () => {
    if (!loading) setDirty(true);
  });

  return {
    async load(xml: string): Promise<void> {
      loading = true;
      try {
        await modeler.importXML(xml);
      } finally {
        loading = false;
      }
      setDirty(false);
    },
    async getXml(): Promise<string> {
      const { xml } = await modeler.saveXML({ format: true });
      return xml ?? "";
    },
    setReadOnly(ro: boolean): void {
      // diagram-js exposes read-only toggling via the "editorActions"/"keyboard" stack;
      // bpmn-js supports it through the optional "bpmn-js" read-only mixin.
      const actions = modeler.get("editorActions");
      if (actions && typeof actions.readOnly === "function") actions.readOnly(ro);
    },
    isDirty: (): boolean => dirty,
    onDirtyChange(cb: (d: boolean) => void): void {
      dirtyCbs.push(cb);
    },
    markSaved(): void {
      setDirty(false);
    },
  };
}

export function selectedModuleKeys(settings: VizSettings): string[] {
  const keys = ["colorPicker", "minimap", "grid", "properties", "tokenSim", "lint"];
  if (settings.sketchy) keys.push("sketchy");
  return keys;
}

const COMIC_SANS_TEXT_RENDERER = {
  defaultStyle: { fontFamily: '"Comic Sans MS"', fontWeight: "normal", fontSize: 14, lineHeight: 1.1 },
  externalStyle: { fontSize: 14, lineHeight: 1.1 },
};

export async function createBpmnModeler(
  container: HTMLElement,
  opts: { propertiesParent?: HTMLElement; settings?: VizSettings } = {},
): Promise<ModelerLike> {
  const settings = opts.settings ?? { sketchy: false, heatmap: false };
  const keys = selectedModuleKeys(settings);

  const [
    { default: BpmnModeler },
    colorPicker,
    propertiesPanel,
    minimap,
    grid,
    tokenSim,
    simSupport,
    sketchy,
    lint,
  ] = await Promise.all([
    import("bpmn-js/lib/Modeler"),
    import("bpmn-js-color-picker"),
    import("bpmn-js-properties-panel"),
    import("diagram-js-minimap"),
    import("diagram-js-grid"),
    import("bpmn-js-token-simulation"),
    import("bpmn-js-token-simulation/lib/simulation-support"),
    import("bpmn-js-sketchy"),
    import("bpmn-js-bpmnlint"),
  ]);

  const byKey: Record<string, unknown> = {
    colorPicker: colorPicker.default,
    properties: [propertiesPanel.BpmnPropertiesPanelModule, propertiesPanel.BpmnPropertiesProviderModule],
    minimap: minimap.default,
    grid: grid.default,
    tokenSim: [tokenSim.default, simSupport.default],
    sketchy: sketchy.default,
    lint: lint.default,
  };
  const additionalModules = keys.flatMap((k) => {
    const m = byKey[k];
    return Array.isArray(m) ? m : [m];
  });

  const config: Record<string, unknown> = { container, additionalModules };
  if (opts.propertiesParent) config.propertiesPanel = { parent: opts.propertiesParent };
  if (settings.sketchy) config.textRenderer = COMIC_SANS_TEXT_RENDERER;
  if (keys.includes("lint")) config.linting = { bpmnlint: bpmnlintConfig };
  // bpmn-js' keyboard binds implicitly (to the focused canvas) in current
  // diagram-js — an explicit `keyboard.bindTo` is unsupported and only logs an
  // error. The tool/editing shortcuts (H/L/S/C/E/R, undo/redo, copy/paste,
  // delete, zoom, find, arrows) work once the canvas has focus.

  return new BpmnModeler(config) as unknown as ModelerLike;
}

export type Editor = ReturnType<typeof createEditor>;
