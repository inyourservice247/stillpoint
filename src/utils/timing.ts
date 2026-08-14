import type { LongWordAssistance, ReaderSettings } from "../types/Book";
import type { ReaderToken } from "../types/Token";

export type TimingSettings = Pick<ReaderSettings,
  "wpm" | "longWordAssistance" | "adaptiveTiming" | "punctuationPauses" | "sentencePause" | "commaPause"
>;

export const TIMING_DEFAULTS = {
  complexityCap: 1.65,
  compoundFactor: 1.08,
  clausePauseRatio: 0.6,
  dashPauseRatio: 0.7,
  paragraphPauseRatio: 1.35,
} as const;

const MEDIUM_LENGTH_BANDS = [
  { maximumLength: 6, multiplier: 1 },
  { maximumLength: 9, multiplier: 1.08 },
  { maximumLength: 12, multiplier: 1.18 },
  { maximumLength: 15, multiplier: 1.3 },
  { maximumLength: 19, multiplier: 1.42 },
  { maximumLength: Number.POSITIVE_INFINITY, multiplier: 1.55 },
] as const;

const PRESET_STRENGTH: Record<LongWordAssistance, number> = {
  off: 0,
  low: 0.5,
  medium: 1,
  high: 1.25,
};

export function getLengthMultiplier(length: number, assistance: LongWordAssistance): number {
  const mediumMultiplier = MEDIUM_LENGTH_BANDS.find((band) => length <= band.maximumLength)?.multiplier ?? 1.55;
  return 1 + (mediumMultiplier - 1) * PRESET_STRENGTH[assistance];
}

export function getCompoundMultiplier(isCompound: boolean, assistance: LongWordAssistance): number {
  if (!isCompound) return 1;
  return 1 + (TIMING_DEFAULTS.compoundFactor - 1) * PRESET_STRENGTH[assistance];
}

export function getTemporaryWpm(wpm: number): number {
  return Math.max(100, Math.round(wpm * 0.7));
}

export function getTokenDuration(token: ReaderToken, settings: TimingSettings): number {
  const baseDuration = 60_000 / settings.wpm;
  const assistance = settings.adaptiveTiming ? settings.longWordAssistance : "off";
  const wordFactor = Math.min(
    TIMING_DEFAULTS.complexityCap,
    getLengthMultiplier(token.length, assistance)
      * getCompoundMultiplier(token.isCompound, assistance),
  );

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
