const LETTER_OR_NUMBER = /[\p{L}\p{M}\p{N}]/u;

export type OrpParts = {
  left: string;
  focal: string;
  right: string;
  index: number;
};

export function getOrpOrdinal(length: number): number {
  if (length <= 1) return 0;
  if (length <= 5) return 1;
  if (length <= 9) return 2;
  if (length <= 13) return 3;
  return 4;
}

export function getOrpIndex(text: string): number {
  const graphemes = splitGraphemes(text);
  const candidates = graphemes
    .map((grapheme, index) => ({ grapheme, index }))
    .filter(({ grapheme }) => LETTER_OR_NUMBER.test(grapheme));

  if (!candidates.length) return Math.max(0, Math.floor((graphemes.length - 1) / 2));
  return candidates[Math.min(getOrpOrdinal(candidates.length), candidates.length - 1)].index;
}

export function splitAtOrp(text: string, forcedIndex?: number): OrpParts {
  const graphemes = splitGraphemes(text);
  const index = Math.min(Math.max(forcedIndex ?? getOrpIndex(text), 0), Math.max(0, graphemes.length - 1));
  return {
    left: graphemes.slice(0, index).join(""),
    focal: graphemes[index] ?? "",
    right: graphemes.slice(index + 1).join(""),
    index,
  };
}

export function splitGraphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), ({ segment }) => segment);
  }
  return Array.from(text);
}
