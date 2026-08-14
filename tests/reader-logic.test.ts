import assert from "node:assert/strict";
import test from "node:test";
import type { ReaderSettings } from "../src/types/Book";
import { getOrpIndex, splitAtOrp } from "../src/utils/orp";
import { normalizeText } from "../src/utils/textNormalization";
import { findSentenceStart, getLengthMultiplier, getTokenDuration } from "../src/utils/timing";
import { tokenizeText } from "../src/utils/tokenize";

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
  longWordAssistance: "medium",
  punctuationPauses: true,
  sentencePause: 260,
  commaPause: 90,
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

test("sentence rewind uses precomputed sentence starts", () => {
  const document = tokenizeText("First sentence. Second sentence! Third sentence?");
  assert.deepEqual(document.sentenceStarts, [0, 2, 4]);
  assert.equal(findSentenceStart(document.sentenceStarts, 5), 4);
  assert.equal(findSentenceStart(document.sentenceStarts, 4), 2);
});
