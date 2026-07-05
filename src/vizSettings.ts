export interface VizSettings {
  sketchy: boolean;
  heatmap: boolean;
  // Canon-BPMN profile flag (Canon #REF INTERNAL STAGE 2 / WO). OFF by default:
  // the canon lint rules would falsely fail every vanilla (non-canon) diagram, so they
  // must load ONLY when this is explicitly on. The canon moddle DESCRIPTOR is separate
  // and always-on regardless of this flag (see src/canonModdle.ts) — this flag gates
  // canon LINT (and future canon UI), never the descriptor.
  canon?: boolean;
}

const KEY = "bpmn-compartida.viz";
const DEFAULTS: VizSettings = { sketchy: false, heatmap: false, canon: false };

export function getVizSettings(): VizSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { sketchy: !!parsed.sketchy, heatmap: !!parsed.heatmap, canon: !!parsed.canon };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setVizSettings(s: VizSettings): void {
  localStorage.setItem(
    KEY,
    JSON.stringify({ sketchy: !!s.sketchy, heatmap: !!s.heatmap, canon: !!s.canon }),
  );
}
