// src/processDocs/livePreview.ts
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { type Extension, type Range } from "@codemirror/state";
import { computeMarkdownDecorations, type DecoSpec } from "./cmDecorations";
import { ImageWidgetType, VideoWidgetType } from "./mdWidgets";

type ActiveRange = { from: number; to: number };

function intersects(a: ActiveRange, b: ActiveRange): boolean {
  return a.from <= b.to && b.from <= a.to;
}

export function visibleSpecs(specs: DecoSpec[], activeRanges: ActiveRange[]): DecoSpec[] {
  return specs.filter((s) => {
    if (s.kind !== "hide") return true;
    return !activeRanges.some((r) => intersects(s, r));
  });
}

function activeLineRanges(view: EditorView): ActiveRange[] {
  const ranges: ActiveRange[] = [];
  for (const r of view.state.selection.ranges) {
    const lineFrom = view.state.doc.lineAt(r.from);
    const lineTo = view.state.doc.lineAt(r.to);
    ranges.push({ from: lineFrom.from, to: lineTo.to });
  }
  return ranges;
}

function buildDecorations(view: EditorView, resolveAsset?: (ref: string) => Promise<string | null>): DecorationSet {
  const text = view.state.doc.toString();
  const specs = visibleSpecs(computeMarkdownDecorations(text), activeLineRanges(view));

  // Use Decoration.set(ranges, /*sort*/ true) instead of RangeSetBuilder to avoid
  // RangeError when mark and replace decorations share the same `from` position.
  // A heading emits both a mark over 0..N and a hide/replace over 0..2 — these
  // have identical `from` but different `startSide`, which RangeSetBuilder rejects
  // unless you track ordering yourself. Decoration.set with sort=true handles it.
  const decoRanges: Range<Decoration>[] = [];

  for (const s of specs) {
    if (s.kind === "hide") {
      if (s.to > s.from) decoRanges.push(Decoration.replace({}).range(s.from, s.to));
    } else if (s.kind === "mark" && s.cls) {
      if (s.to > s.from) decoRanges.push(Decoration.mark({ class: s.cls }).range(s.from, s.to));
    } else if (s.kind === "widget" && s.widget) {
      const w = s.widget.type === "image"
        ? new ImageWidgetType(s.widget.src, s.widget.alt, resolveAsset)
        : new VideoWidgetType(s.widget.src);
      if (s.to > s.from) decoRanges.push(Decoration.replace({ widget: w }).range(s.from, s.to));
    }
  }

  return Decoration.set(decoRanges, /* sort */ true);
}

export function livePreview(resolveAsset?: (ref: string) => Promise<string | null>): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) { this.decorations = buildDecorations(view, resolveAsset); }
      update(u: ViewUpdate): void {
        if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = buildDecorations(u.view, resolveAsset);
      }
    },
    { decorations: (v) => v.decorations },
  );
}
