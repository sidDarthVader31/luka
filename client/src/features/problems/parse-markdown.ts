// A small Markdown subset for problem briefs: headings, paragraphs, bullet and numbered lists,
// **bold**, *italic* and `code`. It produces data, not HTML, so nothing from the brief is ever
// injected as markup.

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "em"; text: string }
  | { type: "code"; text: string };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; content: Inline[] }
  | { type: "paragraph"; content: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] };

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) {
      out.push({ type: "text", text: text.slice(last, index) });
    }
    const token = match[0];
    if (token.startsWith("**")) {
      out.push({ type: "strong", text: token.slice(2, -2) });
    } else if (token.startsWith("`")) {
      out.push({ type: "code", text: token.slice(1, -1) });
    } else {
      out.push({ type: "em", text: token.slice(1, -1) });
    }
    last = index + token.length;
  }
  if (last < text.length) {
    out.push({ type: "text", text: text.slice(last) });
  }
  return out;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", content: parseInline(paragraph.join(" ")) });
      paragraph = [];
    }
    if (list) {
      blocks.push({ type: "list", ...list });
      list = null;
    }
  };

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") {
      flush();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = Math.min(3, heading[1]!.length) as 1 | 2 | 3;
      blocks.push({ type: "heading", level, content: parseInline(heading[2]!) });
      continue;
    }
    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      const ordered = Boolean(numbered);
      if (paragraph.length > 0 || (list && list.ordered !== ordered)) {
        flush();
      }
      list ??= { ordered, items: [] };
      list.items.push(parseInline(item[1]!));
      continue;
    }
    if (list) {
      flush();
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}
