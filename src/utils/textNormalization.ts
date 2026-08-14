export function normalizeText(input: string): string {
  const cleaned = input
    .replace(/^\uFEFF/, "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00A0\u2007\u202F\t\f\v]/g, " ")
    .replace(/[ ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();

  if (!cleaned) return "";

  return cleaned
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.split("\n").map((line) => line.trim()).filter(Boolean).join(" "))
    .filter(Boolean)
    .join("\n\n");
}
