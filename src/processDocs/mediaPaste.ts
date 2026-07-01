// src/processDocs/mediaPaste.ts
import type { EditorView } from "@codemirror/view";
import { uniqueAssetName, imageMarkdown, extFromType } from "./assetInsert";

export function insertImageText(existing: string[], mime: string): { name: string; text: string } {
  const name = uniqueAssetName(existing, extFromType(mime));
  return { name, text: imageMarkdown(name) };
}

export interface MediaDeps {
  listAssets(): Promise<string[]>;
  writeAsset(name: string, bytes: Uint8Array): Promise<void>;
}

// Writes the dropped/pasted image and inserts its markdown at the current selection.
export async function handleImageFile(view: EditorView, file: File, deps: MediaDeps): Promise<boolean> {
  if (!file.type.startsWith("image/")) return false;
  const existing = await deps.listAssets();
  const { name, text } = insertImageText(existing, file.type);
  const bytes = new Uint8Array(await file.arrayBuffer());
  await deps.writeAsset(name, bytes);
  const sel = view.state.selection.main;
  view.dispatch({ changes: { from: sel.from, to: sel.to, insert: text }, selection: { anchor: sel.from + text.length } });
  return true;
}
