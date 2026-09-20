import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
const notices = readFileSync(
  new URL("./THIRD_PARTY_NOTICES.txt", import.meta.url),
  "utf8",
);
export default defineConfig({
  plugins: [
    {
      name: "widget-third-party-notices",
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type === "chunk")
            output.code = `/*!\n${notices}*/\n${output.code}`;
        }
      },
    },
  ],
  build: {
    lib: {
      entry: "src/index.ts",
      name: "SatsRecordWidget",
      fileName: () => "v1.js",
      formats: ["iife"],
    },
    outDir: "../../apps/web/public/widget",
    emptyOutDir: true,
  },
});
