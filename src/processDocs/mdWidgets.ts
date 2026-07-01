// src/processDocs/mdWidgets.ts
import { WidgetType } from "@codemirror/view";
import type { ImageWidget, VideoWidget, Widget } from "./cmDecorations";

const ALLOWED_EMBED_HOSTS = ["www.youtube.com", "youtube.com", "player.vimeo.com", "vimeo.com", "www.loom.com", "loom.com"];

function isAllowedEmbed(src: string): boolean {
  try { return ALLOWED_EMBED_HOSTS.includes(new URL(src).host); } catch { return false; }
}

export function buildWidgetDom(w: Widget): HTMLElement {
  if (w.type === "bullet") {
    const b = document.createElement("span");
    b.className = "cm-md-bullet";
    b.textContent = "• ";
    return b;
  }
  if (w.type === "task") {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-md-task";
    box.disabled = true;
    box.checked = w.checked;
    return box;
  }
  const wrap = document.createElement("span");
  wrap.className = "cm-md-widget";
  if (w.type === "image") {
    const img = document.createElement("img");
    img.setAttribute("src", w.src);
    img.setAttribute("alt", w.alt);
    img.className = "cm-md-image";
    wrap.appendChild(img);
  } else if (w.type === "video" && isAllowedEmbed(w.src)) {
    const f = document.createElement("iframe");
    f.setAttribute("src", w.src);
    f.setAttribute("allowfullscreen", "");
    f.setAttribute("frameborder", "0");
    f.className = "cm-md-video";
    wrap.appendChild(f);
  }
  return wrap;
}

export class ImageWidgetType extends WidgetType {
  readonly resolve?: (ref: string) => Promise<string | null>;
  constructor(readonly src: string, readonly alt: string, resolve?: (ref: string) => Promise<string | null>) {
    super();
    this.resolve = resolve;
  }
  eq(other: ImageWidgetType): boolean { return other.src === this.src && other.alt === this.alt; }
  toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-md-widget";
    const img = document.createElement("img");
    img.setAttribute("alt", this.alt);
    img.className = "cm-md-image";
    if (this.resolve) {
      img.setAttribute("src", "");
      this.resolve(this.src).then((url) => { if (url) img.setAttribute("src", url); });
    } else {
      img.setAttribute("src", this.src);
    }
    wrap.appendChild(img);
    return wrap;
  }
}

export class VideoWidgetType extends WidgetType {
  constructor(readonly src: string) { super(); }
  eq(other: VideoWidgetType): boolean { return other.src === this.src; }
  toDOM(): HTMLElement { return buildWidgetDom({ type: "video", src: this.src }); }
}

export class BulletWidgetType extends WidgetType {
  eq(other: BulletWidgetType): boolean { return other instanceof BulletWidgetType; }
  toDOM(): HTMLElement { return buildWidgetDom({ type: "bullet" }); }
}

export class TaskWidgetType extends WidgetType {
  constructor(readonly checked: boolean) { super(); }
  eq(other: TaskWidgetType): boolean { return other.checked === this.checked; }
  toDOM(): HTMLElement { return buildWidgetDom({ type: "task", checked: this.checked }); }
  // Let clicks reach the editor (they place the cursor), enabling inline editing.
  ignoreEvent(): boolean { return false; }
}

// Re-export types used by callers/tests that build the pure widget shapes.
export type { ImageWidget, VideoWidget };
