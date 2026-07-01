export function wikilinkAt(text: string, pos: number): string | null {
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const from = m.index;
    const to = from + m[0].length;
    if (pos >= from && pos <= to) return m[1];
  }
  return null;
}
