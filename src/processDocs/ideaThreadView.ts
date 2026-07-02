import type { IdeaNote } from "./ideaNote";
import { STATE_GLYPH, type IdeaState } from "./ideaState";
import { createStateChip } from "./stateChip";
import { parseStateLog } from "./ideaComments";
import { isAiAuthor } from "./aiIdentity";

// author label with a 🤖 marker when the author is an AI/agent identity.
function authorLabel(name: string): string {
  return isAiAuthor(name) ? `🤖 ${name}` : name;
}

export interface ThreadHandlers {
  onBack(): void;
  onSaveDescription(text: string): void;
  onComment(text: string): void;
  onSetState(estado: IdeaState): void;
  onPromote(): void;
  onToggleLog(): void;
}

export function renderIdeaThread(container: HTMLElement, idea: IdeaNote, h: ThreadHandlers, showLog = true): void {
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

  // toggle: show/hide the state-change history (interleaved with comments)
  const logToggle = document.createElement("label");
  logToggle.className = "thread-log-toggle";
  const logCb = document.createElement("input");
  logCb.type = "checkbox"; logCb.dataset.threadLogToggle = "true"; logCb.checked = showLog;
  logCb.addEventListener("change", () => h.onToggleLog());
  logToggle.append(logCb, document.createTextNode(" Historial de estados"));

  // timeline: comments + state-change log entries, in chronological (append) order
  const comments = document.createElement("ul");
  comments.className = "thread-comments";
  let shown = 0;
  for (const c of idea.comments) {
    const log = parseStateLog(c.text);
    if (log) {
      if (!showLog) continue;
      const li = document.createElement("li");
      li.className = "thread-log";
      li.dataset.threadLog = "true";
      const g = STATE_GLYPH[log.estado as IdeaState] ?? "•";
      li.textContent = `${g} ${authorLabel(c.author)} cambió a «${log.estado}»${log.motivo ? ` — ${log.motivo}` : ""} · ${c.date}`;
      comments.append(li);
      shown++;
      continue;
    }
    const li = document.createElement("li");
    li.className = "thread-comment";
    const metaEl = document.createElement("div");
    metaEl.className = "thread-comment-meta";
    metaEl.textContent = `${authorLabel(c.author)} · ${c.date}`;
    const bubble = document.createElement("div");
    bubble.className = "thread-comment-bubble";
    bubble.textContent = c.text;
    li.append(metaEl, bubble);
    comments.append(li);
    shown++;
  }
  if (shown === 0) {
    const empty = document.createElement("li");
    empty.className = "thread-comment-empty";
    empty.textContent = "Sin comentarios todavía.";
    comments.append(empty);
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

  container.append(head, meta, desc, logToggle, comments, commentBox, commentBtn, promote);
}
