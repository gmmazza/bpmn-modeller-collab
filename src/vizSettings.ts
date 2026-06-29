export interface VizSettings {
  sketchy: boolean;
  heatmap: boolean;
}

const KEY = "bpmn-compartida.viz";
const DEFAULTS: VizSettings = { sketchy: false, heatmap: false };

export function getVizSettings(): VizSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { sketchy: !!parsed.sketchy, heatmap: !!parsed.heatmap };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setVizSettings(s: VizSettings): void {
  localStorage.setItem(KEY, JSON.stringify({ sketchy: !!s.sketchy, heatmap: !!s.heatmap }));
}
