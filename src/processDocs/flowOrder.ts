export interface FlowNode { id: string; name: string; type: string }
export interface FlowGraph {
  nodes: FlowNode[];
  edges: Array<{ source: string; target: string }>;
  starts: string[];
}

export function orderFlow(graph: FlowGraph): string[] {
  const out: string[] = [];
  const visited = new Set<string>();
  const outgoing = new Map<string, string[]>();
  for (const e of graph.edges) {
    const list = outgoing.get(e.source) ?? [];
    list.push(e.target);
    outgoing.set(e.source, list);
  }
  const known = new Set(graph.nodes.map((n) => n.id));
  function dfs(id: string): void {
    if (visited.has(id) || !known.has(id)) return;
    visited.add(id);
    out.push(id);
    for (const t of outgoing.get(id) ?? []) dfs(t);
  }
  for (const s of graph.starts) dfs(s);
  for (const n of graph.nodes) if (!visited.has(n.id)) out.push(n.id);
  return out;
}

export function graphFromModeler(modeler: { get(name: string): any }): FlowGraph {
  const reg = modeler.get("elementRegistry");
  const all: any[] = reg.getAll();
  const nodes: FlowNode[] = [];
  const edges: Array<{ source: string; target: string }> = [];
  const incoming = new Set<string>();
  for (const el of all) {
    const type: string = el.businessObject?.$type ?? "";
    if (type === "bpmn:SequenceFlow") {
      const source = el.businessObject?.sourceRef?.id ?? el.source?.id;
      const target = el.businessObject?.targetRef?.id ?? el.target?.id;
      if (source && target) { edges.push({ source, target }); incoming.add(target); }
    } else if (type && type !== "bpmn:Process" && type !== "bpmn:Collaboration" && type !== "bpmn:Participant" && !type.startsWith("bpmndi") && type !== "label") {
      nodes.push({ id: el.id, name: el.businessObject?.name ?? "", type });
    }
  }
  let starts = nodes.filter((n) => n.type.endsWith("StartEvent")).map((n) => n.id);
  if (starts.length === 0) starts = nodes.filter((n) => !incoming.has(n.id)).map((n) => n.id);
  return { nodes, edges, starts };
}
