// Flag a bare bpmn:Task (no precise type). Warn-level: allowed in a draft.
module.exports = function () {
  function check(node, reporter) {
    // Match the exact $type — is(node, 'bpmn:Task') would also match subtypes (UserTask,
    // etc.) because they extend Task, which is not what we want here.
    if (node.$type === "bpmn:Task") {
      reporter.report(node.id, "La tarea no tiene un tipo preciso (usá manual, de usuario o de servicio).");
    }
  }
  return { check };
};
