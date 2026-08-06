/** หลอดน้ำเต็มที่ค่านี้ แต่ตัวเลข streak วิ่งต่อได้เรื่อย ๆ */
export const STREAK_BAR_MAX = 10;

/** เวลาเล่นเริ่มต้น (วินาที) — admin ปรับได้ก่อนกด start */
export const DEFAULT_DURATION_SEC = 300;

/** นับถอยหลัง 3..2..1 ก่อนเริ่ม — ไม่นับรวมในเวลาเล่น */
export const COUNTDOWN_MS = 3000;

/** ช่วงส่ง tick/scoreboard ให้ client */
export const TICK_INTERVAL_MS = 1000;

/**
 * ping ทุก 25 วิ เพื่อกัน Cloudflare Tunnel ตัด connection ที่เงียบเกิน
 * Proxy Read Timeout (125 วิ) ตอนรออยู่หน้า lobby
 */
export const HEARTBEAT_INTERVAL_MS = 25_000;

/** เพดานเวลาตอบต่อข้อ กัน tab ที่ถูก suspend ทำให้ totalAnswerMs เพี้ยน */
export const MAX_RESPONSE_MS = 60_000;

/** จำนวนตัวเลือกต่อคำถาม */
export const CHOICE_COUNT = 4;

/** ป้ายกำกับตัวเลือก เรียงตามลำดับใน choices — ยาวเท่า CHOICE_COUNT เสมอ */
export const CHOICE_LABELS = ["ก", "ข", "ค", "ง"] as const;

/** ชื่อที่แสดงบนกระดาน — ยาวสุดในรายชื่อคือ "รหัส + ชื่อเต็ม" 37 ตัวอักษร */
export const NICKNAME_MAX_LENGTH = 60;
