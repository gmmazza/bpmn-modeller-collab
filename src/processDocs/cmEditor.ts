// src/processDocs/cmEditor.ts
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { livePreview } from "./livePreview";
import { handleImageFile, type MediaDeps } from "./mediaPaste";
import { wikilinkAt } from "./wikilinkAt";

export interface MarkdownEditor {
  getDoc(): string;
  setDoc(s: string): void;
  focus(): void;
  destroy(): void;
}

export function createMarkdownEditor(
  parent: HTMLElement,
  opts: {
    doc: string;
    onChange: (doc: string) => void;
    media?: MediaDeps;
    resolveAsset?: (ref: string) => Promise<string | null>;
    wiki?: { candidates(query: string): Array<{ label: string; insert: string }>; navigate(raw: string): void };
  },
): MarkdownEditor {
  const updateListener = EditorView.updateListener.of((u) => {
    if (u.docChanged) opts.onChange(u.state.doc.toString());
  });

  const mediaHandlers = opts.media
    ? EditorView.domEventHandlers({
        paste(event, view) {
          const items = event.clipboardData?.items;
          if (!items) return false;
          for (const item of Array.from(items)) {
            if (item.kind === "file" && item.type.startsWith("image/")) {
              const file = item.getAsFile();
              if (file) {
                event.preventDefault();
                handleImageFile(view, file, opts.media!);
                return true;
              }
            }
          }
          return false;
        },
        drop(event, view) {
          const files = event.dataTransfer?.files;
          if (!files || files.length === 0) return false;
          for (const file of Array.from(files)) {
            if (file.type.startsWith("image/")) {
              event.preventDefault();
              handleImageFile(view, file, opts.media!);
              return true;
            }
          }
          return false;
        },
      })
    : [];

  const wikiExt = opts.wiki
    ? [
        autocompletion({
          override: [(ctx: CompletionContext): CompletionResult | null => {
            const line = ctx.state.doc.lineAt(ctx.pos);
            const before = line.text.slice(0, ctx.pos - line.from);
            const open = before.lastIndexOf("[[");
            if (open < 0 || before.indexOf("]]", open) !== -1) return null;
            const query = before.slice(open + 2);
            const from = line.from + open + 2;
            const options = opts.wiki!.candidates(query).map((c) => ({ label: c.label, apply: c.insert }));
            return { from, options, filter: false };
          }],
        }),
        EditorView.domEventHandlers({
          mousedown: (event, view) => {
            const target = event.target as HTMLElement;
            if (!target.closest(".cm-wikilink")) return false;
            const pos = view.posAtDOM(target);
            const raw = wikilinkAt(view.state.doc.toString(), pos);
            if (!raw) return false;
            event.preventDefault();
            opts.wiki!.navigate(raw);
            return true;
          },
        }),
      ]
    : [];

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: opts.doc,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        EditorView.lineWrapping,
        livePreview(opts.resolveAsset),
        updateListener,
        mediaHandlers,
        ...wikiExt,
      ],
    }),
  });

  return {
    getDoc: () => view.state.doc.toString(),
    setDoc: (s: string) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: s } }),
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
