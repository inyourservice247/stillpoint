import type { LoadedBook, ReaderSettings } from "../types/Book";
import type { ReaderToken } from "../types/Token";

export type SentenceChunk = {
  start: number;
  end: number;
  text: string;
  tokenOffsets: number[];
};

export function getSentenceChunk(book: Pick<LoadedBook, "tokens" | "sentenceStarts">, tokenIndex: number): SentenceChunk {
  const starts = book.sentenceStarts.length ? book.sentenceStarts : [0];
  let start = 0;
  for (const candidate of starts) {
    if (candidate > tokenIndex) break;
    start = candidate;
  }
  const nextStart = starts.find((candidate) => candidate > start);
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

export function getSpeechWeights(tokens: ReaderToken[]): number[] {
  return tokens.map((token) => {
    const lengthWeight = 1 + Math.min(0.5, Math.max(0, token.length - 6) * 0.035);
    const punctuationWeight = token.sentenceEnd ? 1.6 : token.pauseKind === "comma" ? 1.25 : token.pauseKind === "none" ? 1 : 1.35;
    return lengthWeight * punctuationWeight;
  });
}

export function estimatedSpeechDuration(tokens: ReaderToken[], rate: number, engine: "device" | "kokoro"): number {
  const wordsPerMinute = (engine === "kokoro" ? 165 : 180) * rate;
  const weights = getSpeechWeights(tokens);
  return Math.max(250, weights.reduce((sum, weight) => sum + weight, 0) * (60_000 / wordsPerMinute));
}

export function normalizeVoiceRate(rate: number): number {
  return Math.max(0.6, Math.min(2, Math.round(rate * 10) / 10));
}

export function isSpokenMode(settings: ReaderSettings): boolean {
  return settings.readingMode !== "silent";
}
