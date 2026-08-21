import type { BookRecord, LibraryEntry, LoadedBook, ReaderSettings } from "../types/Book";
import { inferProfile, PROFILE_PRESETS } from "./appearance";

const DB_NAME = "stillpoint-reader";
const DB_VERSION = 3;
const BOOKS_STORE = "books";
const LIBRARY_STORE = "library";
const VOICE_AUDIO_STORE = "voice-audio";
const SETTINGS_KEY = "stillpoint:settings:v1";
const CHECKPOINT_PREFIX = "stillpoint:checkpoint:";

export const DEFAULT_SETTINGS: ReaderSettings = {
  wpm: 420,
  ...PROFILE_PRESETS.focus,
  profile: "focus",
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

export async function listLibrary(): Promise<LibraryEntry[]> {
  const database = await openDatabase();
  const entries = await requestAsPromise<LibraryEntry[]>(database.transaction(LIBRARY_STORE, "readonly").objectStore(LIBRARY_STORE).getAll());
  return entries.sort((first, second) => second.lastOpened - first.lastOpened);
}

export async function saveNewBook(book: BookRecord): Promise<LoadedBook> {
  const existing = await getBook(book.id);
  if (existing) return existing;

  const now = Date.now();
  const entry: LibraryEntry = {
    id: book.id,
    filename: book.filename,
    totalTokens: book.totalTokens,
    currentIndex: 0,
    percentage: 0,
    lastOpened: now,
    progressUpdatedAt: now,
    createdAt: book.createdAt,
  };
  const database = await openDatabase();
  const transaction = database.transaction([BOOKS_STORE, LIBRARY_STORE], "readwrite");
  transaction.objectStore(BOOKS_STORE).put(book);
  transaction.objectStore(LIBRARY_STORE).put(entry);
  await transactionDone(transaction);
  return { ...book, ...entry };
}

export async function getBook(id: string): Promise<LoadedBook | null> {
  const database = await openDatabase();
  const transaction = database.transaction([BOOKS_STORE, LIBRARY_STORE], "readonly");
  const [book, entry] = await Promise.all([
    requestAsPromise<BookRecord | undefined>(transaction.objectStore(BOOKS_STORE).get(id)),
    requestAsPromise<LibraryEntry | undefined>(transaction.objectStore(LIBRARY_STORE).get(id)),
  ]);
  if (!book || !entry) return null;

  const checkpoint = readCheckpoint(id);
  const currentIndex = checkpoint && checkpoint.savedAt > entry.progressUpdatedAt
    ? clampIndex(checkpoint.currentIndex, entry.totalTokens)
    : entry.currentIndex;
  return { ...book, chapters: book.chapters ?? [], ...entry, currentIndex, percentage: percentageFor(currentIndex, entry.totalTokens) };
}

export async function updateBookProgress(id: string, currentIndex: number): Promise<LibraryEntry | null> {
  const database = await openDatabase();
  const transaction = database.transaction(LIBRARY_STORE, "readwrite");
  const store = transaction.objectStore(LIBRARY_STORE);
  const entry = await requestAsPromise<LibraryEntry | undefined>(store.get(id));
  if (!entry) return null;
  const now = Date.now();
  const next = {
    ...entry,
    currentIndex: clampIndex(currentIndex, entry.totalTokens),
    percentage: percentageFor(currentIndex, entry.totalTokens),
    lastOpened: now,
    progressUpdatedAt: now,
  };
  store.put(next);
  await transactionDone(transaction);
  writeCheckpoint(id, next.currentIndex, now);
  return next;
}

export async function touchBook(id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(LIBRARY_STORE, "readwrite");
  const store = transaction.objectStore(LIBRARY_STORE);
  const entry = await requestAsPromise<LibraryEntry | undefined>(store.get(id));
  if (entry) store.put({ ...entry, lastOpened: Date.now() });
  await transactionDone(transaction);
}

export async function deleteBook(id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction([BOOKS_STORE, LIBRARY_STORE, VOICE_AUDIO_STORE], "readwrite");
  transaction.objectStore(BOOKS_STORE).delete(id);
  transaction.objectStore(LIBRARY_STORE).delete(id);
  const voiceStore = transaction.objectStore(VOICE_AUDIO_STORE);
  const voiceIndex = voiceStore.index("bookId");
  for (const key of await requestAsPromise<IDBValidKey[]>(voiceIndex.getAllKeys(id))) voiceStore.delete(key);
  await transactionDone(transaction);
  localStorage.removeItem(`${CHECKPOINT_PREFIX}${id}`);
}

export type CachedVoiceAudio = {
  id: string;
  bookId: string;
  voice: string;
  start: number;
  end: number;
  sampleRate: number;
  samples: ArrayBuffer;
  encoding?: "float32" | "pcm-s16";
  createdAt: number;
};

export async function getCachedVoiceAudio(id: string): Promise<CachedVoiceAudio | null> {
  const database = await openDatabase();
  const record = await requestAsPromise<CachedVoiceAudio | undefined>(database.transaction(VOICE_AUDIO_STORE, "readonly").objectStore(VOICE_AUDIO_STORE).get(id));
  return record ?? null;
}

export async function saveCachedVoiceAudio(record: CachedVoiceAudio): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(VOICE_AUDIO_STORE, "readwrite");
  transaction.objectStore(VOICE_AUDIO_STORE).put(record);
  await transactionDone(transaction);
}

