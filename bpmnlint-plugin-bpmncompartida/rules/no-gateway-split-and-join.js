// A gateway that both joins (2+ incoming) and splits (2+ outgoing) at once is hard to read at
// a glance; split it into a dedicated join gateway followed by a dedicated split gateway.
module.exports = function () {
  function check(node, reporter) {
    if (!(node.$type || "").endsWith("Gateway")) return;
    const incoming = node.incoming || [];
    const outgoing = node.outgoing || [];
    if (incoming.length > 1 && outgoing.length > 1) {
      reporter.report(node.id, "Una compuerta debe abrir o cerrar caminos, no ambas cosas a la vez.");
    }
  }
  return { check };
};
