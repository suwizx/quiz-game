import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    // ยังไม่ใส่ credential ก็ boot ได้ — ปุ่ม Google จะ disabled แทน
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    /** อีเมลผู้ดูแล คั่นด้วย comma — ข้ามข้อจำกัดโดเมนได้ */
    ADMIN_EMAILS: z.string().default("suwijak.pak@gmail.com"),
    /** โดเมนอีเมลที่อนุญาตให้เข้าเล่น */
    ALLOWED_EMAIL_DOMAIN: z.string().default("kmitl.ac.th"),
    /**
     * เปิดเข้าสู่ระบบด้วยอีเมล/รหัสผ่านสำหรับทดสอบเฉพาะตอน dev
     * ใช้ก่อนที่ Google OAuth จะพร้อม — ยังถูกจำกัดโดเมนเหมือนกัน
     * ห้ามเปิดบน production (โค้ดบังคับปิดให้อยู่แล้ว)
     */
    DEV_LOGIN: z
      .string()
      .default("false")
      .transform((value) => value === "true" || value === "1"),
    /** รหัส PIN สำหรับยืนยันสิทธิ์แอดมิน */
    ADMIN_PIN: z.string().default("2468"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});

export const adminEmails = env.ADMIN_EMAILS.split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (
    normalized.endsWith("@kmitl.ac.th") ||
    adminEmails.includes(normalized)
  );
}

/** อนุญาตทุกอีเมล */
export function isAllowedEmail(_email: string | null | undefined): boolean {
  return true;
}

export const isGoogleAuthConfigured = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

/** dev login เปิดได้เฉพาะนอก production เท่านั้น ไม่ว่าจะตั้ง env ยังไง */
export const isDevLoginEnabled = env.DEV_LOGIN && env.NODE_ENV !== "production";

/** แกะรหัสนักศึกษาจากอีเมล เช่น 67070001@kmitl.ac.th → "67070001" */
export function studentIdFromEmail(email: string | null | undefined): string | null {
  const local = email?.split("@")[0]?.trim();
  return local && /^\d{8}$/.test(local) ? local : null;
}
