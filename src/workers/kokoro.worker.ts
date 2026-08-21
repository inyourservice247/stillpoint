/// <reference lib="webworker" />

import { KokoroTTS } from "kokoro-js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
let ttsPromise: Promise<KokoroTTS> | null = null;

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
  try {
    if (event.data.type === "load") {
      await loadModel();
      return;
    }
    const tts = await loadModel();
    const audio = await tts.generate(event.data.text, {
      voice: event.data.voice as Parameters<typeof tts.generate>[1] extends { voice?: infer Voice } ? Voice : never,
      speed: event.data.speed,
    });
    const samples = audio.audio as Float32Array;
    self.postMessage({
      type: "audio",
      requestId: event.data.requestId,
      samples,
      sampleRate: audio.sampling_rate,
    }, [samples.buffer]);
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId: event.data.type === "generate" ? event.data.requestId : undefined,
      message: error instanceof Error ? error.message : "Kokoro could not generate audio.",
    });
  }
};

export {};
