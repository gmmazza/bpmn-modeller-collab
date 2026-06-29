import type { TreeEntry } from "./types";

function folderPaths(entries: TreeEntry[]): string[] {
  const dirs = entries.filter((e) => e.kind === "dir").map((e) => e.path);
  dirs.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return ["", ...dirs];
}

function isDisabled(path: string, disabled?: string): boolean {
  if (disabled === undefined) return false;
  return path === disabled || path.startsWith(`${disabled}/`);
}

export function pickFolder(entries: TreeEntry[], opts: { title: string; disabledPath?: string }): Promise<string | null> {
  return new Promise((resolve) => {
    let selected: string | null = null;
    const overlay = document.createElement("div");
    overlay.className = "fp-overlay";
    const box = document.createElement("div");
    box.className = "fp-box";
    const h = document.createElement("h4");
    h.textContent = opts.title;
    box.appendChild(h);
    const list = document.createElement("div");
    list.className = "fp-list";
    for (const path of folderPaths(entries)) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "fp-folder";
      b.dataset.path = path;
      b.textContent = path === "" ? "📁 (raíz)" : `📁 ${path}`;
      b.disabled = isDisabled(path, opts.disabledPath);
      b.addEventListener("click", () => {
        selected = path;
        list.querySelectorAll(".fp-folder").forEach((x) => x.classList.remove("sel"));
        b.classList.add("sel");
      });
      list.appendChild(b);
    }
    box.appendChild(list);
    const actions = document.createElement("div");
    actions.className = "fp-actions";
    const cancel = document.createElement("button");
    cancel.type = "button"; cancel.className = "fp-cancel"; cancel.textContent = "Cancelar";
    const confirm = document.createElement("button");
    confirm.type = "button"; confirm.className = "fp-confirm"; confirm.textContent = "Aceptar";
    const close = (val: string | null) => { overlay.remove(); resolve(val); };
    cancel.addEventListener("click", () => close(null));
    confirm.addEventListener("click", () => close(selected));
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(null); });
    actions.append(cancel, confirm);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  });
}
