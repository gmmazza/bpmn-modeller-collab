import { describe, it, expect } from "vitest";
import { splitBody, joinBody, addComment, parseStateLog, type Comment } from "./ideaComments";

describe("parseStateLog", () => {
  it("detects a state-change log entry and its motivo", () => {
    expect(parseStateLog("[haciendo]")).toEqual({ estado: "haciendo", motivo: "" });
    expect(parseStateLog("[rechazado] fuera de alcance")).toEqual({ estado: "rechazado", motivo: "fuera de alcance" });
  });
  it("returns null for a normal comment", () => {
    expect(parseStateLog("un comentario normal")).toBeNull();
    expect(parseStateLog("[algo] no es un estado")).toBeNull();
  });
});

describe("ideaComments", () => {
  it("splits a body into description and comments", () => {
    const body = "La idea principal.\ncon dos líneas\n\n## Comentarios\n- Beto, 2026-07-02: buena\n- Ana, 2026-07-03: mejor con SLA";
    const { description, comments } = splitBody(body);
    expect(description).toBe("La idea principal.\ncon dos líneas");
    expect(comments).toEqual([
      { author: "Beto", date: "2026-07-02", text: "buena" },
      { author: "Ana", date: "2026-07-03", text: "mejor con SLA" },
    ]);
  });

  it("handles a body with no comments section", () => {
    const { description, comments } = splitBody("solo descripción");
    expect(description).toBe("solo descripción");
    expect(comments).toEqual([]);
  });

  it("round-trips through joinBody", () => {
    const comments: Comment[] = [{ author: "Ana", date: "2026-07-01", text: "hola" }];
    const body = joinBody("desc", comments);
    expect(body).toContain("## Comentarios");
    expect(splitBody(body)).toEqual({ description: "desc", comments });
  });

  it("omits the comments section when there are none", () => {
    expect(joinBody("desc", [])).not.toContain("## Comentarios");
  });

  it("appends a comment immutably", () => {
    const c: Comment[] = [];
    const out = addComment(c, { author: "Ana", date: "2026-07-01", text: "x" });
    expect(out).toHaveLength(1);
    expect(c).toHaveLength(0);
  });
});
