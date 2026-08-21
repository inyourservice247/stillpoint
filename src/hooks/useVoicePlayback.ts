import { useCallback, useEffect, useRef, useState } from "react";
import type { LoadedBook, ReaderSettings } from "../types/Book";
import {
  deleteCachedVoiceAudio,
  getCachedVoiceAudio,
  listCachedVoiceAudioKeys,
  saveCachedVoiceAudio,
  type CachedVoiceAudio,
} from "../utils/storage";
import {
  estimatedSpeechDuration,
  getKokoroPreparationRange,
  getKokoroPassageChunk,
  getLinearSpeechIndex,
  getSentenceChunk,
  tokenIndexForBoundary,
  type KokoroPreparationScope,
} from "../utils/voice";

type KokoroStatus = "idle" | "loading" | "restoring" | "ready" | "error";
type KokoroPlaybackStatus = "idle" | "generating" | "playing";
export type KokoroPreparationState = {
  status: "idle" | "preparing" | "complete" | "error";
  scope: KokoroPreparationScope | null;
  completed: number;
  total: number;
};

const KOKORO_ENABLED_KEY = "stillpoint:kokoro-enabled:v1";
const KOKORO_CACHED_KEY = "stillpoint:kokoro-cached:v1";

type VoicePlaybackOptions = {
  book: LoadedBook;
  settings: ReaderSettings;
  currentIndex: number;
  onIndex: (index: number) => void;
  onFinish: () => void;
};

type PendingAudio = {
  resolve: (audio: KokoroAudio) => void;
  reject: (error: Error) => void;
};

type KokoroAudio = {
  samples: Float32Array;
  sampleRate: number;
  generationMs: number;
};

type ActiveKokoroBuffer = {
  buffer: AudioBuffer;
  chunk: ReturnType<typeof getKokoroPassageChunk>;
  signature: string;
};

function decodeCachedSamples(record: CachedVoiceAudio): Float32Array {
  if (record.encoding !== "pcm-s16") return new Float32Array(record.samples.slice(0));
  const encoded = new Int16Array(record.samples);
  const samples = new Float32Array(encoded.length);
  for (let index = 0; index < encoded.length; index += 1) samples[index] = encoded[index] / 32_767;
  return samples;
}

function encodePcm16(samples: Float32Array): ArrayBuffer {
  const encoded = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    encoded[index] = value < 0 ? Math.round(value * 32_768) : Math.round(value * 32_767);
  }
  return encoded.buffer;
}

