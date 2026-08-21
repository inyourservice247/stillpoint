"use client";

import { useCallback, useEffect, useState } from "react";
import { Library } from "./components/Library";
import { Reader } from "./components/Reader";
import type { BookRecord, LibraryEntry, LoadedBook, ReaderSettings } from "./types/Book";
import { normalizeText } from "./utils/textNormalization";
import { tokenizeText } from "./utils/tokenize";
import { prepareMarkdownBook } from "./utils/markdown";
import {
  deleteBook,
  getBook,
  hashFile,
  listLibrary,
  loadSettings,
  saveNewBook,
  saveSettings,
  touchBook,
} from "./utils/storage";

export default function App() {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [activeBook, setActiveBook] = useState<LoadedBook | null>(null);
  const [settings, setSettings] = useState<ReaderSettings | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshLibrary = useCallback(async () => setEntries(await listLibrary()), []);

  useEffect(() => {
    const initialize = window.setTimeout(() => {
      setSettings(loadSettings());
      void listLibrary().then(setEntries).catch(() => setError("This browser could not open the local library."));
    }, 0);
    return () => window.clearTimeout(initialize);
  }, []);

  const changeSettings = (next: ReaderSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  const openStoredBook = async (id: string) => {
    setError(null);
    const book = await getBook(id);
    if (!book) {
      setError("That local file could not be found. Try opening it again.");
      await refreshLibrary();
      return;
    }
    await touchBook(id);
    setActiveBook(book);
  };

  const openFile = async (file: File) => {
    setError(null);
    const lowerName = file.name.toLowerCase();
    const markdown = lowerName.endsWith(".md") || lowerName.endsWith(".markdown");
    if (!lowerName.endsWith(".txt") && !markdown) {
      setError("Stillpoint reads .txt and .md files.");
      return;
    }

    setProcessing(true);
    try {
      const buffer = await file.arrayBuffer();
      const identityBuffer = markdown ? await new Blob([buffer, "\n:stillpoint-markdown-v1"]).arrayBuffer() : buffer;
      const id = await hashFile(identityBuffer);
      const existing = await getBook(id);
      if (existing) {
        await touchBook(id);
        setActiveBook(existing);
        return;
      }

      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const decoded = decodeText(buffer);
      const prepared = markdown ? prepareMarkdownBook(decoded) : { normalizedText: normalizeText(decoded), chapters: [] };
      const normalizedText = prepared.normalizedText;
      if (!normalizedText) throw new Error("empty");
      const document = tokenizeText(normalizedText);
      if (!document.tokens.length) throw new Error("empty");

      const book: BookRecord = {
        id,
        filename: file.name,
        normalizedText,
        tokens: document.tokens,
        sentenceStarts: document.sentenceStarts,
        paragraphStarts: document.paragraphStarts,
        chapters: prepared.chapters.flatMap((chapter) => {
          const index = document.paragraphStarts[chapter.paragraphIndex];
          return index === undefined ? [] : [{ title: chapter.title, level: chapter.level, index }];
        }),
        totalTokens: document.tokens.length,
        createdAt: Date.now(),
      };
      setActiveBook(await saveNewBook(book));
    } catch {
      setError("That file did not contain readable text.");
    } finally {
      setProcessing(false);
    }
  };

  const removeBook = async (id: string) => {
    await deleteBook(id);
    await refreshLibrary();
  };

  if (!settings) return <main className="app-loading" aria-label="Loading Stillpoint" />;

  if (activeBook) {
    return (
      <Reader
        book={activeBook}
        settings={settings}
        onSettingsChange={changeSettings}
        onExit={() => { setActiveBook(null); void refreshLibrary(); }}
      />
    );
  }

  return (
    <Library
      entries={entries}
      processing={processing}
      error={error}
      onFile={(file) => void openFile(file)}
      onOpen={(id) => void openStoredBook(id)}
      onDelete={(id) => void removeBook(id)}
    />
  );
}

function decodeText(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const replacementCount = (utf8.match(/�/g) ?? []).length;
  if (replacementCount > Math.max(2, utf8.length * 0.002)) {
    try { return new TextDecoder("windows-1252").decode(buffer); } catch { return utf8; }
  }
  return utf8;
}
