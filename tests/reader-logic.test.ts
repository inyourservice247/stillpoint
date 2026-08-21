import assert from "node:assert/strict";
import test from "node:test";
import type { ReaderSettings } from "../src/types/Book";
import { getOrpIndex, splitAtOrp } from "../src/utils/orp";
import { getOrpFit } from "../src/utils/orp";
import { normalizeText } from "../src/utils/textNormalization";
import { applyProfile, inferProfile, updateAppearance } from "../src/utils/appearance";
import { findSentenceStart, getLengthMultiplier, getTemporaryWpm, getTokenDuration } from "../src/utils/timing";
import { tokenizeText } from "../src/utils/tokenize";
import { prepareMarkdownBook } from "../src/utils/markdown";
import { estimateKokoroStorageBytes, estimatedSpeechDuration, getKokoroPreparationRange, getKokoroPassageChunk, getLinearSpeechIndex, getSentenceChunk, normalizeVoiceRate, tokenIndexForBoundary } from "../src/utils/voice";

const SAMPLE = `The organisation — however — continued operating.

"Hello," she said. "Don't over-think it."

Self-regulation and long-term decision-making improve well-being.

The pipe-squeak sounded strange.

The amount was ₹5,000.50, representing 28.5% of the total.

COVID-19 affected B2B supply-chains worldwide.

This is one sentence.

This is another sentence!

Is this the third sentence?

New paragraph begins here.`;

const SETTINGS: ReaderSettings = {
  wpm: 420,
  fontSize: 76,
  fontFamily: "sans",
  fontWeight: 600,
  profile: "focus",
  theme: "dark",
  textContrast: "crisp",
  orpIntensity: "normal",
  focusGuides: "minimal",
  longWordAssistance: "medium",
  adaptiveTiming: true,
  punctuationPauses: true,
  sentencePause: 260,
  commaPause: 90,
  readingMode: "silent",
  voiceRate: 1,
  deviceVoice: "",
  kokoroVoice: "af_heart",
};

test("normalizes messy TXT text without flattening paragraphs", () => {
  assert.equal(
    normalizeText("\uFEFFAlpha\t beta\r\nwrapped\u00a0line\r\n\r\n\r\nSecond paragraph"),
    "Alpha beta wrapped line\n\nSecond paragraph",
  );
});

