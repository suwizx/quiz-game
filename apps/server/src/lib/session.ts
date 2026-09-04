import { createHmac, randomUUID } from "node:crypto";

import { auth } from "@singpore-game/auth";
import { db } from "@singpore-game/db";
import { isAdminEmail } from "@singpore-game/db/admins";
import { user as userTable } from "@singpore-game/db/schema/auth";
import { env, studentIdFromEmail } from "@singpore-game/env/server";
import { Elysia } from "elysia";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  studentId: string | null;
  isGuest?: boolean;
}

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  const val = match?.[1];
  return val ? decodeURIComponent(val) : null;
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
    isGuest: false,
  };
}

export async function getOrCreateCurrentUser(headers: Headers): Promise<CurrentUser> {
  const authUser = await currentUserFromHeaders(headers);
  if (authUser) return authUser;

  const headerGuestId = headers.get("x-guest-id")?.trim();
  const cookieGuestId = parseCookie(headers.get("cookie"), "guest_id");
  const rawId = headerGuestId || cookieGuestId;
  const guestId =
    rawId && /^[a-zA-Z0-9_-]{1,64}$/.test(rawId)
      ? rawId
      : `guest_${randomUUID().replace(/-/g, "")}`;

  await db
    .insert(userTable)
    .values({
      id: guestId,
      name: "ผู้เล่น",
      email: `${guestId}@guest.local`,
      emailVerified: false,
    })
    .onConflictDoNothing();

  return {
    id: guestId,
    name: "",
    email: `${guestId}@guest.local`,
    isAdmin: false,
    studentId: null,
    isGuest: true,
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

/** ผู้เล่นทั่วไปไม่ต้องล็อกอิน — ถ้าไม่มี session จะใช้ guest user ให้เสมอ */
export const requireUser = new Elysia({ name: "session/required" })
  .derive({ as: "scoped" }, async ({ request }) => ({
    user: await getOrCreateCurrentUser(request.headers),
  }))
  .resolve({ as: "scoped" }, ({ user }) => ({ user: user as CurrentUser }));

export function createPinToken(userId: string): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`admin_pin:${userId}:${env.ADMIN_PIN}`)
    .digest("hex");
}

export function isPinVerified(headers: Headers, userId: string): boolean {
  const token = parseCookie(headers.get("cookie"), "admin_pin") || headers.get("x-admin-pin");
  if (!token) return false;
  return token === createPinToken(userId);
}

/** บังคับว่าต้องล็อกอินด้วยอีเมลผู้ดูแล */
export const requireAdminAuth = new Elysia({ name: "session/admin-auth" })
  .derive({ as: "scoped" }, async ({ request }) => ({
    user: await currentUserFromHeaders(request.headers),
  }))
  .onBeforeHandle({ as: "scoped" }, ({ user, status }) => {
    if (!user) return status(401, { message: "ต้องเข้าสู่ระบบก่อน" });
    if (!user.isAdmin) return status(403, { message: "เฉพาะผู้ดูแลเท่านั้น" });
  })
  .resolve({ as: "scoped" }, ({ user }) => ({ user: user as CurrentUser }));

/** บังคับว่าต้องเป็นผู้ดูแล และยืนยันรหัส PIN แล้ว */
export const requireAdmin = new Elysia({ name: "session/admin" })
  .derive({ as: "scoped" }, async ({ request }) => ({
    user: await currentUserFromHeaders(request.headers),
  }))
  .onBeforeHandle({ as: "scoped" }, ({ user, request, status }) => {
    if (!user) return status(401, { message: "ต้องเข้าสู่ระบบก่อน" });
    if (!user.isAdmin) return status(403, { message: "เฉพาะผู้ดูแลเท่านั้น" });
    if (!isPinVerified(request.headers, user.id)) {
      return status(403, { code: "PIN_REQUIRED", message: "กรุณายืนยันรหัส PIN ผู้ดูแล" });
    }
  })
  .resolve({ as: "scoped" }, ({ user }) => ({ user: user as CurrentUser }));
