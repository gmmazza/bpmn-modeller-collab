export interface MenuItem {
  label: string;
  danger?: boolean;
  onClick(): void;
}

let current: HTMLElement | null = null;

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
  // Defer listener attach so the opening click doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);
}
