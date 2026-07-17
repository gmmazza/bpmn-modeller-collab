export interface MenuItem {
  label: string;
  danger?: boolean;
  onClick(): void;
}

let current: HTMLElement | null = null;

/**
 * Place a popup so it stays fully on-screen: open below-and-right of the anchor by
 * default, shift left when it would spill off the right edge, and flip above the
 * anchor when there isn't room below. Pure (no DOM) so the geometry is unit-tested.
 */
export function computeMenuPosition(
  anchor: { left: number; top: number; bottom: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 6,
): { left: number; top: number } {
  let left = anchor.left;
  if (left + size.width > viewport.width - margin) left = viewport.width - size.width - margin;
  if (left < margin) left = margin;

  let top = anchor.bottom;
  if (top + size.height > viewport.height - margin) {
    const above = anchor.top - size.height; // try opening upward from the anchor's top
    top = above >= margin ? above : Math.max(margin, viewport.height - size.height - margin);
  }
  if (top < margin) top = margin;
  return { left, top };
}

export function closeContextMenu(): void {
  if (current) {
    current.remove();
    current = null;
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
  }
}

function onOutside(e: MouseEvent): void {
  if (current && !current.contains(e.target as Node)) closeContextMenu();
}
function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape") closeContextMenu();
}

export function openContextMenu(anchor: DOMRect, items: MenuItem[]): void {
  closeContextMenu();
  const pop = document.createElement("div");
  pop.className = "menu-pop ctx-menu";
  pop.style.position = "fixed";
  // Provisional placement; corrected to the viewport once the menu has a measured size.
  pop.style.left = `${anchor.left}px`;
  pop.style.top = `${anchor.bottom}px`;
  for (const item of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = item.label;
    if (item.danger) b.className = "danger";
    b.addEventListener("click", () => { closeContextMenu(); item.onClick(); });
    pop.appendChild(b);
  }
  document.body.appendChild(pop);
  current = pop;
  // Now that it's laid out, clamp/flip so it never spills off-screen or over the canvas.
  const rect = pop.getBoundingClientRect();
  if (rect.width && rect.height) {
    const { left, top } = computeMenuPosition(
      { left: anchor.left, top: anchor.top, bottom: anchor.bottom },
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
    );
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }
  // Defer listener attach so the opening click doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);
}
