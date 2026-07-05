import type { VizSettings } from "./vizSettings";
import * as bpmnlintConfig from "./linting/bpmnlintConfig.js";
import { CANON_MODDLE } from "./canonModdle";

export interface ModelerLike {
  importXML(xml: string): Promise<unknown>;
  saveXML(opts?: { format?: boolean }): Promise<{ xml?: string }>;
  saveSVG(): Promise<{ svg: string }>;
  on(event: string, cb: () => void): void;
  get(name: string): any;
}

// bpmn-js 18 has NO built-in read-only mode, so we enforce it ourselves: veto every
// editing-initiation interaction (drag-move, create, resize, connect, bendpoints, direct
// edit) at high priority, and disable the keyboard. Pan/zoom/selection are untouched —
// they don't flow through these events. Returns a toggle fn; installs listeners once.
function installReadOnlyGuard(modeler: ModelerLike): (ro: boolean) => void {
  let eventBus: any, keyboard: any;
  try { eventBus = modeler.get("eventBus"); } catch { /* no bus (test stub) */ }
  try { keyboard = modeler.get("keyboard"); } catch { /* optional */ }
  let active = false;
  let kbdNode: unknown = null;
  // Firing any of these returns false while read-only → diagram-js aborts the interaction.
  const BLOCK = [
    "shape.move.start", "create.start", "resize.start", "connect.start",
    "connectionSegment.move.start", "bendpoint.move.start", "directEditing.activate",
    "element.dblclick", "spaceTool.selection.start", "lasso.selection.start",
  ];
  const veto = (): false | undefined => (active ? false : undefined);
  if (eventBus?.on) for (const e of BLOCK) eventBus.on(e, 20000, veto);
  return (ro: boolean): void => {
    if (ro === active) return;
    active = ro;
    if (!keyboard) return;
    try {
      if (ro) { kbdNode = keyboard._node ?? null; keyboard.unbind(); }
      else if (kbdNode) { keyboard.bind(kbdNode); kbdNode = null; }
    } catch { /* keyboard API drift — veto still blocks mouse editing */ }
  };
}

export function createEditor(modeler: ModelerLike) {
  let dirty = false;
  let loading = false;
  let readOnlyToggle: ((ro: boolean) => void) | null = null;
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
      // bpmn-js 18 has no native read-only mode; enforce it via an interaction-veto guard
      // (installed lazily, once). Pan/zoom/selection stay; all editing is blocked.
      if (!readOnlyToggle) readOnlyToggle = installReadOnlyGuard(modeler);
      readOnlyToggle(ro);
    },
    isDirty: (): boolean => dirty,
    // True while an importXML is in flight — lets callers ignore the load-induced
    // commandStack.changed churn (diagram.clear + import) and react only to real edits.
    isLoading: (): boolean => loading,
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

  // Canon descriptor registered UNCONDITIONALLY (not gated on the feature flag): it removes
  // the copy/paste + morph strip hazard for canon:extensionElements (SPIKE F6). The flag
  // gates canon UI only. See src/canonModdle.ts.
  const config: Record<string, unknown> = {
    container,
    additionalModules,
    moddleExtensions: { canon: CANON_MODDLE },
  };
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
