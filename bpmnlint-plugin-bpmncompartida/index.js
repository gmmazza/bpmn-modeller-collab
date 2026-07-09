// Local bpmnlint plugin encoding the A.3 BPMN profile. Rule messages are in Spanish (they
// surface to users in the editor). Referenced from .bpmnlintrc as
// `plugin:bpmncompartida/recommended` and bundled by `npm run lint:pack`.
module.exports = {
  rules: {
    "no-untyped-task": "./rules/no-untyped-task",
    "exclusive-split-needs-default": "./rules/exclusive-split-needs-default",
    "no-inclusive-complex-gateway": "./rules/no-inclusive-complex-gateway",
    "message-needs-messageref": "./rules/message-needs-messageref",
    "no-orphan-category": "./rules/no-orphan-category",
    "single-none-start": "./rules/single-none-start",
    "no-gateway-split-and-join": "./rules/no-gateway-split-and-join",
  },
  configs: {
    recommended: {
      rules: {
        "no-untyped-task": "warn",
        "exclusive-split-needs-default": "error",
        "no-inclusive-complex-gateway": "error",
        "message-needs-messageref": "error",
        "no-orphan-category": "warn",
        "single-none-start": "error",
        "no-gateway-split-and-join": "error",
      },
    },
  },
};
