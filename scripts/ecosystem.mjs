// Pure: pick the bpmn-io ecosystem package names from a package.json object.
export function bpmnEcosystemDeps(pkgJson) {
  const all = { ...(pkgJson.dependencies || {}), ...(pkgJson.devDependencies || {}) };
  const exact = new Set(["bpmn-js", "bpmn-moddle", "diagram-js", "heatmap-ts", "bpmnlint", "bpmn-js-bpmnlint"]);
  return Object.keys(all)
    .filter(
      (name) =>
        exact.has(name) ||
        name.startsWith("bpmn-js-") ||
        name.startsWith("diagram-js-") ||
        name.startsWith("@bpmn-io/"),
    )
    .sort();
}
