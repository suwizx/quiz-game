import {
  adminEmails,
  isAdminEmail as isEnvAdminEmail,
} from "@singpore-game/env/server";
import { eq } from "drizzle-orm";

import { db } from "./index";
import { adminUser } from "./schema/admin";

export interface AdminEntry {
  email: string;
  addedByEmail: string | null;
  note: string | null;
  createdAt: Date | null;
  /** มาจาก ADMIN_EMAILS — ลบผ่านหน้าแอดมินไม่ได้ */
  isRoot: boolean;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** ผู้ดูแลถาวรจาก env — ใช้ตั้งต้นตอนยังไม่มีใครในตาราง admin_user */
export function isRootAdminEmail(email: string | null | undefined): boolean {
  return isEnvAdminEmail(email);
}

/** ผู้ดูแล = อยู่ใน ADMIN_EMAILS หรือถูกเพิ่มไว้ในตาราง admin_user */
export async function isAdminEmail(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  if (isRootAdminEmail(email)) return true;

  const row = await db.query.adminUser.findFirst({
    where: eq(adminUser.email, normalizeEmail(email)),
    columns: { email: true },
  });
  return !!row;
}

/** อนุญาตทุกอีเมล */
export async function isAllowedEmail(_email: string | null | undefined): Promise<boolean> {
  return true;
}

/** ผู้ดูแลทั้งหมด — เอา ADMIN_EMAILS ขึ้นก่อนเสมอ */
export async function listAdmins(): Promise<AdminEntry[]> {
  const rows = await db.query.adminUser.findMany();
  const byEmail = new Map(rows.map((row) => [row.email, row]));

  const roots: AdminEntry[] = adminEmails.map((email) => ({
    email,
    addedByEmail: byEmail.get(email)?.addedByEmail ?? null,
    note: byEmail.get(email)?.note ?? null,
    createdAt: byEmail.get(email)?.createdAt ?? null,
    isRoot: true,
  }));

  const added: AdminEntry[] = rows
    .filter((row) => !isRootAdminEmail(row.email))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((row) => ({
      email: row.email,
      addedByEmail: row.addedByEmail,
      note: row.note,
      createdAt: row.createdAt,
      isRoot: false,
    }));

  return [...roots, ...added];
}

export async function addAdmin(input: {
  email: string;
  addedByEmail?: string | null;
  note?: string | null;
}): Promise<AdminEntry> {
  const email = normalizeEmail(input.email);

  const note = input.note?.trim() || null;

  const rows = await db
    .insert(adminUser)
    .values({
      email,
      addedByEmail: input.addedByEmail ? normalizeEmail(input.addedByEmail) : null,
      note,
    })
    // กดเพิ่มคนเดิมซ้ำไม่ควรพัง — อัปเดตโน้ตให้แทน
    .onConflictDoUpdate({ target: adminUser.email, set: { note } })
    .returning();

  const row = rows[0];

  return {
    email,
    addedByEmail: row?.addedByEmail ?? null,
    note: row?.note ?? note,
    createdAt: row?.createdAt ?? null,
    isRoot: isRootAdminEmail(email),
  };
}

/** คืน true เมื่อลบจริง — ไม่แตะ ADMIN_EMAILS (คนเรียกต้องกันไว้เอง) */
export async function removeAdmin(email: string): Promise<boolean> {
  const deleted = await db
    .delete(adminUser)
    .where(eq(adminUser.email, normalizeEmail(email)))
    .returning({ email: adminUser.email });

  return deleted.length > 0;
}
