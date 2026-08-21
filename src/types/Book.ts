import type { ReaderToken } from "./Token";

export type ReaderFont = "sans" | "serif" | "mono";
export type LongWordAssistance = "off" | "low" | "medium" | "high";
export type ReaderProfile = "focus" | "night" | "paper" | "custom";
export type ReaderTheme = "dark" | "sepia" | "light";
export type ReaderWeight = 400 | 500 | 600 | 700;
export type ReaderContrast = "soft" | "balanced" | "crisp";
export type OrpIntensity = "subtle" | "normal" | "strong";
export type FocusGuides = "off" | "minimal" | "strong";
export type ReadingMode = "silent" | "device" | "kokoro";

export type BookChapter = {
  title: string;
  level: number;
  index: number;
};

export type ReaderSettings = {
  wpm: number;
  fontSize: number;
  fontFamily: ReaderFont;
  fontWeight: ReaderWeight;
  profile: ReaderProfile;
  theme: ReaderTheme;
  textContrast: ReaderContrast;
  orpIntensity: OrpIntensity;
  focusGuides: FocusGuides;
  longWordAssistance: LongWordAssistance;
  adaptiveTiming: boolean;
  punctuationPauses: boolean;
  sentencePause: number;
  commaPause: number;
  readingMode: ReadingMode;
  voiceRate: number;
  deviceVoice: string;
  kokoroVoice: string;
};

export type BookRecord = {
  id: string;
  filename: string;
  normalizedText: string;
  tokens: ReaderToken[];
  sentenceStarts: number[];
  paragraphStarts: number[];
  chapters: BookChapter[];
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
