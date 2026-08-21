import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    target: "es2022",
    outDir: "public/kokoro",
    emptyOutDir: true,
    lib: {
      entry: "src/workers/kokoro.worker.ts",
      formats: ["es"],
      fileName: () => "kokoro.worker.js",
    },
    rollupOptions: {
      output: { codeSplitting: false },
    },
  },
});
