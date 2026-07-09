// A called subprocess must have exactly one none start event. Reported per Process scope.
// (Masters legitimately have multiple starts; they are exempt by carrying a call activity.)
module.exports = function () {
  function check(node, reporter) {
    if (node.$type !== "bpmn:Process") return;
    const flow = node.flowElements || [];
    // A master orchestrates call activities → exempt (its multi-start is legitimate).
    const isMaster = flow.some((fe) => fe.$type === "bpmn:CallActivity" && fe.calledElement);
    if (isMaster) return;
    const starts = flow.filter((fe) => fe.$type === "bpmn:StartEvent");
    const nonNone = starts.filter((s) => (s.eventDefinitions || []).length > 0);
    if (starts.length > 1 || nonNone.length > 0) {
      reporter.report(node.id, "Un subproceso llamado debe tener exactamente un inicio simple (none).");
    }
  }
  return { check };
};
