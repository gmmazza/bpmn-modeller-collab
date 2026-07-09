// Inclusive and complex gateways are excluded from the profile: they add branching/merging
// semantics that are hard to review at a glance and rarely needed at this abstraction level.
module.exports = function () {
  function check(node, reporter) {
    if (node.$type === "bpmn:InclusiveGateway" || node.$type === "bpmn:ComplexGateway") {
      reporter.report(node.id, "Las compuertas inclusivas y complejas no están permitidas en el perfil.");
    }
  }
  return { check };
};
