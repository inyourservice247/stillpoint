export type PauseKind = "none" | "comma" | "clause" | "dash" | "sentence";

export type ReaderToken = {
  text: string;
  cleanText: string;
  leading: string;
  trailing: string;
  punctuation: string;
  sentenceEnd: boolean;
  sentenceStart: boolean;
  paragraphEnd: boolean;
  isCompound: boolean;
  length: number;
  pauseKind: PauseKind;
  sentenceIndex: number;
  paragraphIndex: number;
  orpIndex: number;
};

export type TokenizedDocument = {
  tokens: ReaderToken[];
  sentenceStarts: number[];
  paragraphStarts: number[];
};
