import type { ReaderToken } from "./Token";

export type ReaderFont = "sans" | "serif" | "mono";
export type LongWordAssistance = "off" | "low" | "medium" | "high";

export type ReaderSettings = {
  wpm: number;
  fontSize: number;
  fontFamily: ReaderFont;
  longWordAssistance: LongWordAssistance;
  punctuationPauses: boolean;
  sentencePause: number;
  commaPause: number;
};

export type BookRecord = {
  id: string;
  filename: string;
  normalizedText: string;
  tokens: ReaderToken[];
  sentenceStarts: number[];
  paragraphStarts: number[];
  totalTokens: number;
  createdAt: number;
};

export type LibraryEntry = {
  id: string;
  filename: string;
  totalTokens: number;
  currentIndex: number;
  percentage: number;
  lastOpened: number;
  progressUpdatedAt: number;
  createdAt: number;
};

export type LoadedBook = BookRecord & LibraryEntry;
