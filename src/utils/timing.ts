import type { ReaderSettings } from "../types/Book";
import type { ReaderToken } from "../types/Token";

export const TIMING_DEFAULTS = {
  longWordFactor: 1.12,
  veryLongWordFactor: 1.25,
  compoundFactor: 1.22,
  clausePauseRatio: 0.6,
  dashPauseRatio: 0.7,
  paragraphPauseRatio: 1.35,
} as const;

export function getTokenDuration(token: ReaderToken, settings: ReaderSettings): number {
  const baseDuration = 60_000 / settings.wpm;
  let wordFactor = 1;

  if (settings.adaptiveTiming) {
    const lengthFactor = token.length >= 14
      ? TIMING_DEFAULTS.veryLongWordFactor
      : token.length >= 9
        ? TIMING_DEFAULTS.longWordFactor
        : 1;
    wordFactor = Math.max(lengthFactor, token.isCompound ? TIMING_DEFAULTS.compoundFactor : 1);
  }

  let pause = 0;
  if (settings.punctuationPauses) {
    if (token.paragraphEnd) {
      pause = settings.sentencePause * TIMING_DEFAULTS.paragraphPauseRatio;
    } else if (token.pauseKind === "sentence") {
      pause = settings.sentencePause;
    } else if (token.pauseKind === "clause") {
      pause = Math.max(settings.commaPause, settings.sentencePause * TIMING_DEFAULTS.clausePauseRatio);
    } else if (token.pauseKind === "dash") {
      pause = Math.max(settings.commaPause, settings.sentencePause * TIMING_DEFAULTS.dashPauseRatio);
    } else if (token.pauseKind === "comma") {
      pause = settings.commaPause;
    }
  }

  return Math.round(baseDuration * wordFactor + pause);
}

export function findSentenceStart(sentenceStarts: number[], currentIndex: number): number {
  if (!sentenceStarts.length) return 0;
  const exactPosition = sentenceStarts.indexOf(currentIndex);
  if (exactPosition > 0) return sentenceStarts[exactPosition - 1];
  if (exactPosition === 0) return 0;

  for (let index = sentenceStarts.length - 1; index >= 0; index -= 1) {
    if (sentenceStarts[index] < currentIndex) return sentenceStarts[index];
  }
  return 0;
}
