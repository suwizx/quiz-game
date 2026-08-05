import { createDb } from "@singpore-game/db";
import {
  addAdmin,
  isRootAdminEmail,
  listAdmins,
  normalizeEmail,
  removeAdmin,
} from "@singpore-game/db/admins";
import { question } from "@singpore-game/db/schema";
import { CHOICE_COUNT } from "@singpore-game/game-core";
import { and, eq, isNull } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { requireAdmin } from "../../lib/session";
import * as hub from "../game/hub";
import * as service from "../game/service";

const db = createDb();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@,]+\.[^\s@,]+$/;

const questionBody = t.Object({
  text: t.String({ minLength: 1 }),
  choices: t.Array(t.String({ minLength: 1 }), {
    minItems: CHOICE_COUNT,
    maxItems: CHOICE_COUNT,
  }),
  correctIndex: t.Integer({ minimum: 0, maximum: CHOICE_COUNT - 1 }),
  isActive: t.Optional(t.Boolean()),
  adminComment: t.Optional(t.Nullable(t.String())),
});

export const adminRoutes = new Elysia({ prefix: "/api/admin" })
  .use(requireAdmin)

  /* ------------------------------------------------------ ควบคุมเกม */

  .get("/game", async () => {
    const current = await service.getOrCreateGame();
    return {
      game: await service.toGameState(current),
      scoreboard: await service.getScoreboard(current.id),
    };
  })
  .patch(
    "/game/duration",
    async ({ body, status }) => {
      const current = await service.getOrCreateGame();
      const updated = await service.setDuration(current.id, body.durationSec);
      if (!updated) return status(409, { message: "ตั้งเวลาได้เฉพาะตอนที่เกมยังไม่เริ่ม" });

      await hub.broadcastState();
      return await service.toGameState(updated);
    },
    {
      body: t.Object({
        durationSec: t.Integer({ minimum: 30, maximum: 7200 }),
      }),
    },
  )
  .post("/game/start", async ({ status }) => {
    const current = await service.getOrCreateGame();
    const started = await hub.startGame(current.id);
    if (!started) return status(409, { message: "เกมเริ่มไปแล้วหรือจบไปแล้ว" });
    return await service.toGameState(started);
  })
  .post("/game/end", async () => {
    const current = await service.getOrCreateGame();
    await hub.finishGame(current.id);
    return { ok: true };
  })
  .post("/game/reset", async () => {
    const created = await service.resetGame();
    await hub.broadcastState();
    await hub.broadcastLobby(created.id);
    return await service.toGameState(created);
  })

  /* -------------------------------------------------------- คำถาม */

  .get("/questions", () => service.questionStats())
  .post("/questions", async ({ body }) => {
    const [created] = await db.insert(question).values(body).returning();
    return created;
  }, { body: questionBody })
  .patch(
    "/questions/:id",
    async ({ params, body, status }) => {
      const [updated] = await db
        .update(question)
        .set(body)
        .where(and(eq(question.id, params.id), isNull(question.deletedAt)))
        .returning();
      if (!updated) return status(404, { message: "ไม่พบคำถามนี้" });

      // คนที่กำลังถือข้อนี้อยู่ต้องได้ของใหม่ทันที ไม่ใช่รอตอบข้อเก่าให้จบก่อน
      await hub.broadcastState();
      return updated;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(questionBody),
    },
  )
  .delete(
    "/questions/:id",
    async ({ params, status }) => {
      // ไม่ลบแถวจริง เพราะ answer ของรอบก่อน ๆ อ้างถึงอยู่ (ลบแล้วสถิติหายยกชุด)
      // แต่ปิดใช้งาน + ตี deletedAt = หายจากหน้า admin และไม่ถูกแจกอีก
      const [deleted] = await db
        .update(question)
        .set({ isActive: false, deletedAt: new Date() })
        .where(and(eq(question.id, params.id), isNull(question.deletedAt)))
        .returning();
      if (!deleted) return status(404, { message: "ไม่พบคำถามนี้" });

      // ผู้เล่นที่ค้างอยู่ที่ข้อนี้ต้องถูกเปลี่ยนข้อทันที ไม่ต้องรอให้ตอบข้อที่ถูกลบไปแล้ว
      await hub.broadcastState();
      return { ok: true };
    },
    { params: t.Object({ id: t.String() }) },
  )

  /* ------------------------------------------------------ ผู้ดูแล */

  .get("/admins", async ({ user }) => {
    const admins = await listAdmins();
    return admins.map((admin) => ({
      ...admin,
      createdAt: admin.createdAt?.toISOString() ?? null,
      isSelf: admin.email === normalizeEmail(user.email),
    }));
  })
  .post(
    "/admins",
    async ({ body, user, status }) => {
      const email = normalizeEmail(body.email);
      if (!EMAIL_PATTERN.test(email)) {
        return status(400, { message: "รูปแบบอีเมลไม่ถูกต้อง" });
      }

      const added = await addAdmin({ email, addedByEmail: user.email, note: body.note });
      return {
        ...added,
        createdAt: added.createdAt?.toISOString() ?? null,
        isSelf: added.email === normalizeEmail(user.email),
      };
    },
    {
      body: t.Object({
        email: t.String({ minLength: 3, maxLength: 254 }),
        note: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
      }),
    },
  )
  .delete(
    "/admins/:email",
    async ({ params, user, status }) => {
      // Elysia ถอด percent-encoding ของ path param ให้แล้ว
      const email = normalizeEmail(params.email);

      // กันลบตัวเอง เผื่อพลาดแล้วไม่มีใครเข้าแผงควบคุมได้อีก
      if (email === normalizeEmail(user.email)) {
        return status(400, { message: "ถอดสิทธิ์ตัวเองไม่ได้" });
      }
      if (isRootAdminEmail(email)) {
        return status(400, { message: "ผู้ดูแลจาก ADMIN_EMAILS ต้องแก้ที่ไฟล์ตั้งค่า" });
      }

      const removed = await removeAdmin(email);
      if (!removed) return status(404, { message: "ไม่พบผู้ดูแลคนนี้" });
      return { ok: true };
    },
    { params: t.Object({ email: t.String() }) },
  );
