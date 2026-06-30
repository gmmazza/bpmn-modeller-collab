// src/processDocs/cmEditor.ts
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { livePreview } from "./livePreview";

export interface MarkdownEditor {
  getDoc(): string;
  setDoc(s: string): void;
  focus(): void;
  destroy(): void;
}

export function createMarkdownEditor(
  parent: HTMLElement,
  opts: { doc: string; onChange: (doc: string) => void },
): MarkdownEditor {
  const updateListener = EditorView.updateListener.of((u) => {
    if (u.docChanged) opts.onChange(u.state.doc.toString());
  });

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: opts.doc,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        EditorView.lineWrapping,
        livePreview(),
        updateListener,
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