export function useVoicePlayback({ book, settings, currentIndex, onIndex, onFinish }: VoicePlaybackOptions) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [kokoroStatus, setKokoroStatus] = useState<KokoroStatus>("idle");
  const [kokoroProgress, setKokoroProgress] = useState(0);
  const [kokoroPlaybackStatus, setKokoroPlaybackStatus] = useState<KokoroPlaybackStatus>("idle");
  const [kokoroBackend, setKokoroBackend] = useState<"webgpu" | "wasm" | null>(null);
  const [kokoroPreparedSeconds, setKokoroPreparedSeconds] = useState(0);
  const [kokoroPreparation, setKokoroPreparation] = useState<KokoroPreparationState>({ status: "idle", scope: null, completed: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<number, PendingAudio>());
  const requestIdRef = useRef(0);
  const generationRef = useRef(0);
  const activeRef = useRef(false);
  const pausedRef = useRef(false);
  const latestIndexRef = useRef(currentIndex);
  const timersRef = useRef<number[]>([]);
  const deviceFallbackRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const kokoroAudioCacheRef = useRef(new Map<string, Promise<KokoroAudio>>());
  const kokoroReadyAudioRef = useRef(new Set<string>());
  const kokoroSessionStartedRef = useRef(false);
  const activeKokoroBufferRef = useRef<ActiveKokoroBuffer | null>(null);
  const decodedKokoroBuffersRef = useRef(new Map<string, ActiveKokoroBuffer>());
  const kokoroRealtimeFactorRef = useRef(0.8);
  const countedPreparedAudioRef = useRef(new Set<string>());
  const preparationScopeRef = useRef(`${book.id}:${settings.kokoroVoice}`);
  const preparationJobRef = useRef(0);
  const prefetchJobRef = useRef(0);

  useEffect(() => { latestIndexRef.current = currentIndex; }, [currentIndex]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const refresh = () => setVoices(window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith("en")));
    refresh();
    window.speechSynthesis.addEventListener("voiceschanged", refresh);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", refresh);
  }, []);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current = [];
    if (deviceFallbackRef.current !== null) {
      window.clearInterval(deviceFallbackRef.current);
      deviceFallbackRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    activeRef.current = false;
    pausedRef.current = false;
    clearTimers();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    audioSourceRef.current?.stop();
    audioSourceRef.current = null;
    activeKokoroBufferRef.current = null;
    kokoroSessionStartedRef.current = false;
    setKokoroPlaybackStatus("idle");
    if (audioContextRef.current?.state === "suspended") void audioContextRef.current.resume();
  }, [clearTimers]);

  const unlockKokoroAudio = useCallback(() => {
    const existing = audioContextRef.current;
    const context = !existing || existing.state === "closed" ? new AudioContext() : existing;
    audioContextRef.current = context;
    void context.resume();
    const silentBuffer = context.createBuffer(1, 1, context.sampleRate);
    const silentSource = context.createBufferSource();
    silentSource.buffer = silentBuffer;
    silentSource.connect(context.destination);
    silentSource.start();
    return context;
  }, []);

  useEffect(() => cancel, [book.id, cancel]);

  const advance = useCallback((index: number) => {
    if (index < latestIndexRef.current || index >= book.tokens.length) return;
    latestIndexRef.current = index;
    onIndex(index);
  }, [book.tokens.length, onIndex]);

  const scheduleLinearSync = useCallback((start: number, end: number, duration: number, generation: number) => {
    clearTimers();
    const tokenCount = end - start + 1;
    for (let relativeIndex = 1; relativeIndex < tokenCount; relativeIndex += 1) {
      const delay = duration * (relativeIndex / tokenCount);
      timersRef.current.push(window.setTimeout(() => {
        if (generationRef.current === generation && activeRef.current && !pausedRef.current) {
          advance(start + relativeIndex);
        }
      }, delay));
    }
  }, [advance, clearTimers]);

  const startDeviceFallback = useCallback((start: number, end: number, duration: number, generation: number) => {
    clearTimers();
    const startedAt = performance.now();
    deviceFallbackRef.current = window.setInterval(() => {
      if (generationRef.current !== generation || !activeRef.current || pausedRef.current) return;
      const elapsed = performance.now() - startedAt;
      advance(getLinearSpeechIndex(start, end, elapsed, duration));
    }, 50);
  }, [advance, clearTimers]);

  const finishOrContinue = useCallback((end: number, generation: number, playSentence: (index: number, generation: number) => void) => {
    clearTimers();
    if (generationRef.current !== generation || !activeRef.current) return;
    advance(end);
    if (end >= book.tokens.length - 1) {
      activeRef.current = false;
      onFinish();
      return;
    }
    const next = end + 1;
    latestIndexRef.current = next;
    onIndex(next);
    playSentence(next, generation);
  }, [advance, book.tokens.length, clearTimers, onFinish, onIndex]);

  const playDeviceSentenceRef = useRef<(index: number, generation: number) => void>(() => undefined);
  useEffect(() => {
    playDeviceSentenceRef.current = (index, generation) => {
    if (!("speechSynthesis" in window)) {
      setError("Speech is unavailable in this browser. Silent RSVP still works.");
      activeRef.current = false;
      onFinish();
      return;
    }
    const chunk = getSentenceChunk(book, index);
    const utterance = new SpeechSynthesisUtterance(chunk.text);
    utterance.rate = settings.voiceRate;
    const selected = voices.find((voice) => voice.voiceURI === settings.deviceVoice)
      ?? voices.find((voice) => voice.default)
      ?? voices[0];
    if (selected) utterance.voice = selected;
    utterance.onboundary = (event) => {
      if (generationRef.current !== generation || event.name === "sentence") return;
      advance(tokenIndexForBoundary(chunk, event.charIndex));
    };
    utterance.onerror = (event) => {
      if (event.error === "canceled" || event.error === "interrupted") return;
      setError("The selected device voice stopped unexpectedly. Try another voice.");
      activeRef.current = false;
      onFinish();
    };
    utterance.onend = () => finishOrContinue(chunk.end, generation, playDeviceSentenceRef.current);
    startDeviceFallback(chunk.start, chunk.end, estimatedSpeechDuration(chunk.end - chunk.start + 1, settings.voiceRate), generation);
    window.speechSynthesis.speak(utterance);
    };
  }, [advance, book, finishOrContinue, onFinish, settings.deviceVoice, settings.voiceRate, startDeviceFallback, voices]);

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker("/kokoro/kokoro.worker.js", { type: "module" });
    worker.onmessage = (event) => {
      const message = event.data;
      if (message.type === "progress") {
        const progress = typeof message.progress?.progress === "number" ? message.progress.progress : 0;
        setKokoroProgress(Math.max(0, Math.min(100, progress)));
      } else if (message.type === "ready") {
        setKokoroStatus("ready");
        setKokoroProgress(100);
        localStorage.setItem(KOKORO_CACHED_KEY, "true");
        setKokoroBackend(message.backend === "webgpu" ? "webgpu" : "wasm");
      } else if (message.type === "audio") {
        const pending = pendingRef.current.get(message.requestId);
        if (pending) {
          pendingRef.current.delete(message.requestId);
          pending.resolve({ samples: message.samples, sampleRate: message.sampleRate, generationMs: message.generationMs });
        }
      } else if (message.type === "error") {
        if (message.requestId !== undefined) {
          const pending = pendingRef.current.get(message.requestId);
          pendingRef.current.delete(message.requestId);
          pending?.reject(new Error(message.message));
        } else {
          setKokoroStatus("error");
          setError("The natural voice model could not be loaded. Check your connection and try again.");
        }
      }
    };
    worker.onerror = () => {
      setKokoroStatus("error");
      setError("The natural voice model could not start on this device.");
    };
    workerRef.current = worker;
    return worker;
  }, []);

  const prepareKokoro = useCallback((restoring = false) => {
    setError(null);
    setKokoroStatus(restoring ? "restoring" : "loading");
    setKokoroProgress(0);
    localStorage.setItem(KOKORO_ENABLED_KEY, "true");
    ensureWorker().postMessage({ type: "load" });
  }, [ensureWorker]);

  const generateKokoro = useCallback((text: string, voice: string, speed: number) => {
    const requestId = ++requestIdRef.current;
    return new Promise<KokoroAudio>((resolve, reject) => {
      pendingRef.current.set(requestId, { resolve, reject });
      ensureWorker().postMessage({ type: "generate", requestId, text, voice, speed });
    });
  }, [ensureWorker]);

  const getKokoroAudio = useCallback((index: number) => {
    const chunk = getKokoroPassageChunk(book, index);
    const scope = `${book.id}:${settings.kokoroVoice}`;
    const key = `${scope}:${chunk.start}`;
    let audio = kokoroAudioCacheRef.current.get(key);
    if (!audio) {
      audio = (async () => {
        const cached = await getCachedVoiceAudio(key);
        if (cached) {
          return { samples: decodeCachedSamples(cached), sampleRate: cached.sampleRate, generationMs: 0 };
        }
        const result = await generateKokoro(chunk.text, settings.kokoroVoice, 1);
        try {
          await saveCachedVoiceAudio({
            id: key,
            bookId: book.id,
            voice: settings.kokoroVoice,
            start: chunk.start,
            end: chunk.end,
            sampleRate: result.sampleRate,
            samples: encodePcm16(result.samples),
            encoding: "pcm-s16",
            createdAt: Date.now(),
          });
        } catch {
          // Playback remains available if this device declines additional local storage.
        }
        return result;
      })().then((result) => {
        kokoroReadyAudioRef.current.add(key);
        if (preparationScopeRef.current === scope && !countedPreparedAudioRef.current.has(key)) {
          countedPreparedAudioRef.current.add(key);
          setKokoroPreparedSeconds((seconds) => seconds + (result.samples.length / result.sampleRate));
        }
        return result;
      });
      kokoroAudioCacheRef.current.set(key, audio);
      void audio.catch(() => {
        kokoroAudioCacheRef.current.delete(key);
        kokoroReadyAudioRef.current.delete(key);
      });
    }
    return audio;
  }, [book, generateKokoro, settings.kokoroVoice]);

  const isKokoroAudioReady = useCallback((index: number) => {
    const chunk = getKokoroPassageChunk(book, index);
    return kokoroReadyAudioRef.current.has(`${book.id}:${settings.kokoroVoice}:${chunk.start}`);
  }, [book, settings.kokoroVoice]);

  const prefetchKokoro = useCallback((index: number, count: number) => {
    const requests: Array<Promise<KokoroAudio>> = [];
    let cursor = index;
    let queue = Promise.resolve();
    const job = prefetchJobRef.current;
    for (let position = 0; position < count && cursor < book.tokens.length; position += 1) {
      const chunk = getKokoroPassageChunk(book, cursor);
      const chunkStart = chunk.start;
      const request = queue.then(() => {
        if (prefetchJobRef.current !== job) throw new DOMException("Prefetch stopped", "AbortError");
        return getKokoroAudio(chunkStart);
      });
      void request.catch(() => undefined);
      requests.push(request);
      queue = request.then(() => undefined, () => undefined);
      cursor = chunk.end + 1;
    }
    return requests;
  }, [book, getKokoroAudio]);

  const stopKokoroPreparation = useCallback(() => {
    preparationJobRef.current += 1;
    setKokoroPreparation((state) => state.status === "preparing" ? { ...state, status: "idle" } : state);
  }, []);

  const prepareKokoroAudio = useCallback(async (scope: KokoroPreparationScope) => {
    if (kokoroStatus !== "ready") {
      setError("Download the natural voice model before preparing book audio.");
      return;
    }
    setError(null);
    const job = ++preparationJobRef.current;
    void navigator.storage?.persist?.();
    const range = getKokoroPreparationRange(book.tokens.length, latestIndexRef.current, scope);
    const starts: number[] = [];
    let cursor = range.start;
    while (cursor <= range.end && cursor < book.tokens.length) {
      const chunk = getKokoroPassageChunk(book, cursor);
      starts.push(chunk.start);
      cursor = chunk.end + 1;
    }
    setKokoroPreparation({ status: "preparing", scope, completed: 0, total: starts.length });
    try {
      for (let position = 0; position < starts.length; position += 1) {
        if (preparationJobRef.current !== job) return;
        await getKokoroAudio(starts[position]);
        if (preparationJobRef.current !== job) return;
        setKokoroPreparation({ status: "preparing", scope, completed: position + 1, total: starts.length });
      }
      if (preparationJobRef.current === job) {
        setKokoroPreparation({ status: "complete", scope, completed: starts.length, total: starts.length });
      }
    } catch (cause) {
      if (preparationJobRef.current !== job) return;
      const detail = cause instanceof Error ? cause.message : "This device declined additional local storage.";
      setKokoroPreparation((state) => ({ ...state, status: "error" }));
      setError(`Kokoro preparation stopped: ${detail}`);
    }
  }, [book, getKokoroAudio, kokoroStatus]);

  const removePreparedKokoroAudio = useCallback(async () => {
    stopKokoroPreparation();
    prefetchJobRef.current += 1;
    cancel();
    await deleteCachedVoiceAudio(book.id, settings.kokoroVoice);
    const prefix = `${book.id}:${settings.kokoroVoice}:`;
    for (const key of kokoroAudioCacheRef.current.keys()) if (key.startsWith(prefix)) kokoroAudioCacheRef.current.delete(key);
    for (const key of kokoroReadyAudioRef.current) if (key.startsWith(prefix)) kokoroReadyAudioRef.current.delete(key);
    for (const key of decodedKokoroBuffersRef.current.keys()) if (key.startsWith(prefix)) decodedKokoroBuffersRef.current.delete(key);
    countedPreparedAudioRef.current.clear();
    setKokoroPreparedSeconds(0);
    setKokoroPreparation({ status: "idle", scope: null, completed: 0, total: 0 });
  }, [book.id, cancel, settings.kokoroVoice, stopKokoroPreparation]);

  const playKokoroSentenceRef = useRef<(index: number, generation: number) => void>(() => undefined);
  useEffect(() => {
    playKokoroSentenceRef.current = (index, generation) => {
    const chunk = getKokoroPassageChunk(book, index);
    const signature = `${book.id}:${settings.kokoroVoice}`;
    const cachedBuffer = [...decodedKokoroBuffersRef.current.values()].find((entry) => entry.signature === signature && chunk.start >= entry.chunk.start && chunk.start <= entry.chunk.end);
    if (cachedBuffer && audioContextRef.current) {
      const context = audioContextRef.current;
      const tokenCount = cachedBuffer.chunk.end - cachedBuffer.chunk.start + 1;
      const offset = cachedBuffer.buffer.duration * ((chunk.start - cachedBuffer.chunk.start) / tokenCount);
      latestIndexRef.current = chunk.start;
      onIndex(chunk.start);
      const source = context.createBufferSource();
      source.buffer = cachedBuffer.buffer;
      source.playbackRate.value = settings.voiceRate;
      source.connect(context.destination);
      source.onended = () => {
        if (generationRef.current !== generation) return;
        activeKokoroBufferRef.current = null;
        setKokoroPlaybackStatus("idle");
        finishOrContinue(cachedBuffer.chunk.end, generation, playKokoroSentenceRef.current);
      };
      audioSourceRef.current = source;
      activeKokoroBufferRef.current = cachedBuffer;
      scheduleLinearSync(chunk.start, cachedBuffer.chunk.end, ((cachedBuffer.buffer.duration - offset) / settings.voiceRate) * 1000, generation);
      source.start(0, offset);
      kokoroSessionStartedRef.current = true;
      setKokoroPlaybackStatus("playing");
      if (cachedBuffer.chunk.end < book.tokens.length - 1) {
        const lookAhead = kokoroRealtimeFactorRef.current > 1 ? 7 : kokoroRealtimeFactorRef.current > 0.7 ? 5 : 3;
        for (const request of prefetchKokoro(cachedBuffer.chunk.end + 1, lookAhead)) void request;
      }
      return;
    }
    const initialBuffer = !kokoroSessionStartedRef.current;
    if (initialBuffer || !isKokoroAudioReady(index)) setKokoroPlaybackStatus("generating");
    const initialRequests = initialBuffer ? prefetchKokoro(index, 2) : null;
    const buffered = initialRequests?.[0] ?? getKokoroAudio(index);
    void buffered.then(async ({ samples, sampleRate, generationMs }) => {
      if (generationRef.current !== generation || !activeRef.current) return;
      if (!(samples instanceof Float32Array) || samples.length === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
        throw new Error("Kokoro generated an empty audio buffer.");
      }
      const context = audioContextRef.current ?? unlockKokoroAudio();
      audioContextRef.current = context;
      if (context.state === "suspended") await context.resume();
      if (context.state !== "running") throw new Error(`Audio playback is ${context.state}.`);
      const buffer = context.createBuffer(1, samples.length, sampleRate);
      buffer.copyToChannel(new Float32Array(samples), 0);
      const realtimeFactor = generationMs / (buffer.duration * 1000);
      kokoroRealtimeFactorRef.current = (kokoroRealtimeFactorRef.current * 0.65) + (realtimeFactor * 0.35);
      const signature = `${book.id}:${settings.kokoroVoice}`;
      const decoded = { buffer, chunk, signature };
      decodedKokoroBuffersRef.current.set(`${signature}:${chunk.start}`, decoded);
      while (decodedKokoroBuffersRef.current.size > 8) {
        const oldest = decodedKokoroBuffersRef.current.keys().next().value;
        if (oldest === undefined) break;
        decodedKokoroBuffersRef.current.delete(oldest);
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = settings.voiceRate;
      source.connect(context.destination);
      source.onended = () => {
        if (generationRef.current !== generation) return;
        activeKokoroBufferRef.current = null;
        setKokoroPlaybackStatus("idle");
        finishOrContinue(chunk.end, generation, playKokoroSentenceRef.current);
      };
      audioSourceRef.current = source;
      activeKokoroBufferRef.current = decoded;
      scheduleLinearSync(chunk.start, chunk.end, (buffer.duration / settings.voiceRate) * 1000, generation);
      source.start();
      kokoroSessionStartedRef.current = true;
      setKokoroPlaybackStatus("playing");
      if (chunk.end < book.tokens.length - 1) {
        const lookAhead = kokoroRealtimeFactorRef.current > 1 ? 7 : kokoroRealtimeFactorRef.current > 0.7 ? 5 : 3;
        for (const request of prefetchKokoro(chunk.end + 1, lookAhead)) void request;
      }
    }).catch((cause) => {
      if (generationRef.current !== generation) return;
      setKokoroPlaybackStatus("idle");
      const detail = cause instanceof Error ? cause.message : "Unknown playback error";
      setError(`Natural voice could not play: ${detail}`);
      activeRef.current = false;
      onFinish();
    });
    };
  }, [book, finishOrContinue, getKokoroAudio, isKokoroAudioReady, onFinish, onIndex, prefetchKokoro, scheduleLinearSync, settings.kokoroVoice, settings.voiceRate, unlockKokoroAudio]);

  const start = useCallback((requestedIndex = currentIndex) => {
    setError(null);
    if (settings.readingMode === "kokoro") {
      unlockKokoroAudio();
    }
    if (pausedRef.current) {
      pausedRef.current = false;
      activeRef.current = true;
      const generation = ++generationRef.current;
      clearTimers();
      if (settings.readingMode === "device") {
        window.speechSynthesis.cancel();
        playDeviceSentenceRef.current(requestedIndex, generation);
      } else {
        const signature = `${book.id}:${settings.kokoroVoice}`;
        const sentenceStart = getKokoroPassageChunk(book, requestedIndex).start;
        const activeBuffer = activeKokoroBufferRef.current
          ?? [...decodedKokoroBuffersRef.current.values()].find((entry) => entry.signature === signature && sentenceStart >= entry.chunk.start && sentenceStart <= entry.chunk.end)
          ?? null;
        audioSourceRef.current?.stop();
        audioSourceRef.current = null;
        latestIndexRef.current = sentenceStart;
        onIndex(sentenceStart);
        if (activeBuffer && sentenceStart >= activeBuffer.chunk.start && sentenceStart <= activeBuffer.chunk.end && audioContextRef.current) {
          const context = audioContextRef.current;
          void context.resume();
          const tokenCount = activeBuffer.chunk.end - activeBuffer.chunk.start + 1;
          const offset = activeBuffer.buffer.duration * ((sentenceStart - activeBuffer.chunk.start) / tokenCount);
          const source = context.createBufferSource();
          source.buffer = activeBuffer.buffer;
          source.playbackRate.value = settings.voiceRate;
          source.connect(context.destination);
          source.onended = () => {
            if (generationRef.current !== generation) return;
            activeKokoroBufferRef.current = null;
            setKokoroPlaybackStatus("idle");
            finishOrContinue(activeBuffer.chunk.end, generation, playKokoroSentenceRef.current);
          };
          audioSourceRef.current = source;
          activeKokoroBufferRef.current = activeBuffer;
          scheduleLinearSync(sentenceStart, activeBuffer.chunk.end, ((activeBuffer.buffer.duration - offset) / settings.voiceRate) * 1000, generation);
          source.start(0, offset);
          setKokoroPlaybackStatus("playing");
          if (activeBuffer.chunk.end < book.tokens.length - 1) {
            for (const request of prefetchKokoro(activeBuffer.chunk.end + 1, 3)) void request;
          }
        } else {
          activeKokoroBufferRef.current = null;
          playKokoroSentenceRef.current(sentenceStart, generation);
        }
      }
      return true;
    }
    if (settings.readingMode === "kokoro" && kokoroStatus !== "ready") {
      setError("Download the natural voice model before playing Kokoro.");
      return false;
    }
    cancel();
    const generation = generationRef.current;
    activeRef.current = true;
    latestIndexRef.current = requestedIndex;
    if (settings.readingMode === "device") playDeviceSentenceRef.current(requestedIndex, generation);
    else playKokoroSentenceRef.current(requestedIndex, generation);
    return true;
  }, [book, cancel, clearTimers, currentIndex, finishOrContinue, kokoroStatus, onIndex, prefetchKokoro, scheduleLinearSync, settings.kokoroVoice, settings.readingMode, settings.voiceRate, unlockKokoroAudio]);

  const pause = useCallback(() => {
    activeRef.current = false;
    pausedRef.current = true;
    clearTimers();
    if (settings.readingMode === "device") window.speechSynthesis.pause();
    else void audioContextRef.current?.suspend();
  }, [clearTimers, settings.readingMode]);

  const setKokoroPlaybackRate = useCallback((rate: number) => {
    if (settings.readingMode !== "kokoro") return false;
    const source = audioSourceRef.current;
    const activeBuffer = activeKokoroBufferRef.current;
    const context = audioContextRef.current;
    if (source && activeBuffer && context) {
      source.playbackRate.setValueAtTime(rate, context.currentTime);
      if (activeRef.current && !pausedRef.current) {
        const start = Math.max(activeBuffer.chunk.start, latestIndexRef.current);
        const totalTokens = activeBuffer.chunk.end - activeBuffer.chunk.start + 1;
        const remainingTokens = activeBuffer.chunk.end - start + 1;
        const duration = activeBuffer.buffer.duration * (remainingTokens / totalTokens) * (1 / rate) * 1000;
        scheduleLinearSync(start, activeBuffer.chunk.end, duration, generationRef.current);
      }
    }
    return true;
  }, [scheduleLinearSync, settings.readingMode]);

  const removeKokoro = useCallback(async () => {
    preparationJobRef.current += 1;
    prefetchJobRef.current += 1;
    cancel();
    workerRef.current?.terminate();
    workerRef.current = null;
    for (const pending of pendingRef.current.values()) pending.reject(new Error("Model removed"));
    pendingRef.current.clear();
    kokoroAudioCacheRef.current.clear();
    kokoroReadyAudioRef.current.clear();
    kokoroSessionStartedRef.current = false;
    activeKokoroBufferRef.current = null;
    decodedKokoroBuffersRef.current.clear();
    kokoroRealtimeFactorRef.current = 0.8;
    countedPreparedAudioRef.current.clear();
    setKokoroPreparedSeconds(0);
    setKokoroPreparation({ status: "idle", scope: null, completed: 0, total: 0 });
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => /transformers|kokoro/i.test(key)).map((key) => caches.delete(key)));
    }
    localStorage.removeItem(KOKORO_ENABLED_KEY);
    localStorage.removeItem(KOKORO_CACHED_KEY);
    setKokoroStatus("idle");
    setKokoroProgress(0);
  }, [cancel]);

  useEffect(() => {
    if (localStorage.getItem(KOKORO_ENABLED_KEY) === "true") {
      const restoring = localStorage.getItem(KOKORO_CACHED_KEY) === "true";
      queueMicrotask(() => prepareKokoro(restoring));
    }
  }, [prepareKokoro]);

  useEffect(() => {
    const scope = `${book.id}:${settings.kokoroVoice}`;
    prefetchJobRef.current += 1;
    preparationScopeRef.current = scope;
    countedPreparedAudioRef.current.clear();
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled && preparationScopeRef.current === scope) setKokoroPreparedSeconds(0);
    });
    void listCachedVoiceAudioKeys(book.id, settings.kokoroVoice).then((keys) => {
      if (cancelled || preparationScopeRef.current !== scope) return;
      const cached = new Set(keys);
      for (const key of cached) {
        kokoroReadyAudioRef.current.add(key);
        countedPreparedAudioRef.current.add(key);
      }
      const ranges = keys.flatMap((key) => {
        const start = Number(key.slice(scope.length + 1));
        if (!Number.isInteger(start) || start < 0 || start >= book.tokens.length) return [];
        const chunk = getKokoroPassageChunk(book, start);
        return [{ start: chunk.start, end: chunk.end }];
      }).sort((first, second) => first.start - second.start);
      let preparedTokens = 0;
      let coveredThrough = -1;
      for (const range of ranges) {
        const uncoveredStart = Math.max(range.start, coveredThrough + 1);
        if (range.end >= uncoveredStart) preparedTokens += range.end - uncoveredStart + 1;
        coveredThrough = Math.max(coveredThrough, range.end);
      }
      const seconds = (preparedTokens / 165) * 60;
      setKokoroPreparedSeconds((current) => Math.max(current, seconds));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [book, settings.kokoroVoice]);

  useEffect(() => {
    if (settings.readingMode !== "kokoro" || kokoroStatus !== "ready") return;
    for (const request of prefetchKokoro(latestIndexRef.current, 12)) void request;
  }, [book.id, kokoroStatus, prefetchKokoro, settings.kokoroVoice, settings.readingMode]);

  useEffect(() => () => {
    cancel();
    workerRef.current?.terminate();
    void audioContextRef.current?.close();
  }, [cancel]);

  return {
    voices,
    speechAvailable: "speechSynthesis" in window,
    kokoroStatus,
    kokoroProgress,
    kokoroPlaybackStatus,
    kokoroBackend,
    kokoroPreparedSeconds,
    kokoroPreparation,
    error,
    start,
    pause,
    cancel,
    setKokoroPlaybackRate,
    prepareKokoro,
    prepareKokoroAudio,
    stopKokoroPreparation,
    removePreparedKokoroAudio,
    removeKokoro,
  };
}
