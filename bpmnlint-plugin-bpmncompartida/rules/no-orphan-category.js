// Report declared categories that no group references. Runs at Definitions scope so it can
// see both the category root elements and every group artifact.
module.exports = function () {
  function check(node, reporter) {
    if (node.$type !== "bpmn:Definitions") return;
    const roots = node.rootElements || [];
    const categories = roots.filter((r) => r.$type === "bpmn:Category");
    if (!categories.length) return;

    // Collect referenced categoryValue ids from every group in every process/collaboration.
    const referenced = new Set();
    function walk(container) {
      for (const fe of container.flowElements || []) if (fe.flowElements) walk(fe);
      for (const art of container.artifacts || []) {
        if (art.$type === "bpmn:Group" && art.categoryValueRef) referenced.add(art.categoryValueRef.id);
      }
    }
    for (const r of roots) if (r.flowElements || r.artifacts) walk(r);

    for (const cat of categories) {
      const values = cat.categoryValue || [];
      const anyUsed = values.some((v) => referenced.has(v.id));
      if (values.length === 0 || !anyUsed) {
        reporter.report(cat.id, "Hay una categoría sin uso; eliminala.");
      }
    }
  }
  return { check };
};
