import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    port: 3001,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        // service worker ตอบ navigation ทุกอันด้วย index.html (SPA fallback)
        // ถ้าไม่กัน /api กับ /ws ไว้ การ redirect กลับจาก Google
        // (/api/auth/callback/google) จะโดน SW คว้าไปแล้ว render หน้า Not Found แทน
        navigateFallbackDenylist: [/^\/api\//, /^\/ws\//],
      },
      manifest: {
        name: "ปริศนาฟ้าแลบ",
        short_name: "ฟ้าแลบ",
        description: "เกมควิซแข่งสะสม streak เล่นพร้อมกันทั้งห้อง",
        theme_color: "#0c0c0c",
      },
      pwaAssets: { disabled: false, config: true },
      devOptions: { enabled: true },
    }),
  ],
});
