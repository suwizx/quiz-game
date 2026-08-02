import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/index.ts",
  format: "esm",
  outDir: "./dist",
  clean: true,
  noExternal: [/@singpore-game\/.*/],
  // แอปไม่ได้ถูก import จากที่อื่น ไม่ต้องออก .d.ts
  // (bundle declaration ข้าม workspace package แล้วพังที่ type ซึ่ง re-export ต่อกัน)
  dts: false,
});
