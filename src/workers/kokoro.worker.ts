/// <reference lib="webworker" />

import { KokoroTTS } from "kokoro-js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
let ttsPromise: Promise<KokoroTTS> | null = null;
let generationQueue: Promise<void> = Promise.resolve();

type WorkerRequest =
  | { type: "load" }
  | { type: "generate"; requestId: number; text: string; voice: string; speed: number };

function loadModel(): Promise<KokoroTTS> {
  if (!ttsPromise) {
    ttsPromise = KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: "q8",
      device: "wasm",
      progress_callback: (progress) => self.postMessage({ type: "progress", progress }),
    }).then((tts) => {
      self.postMessage({ type: "ready" });
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
