// Reusable draggable-divider helper. Pure size clamp + a pointer-drag wiring that mirrors
// the existing setupInspectorResize/setupCanvasSplitResize pattern in main.ts, so both the
// left panel (Task 2) and the master/subprocess split (Task 3) share one implementation.

export function clampSize(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface ResizerOptions {
  axis: "x" | "y";
  min: number;
  max: number;
  invert?: boolean;
  getSize(): number;
  setSize(px: number): void;
  onCommit?(px: number): void;
}

export function mountResizer(handle: HTMLElement, opts: ResizerOptions): () => void {
  let dragging = false;
  let start = 0;
  let startSize = 0;

  const coord = (e: MouseEvent): number => (opts.axis === "x" ? e.clientX : e.clientY);
  const sign = opts.invert ? -1 : 1;

  const onMove = (e: MouseEvent): void => {
    if (!dragging) return;
    const delta = (coord(e) - start) * sign;
    opts.setSize(clampSize(startSize + delta, opts.min, opts.max));
  };
  const onUp = (): void => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("col-resizing");
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    opts.onCommit?.(clampSize(opts.getSize(), opts.min, opts.max));
  };
  const onDown = (e: MouseEvent): void => {
    dragging = true;
    start = coord(e);
    startSize = opts.getSize();
    document.body.classList.add("col-resizing");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    e.preventDefault();
  };

  handle.addEventListener("mousedown", onDown);
  return () => {
    handle.removeEventListener("mousedown", onDown);
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
}
