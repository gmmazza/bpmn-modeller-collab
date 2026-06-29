export const BUNDLED_BPMN_JS_VERSION: string = __BPMN_JS_VERSION__;

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function checkLatestBpmnJs(
  fetchLatest: () => Promise<string>,
): Promise<{ latest: string; isOutdated: boolean }> {
  const latest = await fetchLatest();
  if (typeof latest !== "string" || latest.length === 0) {
    throw new Error("Invalid latest bpmn-js version");
  }
  return { latest, isOutdated: compareVersions(latest, BUNDLED_BPMN_JS_VERSION) > 0 };
}
