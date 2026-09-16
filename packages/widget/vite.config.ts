import { defineConfig } from "vite";
export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "SatsRecordWidget",
      fileName: () => "v1.js",
      formats: ["iife"],
    },
    outDir: "dist",
    emptyOutDir: true,
  },
});
