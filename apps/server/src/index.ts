import { cors } from "@elysiajs/cors";
import { auth } from "@singpore-game/auth";
import { env } from "@singpore-game/env/server";
import { Elysia } from "elysia";

import { adminRoutes } from "./modules/admin/routes";
import * as hub from "./modules/game/hub";
import { gameRoutes } from "./modules/game/routes";
import { gameSocket } from "./modules/game/ws";

const app = new Elysia()
  .use(
    cors({
      origin: env.CORS_ORIGIN,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-guest-id", "x-admin-pin"],
      // ตอน dev เว็บกับ API คนละ origin ถ้าไม่ expose ไว้ js อ่านชื่อไฟล์ CSV ไม่ได้
      exposeHeaders: ["Content-Disposition"],
      credentials: true,
    }),
  )
  .all("/api/auth/*", async (context) => {
    const { request, status } = context;
    if (["POST", "GET"].includes(request.method)) {
      return auth.handler(request);
    }
    return status(405);
  })
  .use(gameRoutes)
  .use(adminRoutes)
  .use(gameSocket)
  .get("/", () => "OK")
  .listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
  });

// ลูปกลาง: เดินสถานะเกม ส่ง tick/กระดานคะแนน และ heartbeat กัน tunnel ตัดสาย
hub.startLoop();

export type App = typeof app;
