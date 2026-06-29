import type { ModelerLike } from "./editor";
import HeatMap, { type DataPoint } from "heatmap-ts";

// Activity heatmap over the token simulation. Beta: known zoom-rendering TODO
// (positions use the current viewbox; re-render on zoom is not wired).
export function createHeatmapController(modeler: ModelerLike, container: HTMLElement) {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let heatMap: HeatMap | null = null;

  function start(): void {
    const canvas = modeler.get("canvas");
    const registry = modeler.get("elementRegistry");
    const simulationTrace = modeler.get("simulationTrace");
    const simulationSupport = modeler.get("simulationSupport");

    heatMap = new HeatMap({
      container,
      maxOpacity: 0.8,
      radius: 50,
      blur: 0.8,
      width: container.clientWidth,
      height: container.clientHeight,
    });

    const counts = new Map<string, number>();
    let lastIndex = 0;
    simulationTrace.start();

    const update = () => {
      const history: string[] = simulationSupport.getHistory();
      for (let i = lastIndex; i < history.length; i++) {
        if (!history[i].startsWith("Flow")) {
          counts.set(history[i], (counts.get(history[i]) || 0) + 1);
        }
        lastIndex = i + 1;
      }
      const vb = canvas.viewbox();
      const data: DataPoint[] = [];
      for (const [id, value] of counts) {
        const el = registry.get(id);
        if (!el) continue;
        data.push({
          x: vb.scale * (el.x + el.width / 2 - vb.x),
          y: vb.scale * (el.y + el.height / 2 - vb.y),
          value: value * 4,
        });
      }
      heatMap?.setData({ data });
    };

    intervalId = setInterval(update, 1000);

    modeler.on("tokenSimulation.toggleMode", () => {
      simulationTrace.stop();
      counts.clear();
      lastIndex = 0;
      heatMap?.setData({ data: [] });
      simulationTrace.start();
    });
  }

  function stop(): void {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    heatMap?.setData({ data: [] });
  }

  return { start, stop };
}
