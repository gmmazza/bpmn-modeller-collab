import type { IdeaNote } from "./ideaNote";
import { type IdeaState } from "./ideaState";
import { createStateChip } from "./stateChip";

export interface ThreadHandlers {
  onBack(): void;
  onSaveDescription(text: string): void;
  onComment(text: string): void;
  onSetState(estado: IdeaState): void;
  onPromote(): void;
}

export function renderIdeaThread(container: HTMLElement, idea: IdeaNote, h: ThreadHandlers): void {
  container.innerHTML = "";
  container.className = "idea-thread";

  const head = document.createElement("div");
  head.className = "thread-head";
  const back = document.createElement("button");
  back.dataset.threadBack = "true"; back.textContent = "← Volver";
  back.addEventListener("click", h.onBack);
  const state = createStateChip(idea.estado, (s) => h.onSetState(s), "threadState");
  head.append(back, state);

  const meta = document.createElement("div");
  meta.className = "thread-meta";
  const where = idea.anchor ? (idea.anchorLabel || idea.anchor) : "general";
  meta.textContent = `${where} · ${idea.autor}, ${idea.fecha}` + (idea.motivo ? ` · motivo: ${idea.motivo}` : "") + (idea.mejora ? ` · → ${idea.mejora}` : "");

  const desc = document.createElement("textarea");
  desc.dataset.threadDesc = "true"; desc.className = "thread-desc"; desc.value = idea.description;
  desc.addEventListener("blur", () => h.onSaveDescription(desc.value));

  const comments = document.createElement("ul");
  comments.className = "thread-comments";
  for (const c of idea.comments) {
    const li = document.createElement("li");
    li.textContent = `${c.author}, ${c.date}: ${c.text}`;
    comments.append(li);
  }

  const commentBox = document.createElement("input");
  commentBox.dataset.threadComment = "true"; commentBox.placeholder = "Comentar…";
  const submitComment = (): void => { const t = commentBox.value.trim(); if (t) { commentBox.value = ""; h.onComment(t); } };
  commentBox.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submitComment(); } });
  const commentBtn = document.createElement("button");
  commentBtn.dataset.threadCommentAdd = "true"; commentBtn.textContent = "Comentar";
  commentBtn.addEventListener("click", submitComment);

  const promote = document.createElement("button");
  promote.dataset.threadPromote = "true"; promote.className = "thread-promote"; promote.textContent = "Promover a mejora";
  promote.addEventListener("click", h.onPromote);

  container.append(head, meta, desc, comments, commentBox, commentBtn, promote);
}
