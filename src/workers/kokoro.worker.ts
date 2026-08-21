/// <reference lib="webworker" />

import { KokoroTTS } from "kokoro-js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
let ttsPromise: Promise<KokoroTTS> | null = null;
let generationQueue: Promise<void> = Promise.resolve();
let backend: "webgpu" | "wasm" = "wasm";

type WorkerRequest =
  | { type: "load" }
  | { type: "generate"; requestId: number; text: string; voice: string; speed: number };

function loadModel(): Promise<KokoroTTS> {
  if (!ttsPromise) {
    const progress_callback = (progress: unknown) => self.postMessage({ type: "progress", progress });
    const canUseWebGpu = "gpu" in navigator;
    ttsPromise = (async () => {
      if (canUseWebGpu) {
        try {
          const tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: "fp32", device: "webgpu", progress_callback });
          backend = "webgpu";
          return tts;
        } catch {
          self.postMessage({ type: "backend-fallback" });
        }
      }
      backend = "wasm";
      return KokoroTTS.from_pretrained(MODEL_ID, { dtype: "q8", device: "wasm", progress_callback });
    })().then((tts) => {
      self.postMessage({ type: "ready", backend });
      return tts;
    }).catch((error) => {
      ttsPromise = null;
      throw error;
    });
  }
  return ttsPromise;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type === "generate") {
    const request = event.data;
    generationQueue = generationQueue.then(async () => {
      try {
        const tts = await loadModel();
        const startedAt = performance.now();
        const audio = await tts.generate(request.text, {
          voice: request.voice as Parameters<typeof tts.generate>[1] extends { voice?: infer Voice } ? Voice : never,
          speed: request.speed,
        });
        const samples = audio.audio as Float32Array;
        self.postMessage({
          type: "audio",
          requestId: request.requestId,
          samples,
          sampleRate: audio.sampling_rate,
          generationMs: performance.now() - startedAt,
          backend,
        }, [samples.buffer]);
      } catch (error) {
        self.postMessage({
          type: "error",
          requestId: request.requestId,
          message: error instanceof Error ? error.message : "Kokoro could not generate audio.",
        });
      }
    });
    return;
  }
  try {
    await loadModel();
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Kokoro could not generate audio.",
    });
  }
};

export {};
