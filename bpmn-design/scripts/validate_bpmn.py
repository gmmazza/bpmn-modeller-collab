#!/usr/bin/env python3
"""Validate a .bpmn file's structure and print a JSON report of checks.

Usage:
    python validate_bpmn.py <file.bpmn> [<file2.bpmn> ...]

Run this after serializing a diagram. It deterministically catches the failure classes
that are tedious and error-prone to check by eye:

  - render invariant: every semantic flow node has a BPMNShape AND every sequence/message
    flow has a BPMNEdge (the #1 cause of a file that parses but renders blank);
  - BPMNEdges with fewer than 2 waypoints;
  - start events with incoming flow / end events with outgoing flow;
  - implicit split/merge on a task or event (branching that skips a gateway);
  - sequence flow crossing a pool boundary (must be a message flow);
  - message flow connecting two nodes in the same pool;
  - unlabeled exclusive gateways / gates;
  - missing start or end events.

A "check" is a boolean (true = healthy). "stats" lists the offending IDs so you can fix
them. Exit code is non-zero if any check fails, so it can gate a workflow.

Namespace-agnostic on prefixes (matches by local tag name).
"""
import json
import sys

# Prefer defusedxml (immune to XXE / billion-laughs) if available; fall back to stdlib.
try:
    import defusedxml.ElementTree as ET  # type: ignore
except ImportError:  # pragma: no cover
    import xml.etree.ElementTree as ET

FLOW_NODE_TAGS = {
    "startEvent", "endEvent", "task", "userTask", "serviceTask", "manualTask",
    "sendTask", "receiveTask", "scriptTask", "businessRuleTask", "callActivity",
    "subProcess", "transaction", "adHocSubProcess", "exclusiveGateway",
    "parallelGateway", "inclusiveGateway", "eventBasedGateway", "complexGateway",
    "intermediateCatchEvent", "intermediateThrowEvent", "boundaryEvent",
}
TASK_TAGS = {
    "task", "userTask", "serviceTask", "manualTask", "sendTask", "receiveTask",
    "scriptTask", "businessRuleTask",
}


def local(tag):
    return tag.rsplit("}", 1)[-1]


