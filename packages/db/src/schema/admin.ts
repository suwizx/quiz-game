import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * ผู้ดูแลที่เพิ่มผ่านหน้าแอดมิน — เก็บเป็นอีเมลไม่ใช่ user id
 * เพราะเพิ่มไว้ล่วงหน้าได้ตั้งแต่ก่อนเจ้าตัวจะเคยล็อกอิน
 * (อีเมลใน ADMIN_EMAILS ยังเป็นผู้ดูแลถาวรและลบจากตารางนี้ไม่ได้)
 */
export const adminUser = pgTable("admin_user", {
  /** เก็บเป็นตัวพิมพ์เล็กเสมอ — ทำ normalize ที่ชั้น helper */
  email: text("email").primaryKey(),
  /** อีเมลของคนที่กดเพิ่ม เก็บไว้ดูย้อนหลัง */
  addedByEmail: text("added_by_email"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
