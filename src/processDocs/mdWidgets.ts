// src/processDocs/mdWidgets.ts
import { WidgetType } from "@codemirror/view";
import type { ImageWidget, VideoWidget } from "./cmDecorations";

const ALLOWED_EMBED_HOSTS = ["www.youtube.com", "youtube.com", "player.vimeo.com", "vimeo.com", "www.loom.com", "loom.com"];

function isAllowedEmbed(src: string): boolean {
  try { return ALLOWED_EMBED_HOSTS.includes(new URL(src).host); } catch { return false; }
}

export function buildWidgetDom(w: ImageWidget | VideoWidget): HTMLElement {
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
