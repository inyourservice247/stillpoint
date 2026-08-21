import { normalizeText } from "./textNormalization";

export type MarkdownChapterDraft = {
  title: string;
  level: number;
  paragraphIndex: number;
};

export function prepareMarkdownBook(input: string): { normalizedText: string; chapters: MarkdownChapterDraft[] } {
  const paragraphs: string[] = [];
  const chapters: MarkdownChapterDraft[] = [];
  let paragraphLines: string[] = [];
  let fenced = false;

  const flushParagraph = () => {
    const paragraph = paragraphLines.join(" ").trim();
    if (paragraph) paragraphs.push(paragraph);
    paragraphLines = [];
  };

  const lines = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (/^(```|~~~)/.test(trimmed)) {
      fenced = !fenced;
      flushParagraph();
      continue;
    }
    if (fenced) {
      if (trimmed) paragraphLines.push(trimmed);
      continue;
    }
    const heading = /^(#{1,6})\s+(.+?)\s*#*$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      const title = cleanInlineMarkdown(heading[2]);
      if (title) {
        chapters.push({ title, level: heading[1].length, paragraphIndex: paragraphs.length });
        paragraphs.push(title);
      }
      continue;
    }
    if (!trimmed) {
      flushParagraph();
      continue;
    }
    if (/^([-*_])(?:\s*\1){2,}$/.test(trimmed)) {
      flushParagraph();
      continue;
    }
    const cleaned = cleanInlineMarkdown(trimmed
      .replace(/^>\s?/, "")
      .replace(/^[-+*]\s+/, "")
      .replace(/^\d+[.)]\s+/, ""));
    if (cleaned) paragraphLines.push(cleaned);
  }
  flushParagraph();

  return { normalizedText: normalizeText(paragraphs.join("\n\n")), chapters };
}

function cleanInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<https?:\/\/[^>]+>/g, "")
    .replace(/<([^>]+)>/g, "$1")
    .replace(/(`{1,3}|\*{1,3}|_{1,3}|~~)/g, "")
    .replace(/\\([\\`*{}[\]()#+.!_>-])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
