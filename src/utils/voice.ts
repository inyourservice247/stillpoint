import type { LoadedBook, ReaderSettings } from "../types/Book";

export type SentenceChunk = {
  start: number;
  end: number;
  text: string;
  tokenOffsets: number[];
};

export function getSentenceChunk(book: Pick<LoadedBook, "tokens" | "sentenceStarts">, tokenIndex: number): SentenceChunk {
  const starts = book.sentenceStarts.length ? book.sentenceStarts : [0];
  let sentenceStart = 0;
  for (const candidate of starts) {
    if (candidate > tokenIndex) break;
    sentenceStart = candidate;
  }
  const start = Math.max(sentenceStart, Math.min(tokenIndex, book.tokens.length - 1));
  const nextStart = starts.find((candidate) => candidate > sentenceStart);
  const end = Math.min(book.tokens.length - 1, (nextStart ?? book.tokens.length) - 1);
  const sentenceTokens = book.tokens.slice(start, end + 1);
  const tokenOffsets: number[] = [];
  let text = "";
  for (const token of sentenceTokens) {
    if (text) text += " ";
    tokenOffsets.push(text.length);
    text += token.text;
  }
  return { start, end, text, tokenOffsets };
}

export function tokenIndexForBoundary(chunk: SentenceChunk, charIndex: number): number {
  let relativeIndex = 0;
  for (let index = 0; index < chunk.tokenOffsets.length; index += 1) {
    if (chunk.tokenOffsets[index] > charIndex) break;
    relativeIndex = index;
  }
  return Math.min(chunk.end, chunk.start + relativeIndex);
}

export function estimatedSpeechDuration(tokenCount: number, rate: number): number {
  return Math.max(250, tokenCount * (60_000 / (180 * rate)));
}

export function normalizeVoiceRate(rate: number): number {
  return Math.max(0.6, Math.min(2, Math.round(rate * 10) / 10));
}

export function isSpokenMode(settings: ReaderSettings): boolean {
  return settings.readingMode !== "silent";
}
