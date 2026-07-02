import { IDEA_STATES, STATE_GLYPH, type IdeaState } from "./ideaState";

// A compact state control: a chip showing the current state's glyph + label that,
// on click, opens a small menu listing the five states (each with its glyph).
// Picking one fires onPick and closes the menu. `dataAttr` sets the chip's
// data-* hook (camelCase → kebab), e.g. "ideaState" → [data-idea-state].
export function createStateChip(
  current: IdeaState,
  onPick: (s: IdeaState) => void,
  dataAttr = "ideaState",
): HTMLButtonElement {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.dataset[dataAttr] = "true";
  chip.className = "idea-state-chip";
  chip.title = current;
  chip.textContent = `${STATE_GLYPH[current]} ${current}`;
  chip.addEventListener("click", (e) => {
    e.stopPropagation();
    openStateMenu(chip, current, onPick);
  });
  return chip;
}

function openStateMenu(anchor: HTMLElement, current: IdeaState, onPick: (s: IdeaState) => void): void {
  const r = anchor.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "menu-pop idea-state-menu";
  menu.style.position = "fixed";
  menu.style.left = `${r.left}px`;
  menu.style.top = `${r.bottom}px`;

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
    menu.remove();
  }
  function onOutside(e: MouseEvent): void {
    if (!menu.contains(e.target as Node)) close();
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }

  for (const s of IDEA_STATES) {
    const opt = document.createElement("button");
    opt.type = "button";
    opt.dataset.stateOption = s;
    opt.className = "idea-state-option" + (s === current ? " current" : "");
    opt.textContent = `${STATE_GLYPH[s]} ${s}`;
    opt.addEventListener("click", () => { close(); onPick(s); });
    menu.append(opt);
  }

  document.body.append(menu);
  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);
}
