import { auth } from "@singpore-game/auth";
import { isAdminEmail } from "@singpore-game/db/admins";
import { studentIdFromEmail } from "@singpore-game/env/server";
import { Elysia } from "elysia";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  studentId: string | null;
}

export async function currentUserFromHeaders(headers: Headers): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers });
  if (!session?.user) return null;

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    isAdmin: await isAdminEmail(session.user.email),
    studentId: studentIdFromEmail(session.user.email),
  };
}

/**
 * แต่ละ guard มี derive ของตัวเองและตั้งชื่อไม่ซ้ำกัน
 * ถ้าใช้ plugin ชื่อเดียวกันร่วมกัน Elysia จะ dedupe แล้วอินสแตนซ์ที่สองจะไม่ได้ derive
 * (เคยทำให้ /api/admin/* ตอบ 401 ทั้งที่ล็อกอินอยู่)
 */
export const withUser = new Elysia({ name: "session/optional" }).derive(
  { as: "scoped" },
  async ({ request }) => ({
    user: await currentUserFromHeaders(request.headers),
  }),
);

/** บังคับว่าต้องล็อกอินแล้ว */
export const requireUser = new Elysia({ name: "session/required" })
  .derive({ as: "scoped" }, async ({ request }) => ({
    user: await currentUserFromHeaders(request.headers),
  }))
  .onBeforeHandle({ as: "scoped" }, ({ user, status }) => {
    if (!user) return status(401, { message: "ต้องเข้าสู่ระบบก่อน" });
  })
  .resolve({ as: "scoped" }, ({ user }) => ({ user: user as CurrentUser }));

/** บังคับว่าต้องเป็นผู้ดูแล */
export const requireAdmin = new Elysia({ name: "session/admin" })
  .derive({ as: "scoped" }, async ({ request }) => ({
    user: await currentUserFromHeaders(request.headers),
  }))
  .onBeforeHandle({ as: "scoped" }, ({ user, status }) => {
    if (!user) return status(401, { message: "ต้องเข้าสู่ระบบก่อน" });
    if (!user.isAdmin) return status(403, { message: "เฉพาะผู้ดูแลเท่านั้น" });
  })
  .resolve({ as: "scoped" }, ({ user }) => ({ user: user as CurrentUser }));
