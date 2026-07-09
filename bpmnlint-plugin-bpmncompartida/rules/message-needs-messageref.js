// A message start/catch/throw/boundary event must declare which message it carries.
module.exports = function () {
  function check(node, reporter) {
    const defs = node.eventDefinitions || [];
    for (const def of defs) {
      if ((def.$type || "").endsWith("MessageEventDefinition") && !def.messageRef) {
        reporter.report(node.id, "El evento de mensaje debe declarar un mensaje (messageRef).");
        return;
      }
    }
  }
  return { check };
};