def validate(path):
    report = {"file": path, "ok": False, "checks": {}, "stats": {}, "errors": []}
    try:
        root = ET.parse(path).getroot()
    except Exception as e:  # noqa: BLE001
        report["checks"]["parses_as_xml"] = False
        report["errors"].append(f"XML parse error: {e}")
        return report
    report["checks"]["parses_as_xml"] = True

    def it(tag):
        return [e for e in root.iter() if local(e.tag) == tag]

    processes = it("process")
    participants = it("participant")
    message_flows = it("messageFlow")
    lanes = it("lane")
    seq_flows = it("sequenceFlow")

    flow_nodes, node_to_process = {}, {}
    for proc in processes:
        for el in proc.iter():
            if local(el.tag) in FLOW_NODE_TAGS and el.get("id"):
                flow_nodes[el.get("id")] = el
                node_to_process[el.get("id")] = proc.get("id")

    di_shapes = {e.get("bpmnElement") for e in it("BPMNShape")}
    di_edges_el = it("BPMNEdge")
    di_edges = {e.get("bpmnElement") for e in di_edges_el}
    has_di = bool(it("BPMNPlane"))

    def kids(el, tag):
        return [c.text for c in el if local(c.tag) == tag]

    c, s = report["checks"], report["stats"]

    c["has_di_layer"] = has_di

    nodes_missing_shape = [n for n in flow_nodes if n not in di_shapes]
    flows_missing_edge = [f.get("id") for f in seq_flows if f.get("id") not in di_edges]
    mflows_missing_edge = [f.get("id") for f in message_flows if f.get("id") not in di_edges]
    c["render_invariant"] = (
        has_di and len(flow_nodes) > 0
        and not nodes_missing_shape and not flows_missing_edge and not mflows_missing_edge
    )
    s["nodes_missing_shape"] = nodes_missing_shape
    s["flows_missing_edge"] = flows_missing_edge + mflows_missing_edge

    bad_edges = [e.get("bpmnElement") for e in di_edges_el
                 if len([w for w in e.iter() if local(w.tag) == "waypoint"]) < 2]
    c["edges_have_2plus_waypoints"] = not bad_edges
    s["edges_lt_2_waypoints"] = bad_edges

    starts = [n for n, el in flow_nodes.items() if local(el.tag) == "startEvent"]
    ends = [n for n, el in flow_nodes.items() if local(el.tag) == "endEvent"]
    c["has_start_event"] = len(starts) >= 1
    c["has_end_event"] = len(ends) >= 1
    c["start_no_incoming"] = not [n for n in starts if kids(flow_nodes[n], "incoming")]
    c["end_no_outgoing"] = not [n for n in ends if kids(flow_nodes[n], "outgoing")]

    implicit = []
    for n, el in flow_nodes.items():
        if "Gateway" in local(el.tag) or local(el.tag) == "boundaryEvent":
            continue
        if len(kids(el, "outgoing")) > 1 or len(kids(el, "incoming")) > 1:
            implicit.append(n)
    c["no_implicit_split_or_merge"] = not implicit
    s["implicit_split_or_merge"] = implicit

    cross = []
    for f in seq_flows:
        ps, pt = node_to_process.get(f.get("sourceRef")), node_to_process.get(f.get("targetRef"))
        if ps and pt and ps != pt:
            cross.append(f.get("id"))
    c["no_cross_pool_sequence_flow"] = not cross
    s["cross_pool_sequence_flows"] = cross

    same_pool_msg = []
    for f in message_flows:
        ps, pt = node_to_process.get(f.get("sourceRef")), node_to_process.get(f.get("targetRef"))
        if ps and pt and ps == pt:
            same_pool_msg.append(f.get("id"))
    c["no_same_pool_message_flow"] = not same_pool_msg
    s["same_pool_message_flows"] = same_pool_msg

    excl = [n for n, el in flow_nodes.items() if local(el.tag) == "exclusiveGateway"]
    seqflow_by_id = {f.get("id"): f for f in seq_flows}
    unlabeled_excl, unlabeled_gates = [], []
    for n in excl:
        if not (flow_nodes[n].get("name") or "").strip():
            unlabeled_excl.append(n)
        default = flow_nodes[n].get("default")
        for fid in kids(flow_nodes[n], "outgoing"):
            f = seqflow_by_id.get(fid)
            if f is not None and fid != default and not (f.get("name") or "").strip():
                unlabeled_gates.append(fid)
    c["exclusive_gateways_labeled"] = not unlabeled_excl
    c["gates_labeled"] = not unlabeled_gates
    s["unlabeled_exclusive_gateways"] = unlabeled_excl
    s["unlabeled_gates"] = unlabeled_gates

    unnamed = [n for n, el in flow_nodes.items()
               if local(el.tag) in TASK_TAGS and not (el.get("name") or "").strip()]
    c["all_tasks_named"] = not unnamed
    s["unnamed_tasks"] = unnamed

    s["counts"] = {
        "processes": len(processes), "participants": len(participants),
        "flow_nodes": len(flow_nodes), "sequence_flows": len(seq_flows),
        "message_flows": len(message_flows), "lanes": len(lanes),
        "di_shapes": len(di_shapes), "di_edges": len(di_edges),
        "start_events": len(starts), "end_events": len(ends),
    }

    report["ok"] = all(c.values())
    report["failed_checks"] = [k for k, v in c.items() if not v]
    return report


def main(argv):
    if len(argv) < 2:
        print("usage: python validate_bpmn.py <file.bpmn> [<file2.bpmn> ...]")
        return 2
    all_ok = True
    for path in argv[1:]:
        rep = validate(path)
        print(json.dumps(rep, indent=2, ensure_ascii=False))
        all_ok = all_ok and rep["ok"]
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
