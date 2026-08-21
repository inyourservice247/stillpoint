import type { LoadedBook, ReaderSettings } from "../types/Book";

export type SentenceChunk = {
  start: number;
  end: number;
  text: string;
  tokenOffsets: number[];
};

export type KokoroPreparationScope = "ten-minutes" | "thirty-minutes" | "book";

const KOKORO_WORDS_PER_MINUTE = 165;
const KOKORO_SAMPLE_RATE = 24_000;

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

export function getKokoroPassageChunk(book: Pick<LoadedBook, "tokens" | "sentenceStarts">, tokenIndex: number, targetTokens = 55): SentenceChunk {
  const starts = book.sentenceStarts.length ? book.sentenceStarts : [0];
  let start = 0;
  for (const candidate of starts) {
    if (candidate > tokenIndex) break;
    start = candidate;
  }
  let end = book.tokens.length - 1;
  for (const candidate of starts) {
    if (candidate <= start) continue;
    if (candidate - start > targetTokens) {
      end = candidate - 1;
      break;
    }
  }
  const passageTokens = book.tokens.slice(start, end + 1);
  const tokenOffsets: number[] = [];
  let text = "";
  for (const token of passageTokens) {
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
  return Math.max(250, tokenCount * (60_000 / (KOKORO_WORDS_PER_MINUTE * rate)));
}

export function getKokoroPreparationRange(totalTokens: number, currentIndex: number, scope: KokoroPreparationScope): { start: number; end: number } {
  const lastIndex = Math.max(0, totalTokens - 1);
  if (scope === "book") return { start: 0, end: lastIndex };
  const start = Math.max(0, Math.min(Math.round(currentIndex), lastIndex));
  const minutes = scope === "ten-minutes" ? 10 : 30;
  return { start, end: Math.min(lastIndex, start + (minutes * KOKORO_WORDS_PER_MINUTE) - 1) };
}

export function estimateKokoroStorageBytes(tokenCount: number): number {
  const seconds = Math.max(0, tokenCount) * (60 / KOKORO_WORDS_PER_MINUTE);
  return Math.ceil(seconds * KOKORO_SAMPLE_RATE * 2);
}

export function getLinearSpeechIndex(start: number, end: number, elapsed: number, duration: number): number {
  const tokenCount = end - start + 1;
  const progress = duration <= 0 ? 1 : Math.max(0, Math.min(1, elapsed / duration));
  return start + Math.min(tokenCount - 1, Math.floor(progress * tokenCount));
}

export function normalizeVoiceRate(rate: number): number {
  return Math.max(0.6, Math.min(2, Math.round(rate * 10) / 10));
}

export function isSpokenMode(settings: ReaderSettings): boolean {
  return settings.readingMode !== "silent";
}