export async function listCachedVoiceAudioKeys(bookId: string, voice: string): Promise<string[]> {
  const database = await openDatabase();
  const store = database.transaction(VOICE_AUDIO_STORE, "readonly").objectStore(VOICE_AUDIO_STORE);
  const keys = await requestAsPromise<IDBValidKey[]>(store.index("bookVoice").getAllKeys(IDBKeyRange.only([bookId, voice])));
  return keys.map(String);
}

export async function deleteCachedVoiceAudio(bookId: string, voice: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(VOICE_AUDIO_STORE, "readwrite");
  const store = transaction.objectStore(VOICE_AUDIO_STORE);
  const keys = await requestAsPromise<IDBValidKey[]>(store.index("bookVoice").getAllKeys(IDBKeyRange.only([bookId, voice])));
  for (const key of keys) store.delete(key);
  await transactionDone(transaction);
}

export function loadSettings(): ReaderSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<ReaderSettings>;
    const migratedAssistance = parsed.longWordAssistance
      ?? (parsed.adaptiveTiming === false ? "off" : DEFAULT_SETTINGS.longWordAssistance);
    const merged = { ...DEFAULT_SETTINGS, ...parsed, longWordAssistance: migratedAssistance };
    const profile = parsed.profile === "custom" ? "custom" : inferProfile(merged);
    return { ...merged, profile };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ReaderSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function writeCheckpoint(id: string, currentIndex: number, savedAt = Date.now()): void {
  localStorage.setItem(`${CHECKPOINT_PREFIX}${id}`, JSON.stringify({ currentIndex, savedAt }));
}

export async function hashFile(buffer: ArrayBuffer): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  let hash = 2166136261;
  for (const byte of new Uint8Array(buffer)) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return `fnv-${(hash >>> 0).toString(16)}`;
}

function readCheckpoint(id: string): { currentIndex: number; savedAt: number } | null {
  try {
    return JSON.parse(localStorage.getItem(`${CHECKPOINT_PREFIX}${id}`) ?? "null");
  } catch {
    return null;
  }
}

function percentageFor(currentIndex: number, totalTokens: number): number {
  if (totalTokens <= 0 || currentIndex <= 0) return 0;
  return (Math.min(clampIndex(currentIndex, totalTokens) + 1, totalTokens) / totalTokens) * 100;
}

function clampIndex(currentIndex: number, totalTokens: number): number {
  return Math.max(0, Math.min(Math.round(currentIndex), Math.max(0, totalTokens - 1)));
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(BOOKS_STORE)) database.createObjectStore(BOOKS_STORE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(LIBRARY_STORE)) {
        const store = database.createObjectStore(LIBRARY_STORE, { keyPath: "id" });
        store.createIndex("lastOpened", "lastOpened");
      }
      if (!database.objectStoreNames.contains(VOICE_AUDIO_STORE)) {
        const store = database.createObjectStore(VOICE_AUDIO_STORE, { keyPath: "id" });
        store.createIndex("bookId", "bookId");
        store.createIndex("bookVoice", ["bookId", "voice"]);
      } else {
        const store = request.transaction?.objectStore(VOICE_AUDIO_STORE);
        if (store && !store.indexNames.contains("bookVoice")) store.createIndex("bookVoice", ["bookId", "voice"]);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
