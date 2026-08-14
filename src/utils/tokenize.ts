import type { PauseKind, ReaderToken, TokenizedDocument } from "../types/Token";
import { getOrpIndex } from "./orp";

const ATOM = String.raw`[\p{L}\p{M}\p{N}]`;
const NUMBER = String.raw`(?:\p{Sc})?[+\-\u2212]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?(?![\p{L}\p{M}])`;
const WORD = String.raw`${ATOM}+(?:['’]${ATOM}+)*(?:[-\u2010\u2011]${ATOM}+(?:['’]${ATOM}+)*)*`;
const CORE_RE = new RegExp(`${NUMBER}|${WORD}`, "gu");
const OPENING_ONLY = /^[\s[({“‘]+$/u;
const STRAIGHT_QUOTE_ONLY = /^[\s"']+$/u;

type DraftToken = {
  core: string;
  leading: string;
  trailing: string;
  paragraphIndex: number;
};

export function tokenizeText(normalizedText: string): TokenizedDocument {
  if (!normalizedText.trim()) return { tokens: [], sentenceStarts: [], paragraphStarts: [] };

  const drafts: DraftToken[] = [];
  const paragraphStarts: number[] = [];
  const paragraphs = normalizedText.split("\n\n");

  paragraphs.forEach((paragraph, paragraphIndex) => {
    paragraphStarts.push(drafts.length);
    const paragraphDrafts: DraftToken[] = [];
    let cursor = 0;
    let pendingLeading = "";
    CORE_RE.lastIndex = 0;

    for (const match of paragraph.matchAll(CORE_RE)) {
      const start = match.index ?? 0;
      const gap = paragraph.slice(cursor, start);
      pendingLeading = foldGap(gap, paragraphDrafts, pendingLeading);
      paragraphDrafts.push({
        core: match[0],
        leading: pendingLeading,
        trailing: "",
        paragraphIndex,
      });
      pendingLeading = "";
      cursor = start + match[0].length;
    }

    const finalGap = paragraph.slice(cursor);
    pendingLeading = foldGap(finalGap, paragraphDrafts, pendingLeading);
    if (pendingLeading && paragraphDrafts.length) {
      paragraphDrafts[paragraphDrafts.length - 1].trailing += compactPunctuation(pendingLeading);
    }
    drafts.push(...paragraphDrafts);
  });

  const tokens: ReaderToken[] = drafts.map((draft, index) => {
    const text = `${draft.leading}${draft.core}${draft.trailing}`;
    const punctuation = punctuationFor(text);
    const sentenceEnd = /[.!?…]/u.test(punctuation);
    const paragraphEnd = index === drafts.length - 1 || drafts[index + 1].paragraphIndex !== draft.paragraphIndex;
    return {
      text,
      cleanText: draft.core,
      leading: draft.leading,
      trailing: draft.trailing,
      punctuation,
      sentenceEnd: sentenceEnd || paragraphEnd,
      sentenceStart: false,
      paragraphEnd,
      isCompound: /[\p{L}\p{M}\p{N}][-\u2010\u2011][\p{L}\p{M}\p{N}]/u.test(draft.core),
      length: Array.from(draft.core).filter((character) => /[\p{L}\p{M}\p{N}]/u.test(character)).length,
      pauseKind: pauseKindFor(punctuation),
      sentenceIndex: 0,
      paragraphIndex: draft.paragraphIndex,
      orpIndex: getOrpIndex(text),
    };
  });

  const sentenceStarts: number[] = [];
  let sentenceIndex = -1;
  tokens.forEach((token, index) => {
    if (index === 0 || tokens[index - 1].sentenceEnd || tokens[index - 1].paragraphEnd) {
      sentenceIndex += 1;
      sentenceStarts.push(index);
      token.sentenceStart = true;
    }
    token.sentenceIndex = sentenceIndex;
  });

  return { tokens, sentenceStarts, paragraphStarts };
}

function foldGap(gap: string, previous: DraftToken[], pendingLeading: string): string {
  const punctuation = compactPunctuation(gap);
  if (!punctuation) return pendingLeading;

  if (!previous.length) return `${pendingLeading}${punctuation}`;

  const last = previous[previous.length - 1];
  const sentenceThenOpening = punctuation.match(/^([.!?…]+[”’')\]}]*)(["'“‘([{]+)$/u);
  if (sentenceThenOpening) {
    last.trailing += sentenceThenOpening[1];
    return `${pendingLeading}${sentenceThenOpening[2]}`;
  }
  const lastEndsSentence = /[.!?…][”’"')\]}]*$/u.test(`${last.core}${last.trailing}`);
  if (OPENING_ONLY.test(punctuation) || (STRAIGHT_QUOTE_ONLY.test(punctuation) && lastEndsSentence)) {
    return `${pendingLeading}${punctuation}`;
  }

  last.trailing += punctuation;
  return pendingLeading;
}

function compactPunctuation(value: string): string {
  return value.replace(/\s+/g, "").replace(/[^\p{P}\p{S}]/gu, "");
}

function punctuationFor(text: string): string {
  const characters = [...text];
  const lastMeaningful = characters.map((character, index) => ({ character, index }))
    .filter(({ character }) => /[\p{L}\p{M}\p{N}%]/u.test(character))
    .at(-1)?.index ?? -1;
  return characters.slice(lastMeaningful + 1).join("").replace(/%/g, "");
}

function pauseKindFor(punctuation: string): PauseKind {
  if (/[.!?…]/u.test(punctuation)) return "sentence";
  if (/[;:]/u.test(punctuation)) return "clause";
  if (/[—–]/u.test(punctuation) || /(^|[^\p{L}\p{N}])-(?![\p{L}\p{N}])/u.test(punctuation)) return "dash";
  if (/[,]/u.test(punctuation)) return "comma";
  return "none";
}
