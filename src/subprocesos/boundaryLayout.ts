// Pure geometry for spreading several escalation boundary events across a host's bottom edge.
// When a Call Activity has N alternative outcomes, dropping every boundary at the host's centre
// (addEscalationBoundary's attach point) stacks the circles AND overprints their labels. This
// computes an even spread along the bottom edge plus a per-index label cascade so N outcomes
// read cleanly. Backend-agnostic and side-effect free so it is unit-testable without a modeler
// (a real bpmn-js modeler cannot boot in happy-dom); the caller applies the deltas via modeling.

// Vertical step between stacked outcome labels. Long names wrap to ~2 lines (≈28px rendered), so
// the step must clear a wrapped label — a smaller step leaves the names overprinting.
export const BOUNDARY_LABEL_STEP = 34;

export interface Box { x: number; y: number; width: number; height: number }
export interface BoundarySlot { cx: number; cy: number; labelX: number; labelY: number }

// Centre positions (on the bottom edge) + staggered label top-left for `count` boundaries,
// left→right. `size` is the boundary circle diameter, `labelW` its label width (for centring).
export function distributeBoundaries(host: Box, count: number, size = 36, labelW = 120): BoundarySlot[] {
  const cy = host.y + host.height; // the circle centre rides the bottom edge
  const slot = (cx: number, i: number): BoundarySlot => ({
    cx, cy,
    labelX: cx - labelW / 2,
    labelY: cy + size / 2 + 4 + i * BOUNDARY_LABEL_STEP,
  });
  if (count <= 1) return [slot(host.x + host.width / 2, 0)];
  // Keep centre-to-centre ≥ `size` so the circles never overlap, even if that overflows the
  // host corners a little (boundary events legitimately sit on/just past the edge). Centre the
  // whole spread on the host so it stays symmetric.
  const gap = Math.max((host.width - size) / (count - 1), size);
  const startCx = host.x + host.width / 2 - (gap * (count - 1)) / 2;
  return Array.from({ length: count }, (_, i) => slot(startCx + gap * i, i));
}
