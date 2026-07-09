// A diverging (2+ outgoing) exclusive gateway must declare a `default` flow — no-runtime
// determinism. Joining exclusive gateways (<=1 outgoing) are exempt.
module.exports = function () {
  function check(node, reporter) {
    if (node.$type !== "bpmn:ExclusiveGateway") return;
    const outgoing = node.outgoing || [];
    if (outgoing.length < 2) return;
    if (!node.default) {
      reporter.report(node.id, "La compuerta exclusiva que se abre debe tener un camino por defecto.");
    }
  }
  return { check };
};
