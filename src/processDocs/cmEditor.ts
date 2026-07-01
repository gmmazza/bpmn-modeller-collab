// src/processDocs/cmEditor.ts
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { livePreview } from "./livePreview";
import { handleImageFile, type MediaDeps } from "./mediaPaste";

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