test("acceptance sample produces semantic frames without punctuation-only tokens", () => {
  const document = tokenizeText(normalizeText(SAMPLE));
  assert.equal(document.tokens.length, 52);
  assert.ok(document.tokens.every((token) => /[\p{L}\p{M}\p{N}]/u.test(token.cleanText)));

  const cores = document.tokens.map((token) => token.cleanText);
  for (const expected of [
    "organisation", "Hello", "Don't", "over-think", "Self-regulation", "long-term",
    "decision-making", "well-being", "pipe-squeak", "₹5,000.50", "28.5%", "COVID-19",
    "B2B", "supply-chains",
  ]) {
    assert.equal(cores.filter((core) => core === expected).length, 1, `${expected} should be one frame`);
  }
  assert.equal(cores.includes("—"), false);
  assert.equal(cores.includes('"'), false);
  assert.equal(document.tokens[1].pauseKind, "dash");
  assert.equal(document.tokens[2].pauseKind, "dash");
  assert.equal(document.tokens.find((token) => token.cleanText === "Hello")?.pauseKind, "comma");
  assert.equal(document.tokens.find((token) => token.cleanText === "₹5,000.50")?.pauseKind, "comma");
  assert.match(document.tokens.find((token) => token.cleanText === "Don't")?.text ?? "", /^"Don't/);
  assert.deepEqual(document.tokens.map((token, index) => token.paragraphEnd ? index : -1).filter((index) => index >= 0), [4, 10, 16, 20, 29, 34, 38, 42, 47, 51]);
});

test("ORP ignores wrapper punctuation and currency", () => {
  const plain = splitAtOrp("Hello");
  const quoted = splitAtOrp('“Hello,”');
  assert.equal(plain.focal, quoted.focal);
  assert.equal(splitAtOrp("₹5,000.50,").focal, "0");
  assert.equal(getOrpIndex("A"), 0);
});

test("long-word assistance and punctuation timing switches are independent", () => {
  const token = tokenizeText("self-regulation, continues").tokens[0];
  const base = 60_000 / SETTINGS.wpm;
  assert.ok(getTokenDuration(token, SETTINGS) > base + SETTINGS.commaPause);
  assert.equal(getTokenDuration(token, { ...SETTINGS, longWordAssistance: "off" }), Math.round(base + SETTINGS.commaPause));
  assert.equal(getTokenDuration(token, { ...SETTINGS, punctuationPauses: false }), Math.round(base * 1.3 * 1.08));
  assert.equal(getTokenDuration(token, { ...SETTINGS, adaptiveTiming: false }), Math.round(base + SETTINGS.commaPause));
});

test("profiles coordinate appearance and manual changes become custom", () => {
  const paper = applyProfile(SETTINGS, "paper");
  assert.equal(paper.theme, "sepia");
  assert.equal(paper.fontFamily, "serif");
  assert.equal(inferProfile(paper), "paper");
  assert.equal(updateAppearance(paper, "fontWeight", 700).profile, "custom");
});

test("medium length bands, compound boost and cap match the requested rhythm", () => {
  assert.equal(getLengthMultiplier(3, "medium"), 1);
  assert.equal(getLengthMultiplier(8, "medium"), 1.08);
  assert.equal(getLengthMultiplier(10, "medium"), 1.18);
  assert.equal(getLengthMultiplier(14, "medium"), 1.3);
  assert.equal(getLengthMultiplier(17, "medium"), 1.42);
  assert.equal(getLengthMultiplier(25, "medium"), 1.55);

  const extremeCompound = tokenizeText("electroencephalographically-compound").tokens[0];
  const base = 60_000 / SETTINGS.wpm;
  assert.equal(getTokenDuration(extremeCompound, { ...SETTINGS, punctuationPauses: false }), Math.round(base * 1.65));
});

test("sample durations remain proportionate at 300, 500 and 700 WPM", () => {
  const words = tokenizeText("the management interconnected extraordinary self-regulation decision-making electroencephalographically").tokens;
  for (const wpm of [300, 500, 700]) {
    const durations = words.map((token) => getTokenDuration(token, { ...SETTINGS, wpm, punctuationPauses: false }));
    assert.equal(durations[0], Math.round(60_000 / wpm));
    assert.ok(durations.every((duration, index) => index === 0 || duration >= durations[0]));
    assert.ok(Math.max(...durations) <= Math.round((60_000 / wpm) * 1.65));
  }
});

test("temporary slowdown is exact and leaves the saved WPM value untouched", () => {
  const savedWpm = 600;
  assert.equal(getTemporaryWpm(savedWpm), 420);
  assert.equal(savedWpm, 600);
  assert.equal(getTemporaryWpm(100), 100);
});

test("sentence rewind uses precomputed sentence starts", () => {
  const document = tokenizeText("First sentence. Second sentence! Third sentence?");
  assert.deepEqual(document.sentenceStarts, [0, 2, 4]);
  assert.equal(findSentenceStart(document.sentenceStarts, 5), 4);
  assert.equal(findSentenceStart(document.sentenceStarts, 4), 2);
});

test("voice chunks preserve sentence token mapping and punctuation", () => {
  const document = tokenizeText("Hello, decision-making world. Another sentence follows!");
  const book = { tokens: document.tokens, sentenceStarts: document.sentenceStarts };
  const first = getSentenceChunk(book as never, 1);
  assert.equal(first.start, 1);
  assert.equal(first.end, 2);
  assert.equal(first.text, "decision-making world.");
  assert.equal(tokenIndexForBoundary(first, first.tokenOffsets[1]), 2);
  const second = getSentenceChunk(book as never, 4);
  assert.equal(second.start, 4);
  assert.equal(second.end, 5);
});

test("voice fallback timing scales smoothly and clamps speed", () => {
  const tokens = tokenizeText("the extraordinary self-regulation.").tokens;
  const normal = estimatedSpeechDuration(tokens.length, 1);
  assert.ok(estimatedSpeechDuration(tokens.length, 2) < normal);
  assert.equal(normalizeVoiceRate(0.1), 0.6);
  assert.equal(normalizeVoiceRate(1.26), 1.3);
  assert.equal(normalizeVoiceRate(3), 2);
});

test("mobile ORP fitting keeps the selected font size constant", () => {
  const requestedSize = 72;
  const shortWord = getOrpFit("the", requestedSize, 390);
  const longWord = getOrpFit("electroencephalographically", requestedSize, 390);

  assert.equal(shortWord.fontSize, requestedSize);
  assert.equal(longWord.fontSize, requestedSize);
  assert.equal(shortWord.sideScale, 1);
  assert.ok(longWord.sideScale < 1);
});

test("device voice fallback advances continuously without browser boundaries", () => {
  assert.equal(getLinearSpeechIndex(10, 14, 0, 1_000), 10);
  assert.equal(getLinearSpeechIndex(10, 14, 400, 1_000), 12);
  assert.equal(getLinearSpeechIndex(10, 14, 1_000, 1_000), 14);
});

test("Kokoro passages rewind to a sentence start and batch following sentences", () => {
  const document = tokenizeText("First sentence has words. Second sentence has words. Third sentence has words.");
  const passage = getKokoroPassageChunk({ tokens: document.tokens, sentenceStarts: document.sentenceStarts } as never, 5, 6);
  assert.equal(passage.start, 4);
  assert.equal(passage.end, 11);
  assert.match(passage.text, /^Second sentence/);
});

test("Kokoro preparation ranges are bounded and storage estimates use compact PCM", () => {
  assert.deepEqual(getKokoroPreparationRange(10_000, 100, "ten-minutes"), { start: 100, end: 1_749 });
  assert.deepEqual(getKokoroPreparationRange(10_000, 100, "thirty-minutes"), { start: 100, end: 5_049 });
  assert.deepEqual(getKokoroPreparationRange(10_000, 8_000, "book"), { start: 0, end: 9_999 });
  assert.equal(estimateKokoroStorageBytes(165), 2_880_000);
});

test("Markdown headings become clean chapter jump points", () => {
  const prepared = prepareMarkdownBook("# First Chapter\n\nWords with **emphasis**.\n\n## Next Part\n\n[Linked words](https://example.com) remain readable.");
  const document = tokenizeText(prepared.normalizedText);
  const chapters = prepared.chapters.map((chapter) => ({
    title: chapter.title,
    level: chapter.level,
    index: document.paragraphStarts[chapter.paragraphIndex],
  }));
  assert.equal(prepared.normalizedText, "First Chapter\n\nWords with emphasis.\n\nNext Part\n\nLinked words remain readable.");
  assert.deepEqual(chapters, [
    { title: "First Chapter", level: 1, index: 0 },
    { title: "Next Part", level: 2, index: 5 },
  ]);
});
