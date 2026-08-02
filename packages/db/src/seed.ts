/**
 * Seed ข้อมูลตั้งต้น: รายชื่อนักศึกษา (จาก CSV) และคลังคำถาม (จาก JSON)
 * รันซ้ำได้ — roster ใช้ upsert, คำถามข้ามข้อที่มีข้อความซ้ำอยู่แล้ว
 *
 *   bun run db:seed
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { CHOICE_COUNT } from "@singpore-game/game-core";
import { sql } from "drizzle-orm";

import { createDb } from "./index";
import { question, roster } from "./schema/game";

const db = createDb();

const REPO_ROOT = resolve(import.meta.dir, "../../..");
const ROSTER_CSV = resolve(REPO_ROOT, "docs/IPA 2026 Sheet1.csv");
const QUESTIONS_JSON = resolve(REPO_ROOT, "docs/questions.json");

/** CSV ตัวนี้ไม่มี quoted field แต่มีคอลัมน์ว่างท้ายบรรทัด จึง split ตรง ๆ ได้ */
function parseCsv(content: string): string[][] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((cell) => cell.trim()));
}

async function seedRoster() {
  const rows = parseCsv(await readFile(ROSTER_CSV, "utf8")).slice(1); // ข้าม header

  const entries = rows
    .map(([sequence, studentId, fullnameTh, fullnameEn]) => ({
      studentId: studentId ?? "",
      fullnameTh: fullnameTh ?? "",
      fullnameEn: fullnameEn || null,
      sequence: Number(sequence) || null,
    }))
    .filter((entry) => /^\d+$/.test(entry.studentId) && entry.fullnameTh);

  if (entries.length === 0) {
    console.warn("⚠️  ไม่พบรายชื่อใน CSV — ข้าม roster");
    return;
  }

  await db
    .insert(roster)
    .values(entries)
    .onConflictDoUpdate({
      target: roster.studentId,
      set: {
        fullnameTh: sql`excluded.fullname_th`,
        fullnameEn: sql`excluded.fullname_en`,
        sequence: sql`excluded.sequence`,
      },
    });

  console.log(`✅ roster: ${entries.length} รายชื่อ`);
}

interface SeedQuestion {
  text: string;
  choices: string[];
  correctIndex: number;
}

async function seedQuestions() {
  const raw = JSON.parse(await readFile(QUESTIONS_JSON, "utf8")) as SeedQuestion[];

  for (const [i, item] of raw.entries()) {
    if (item.choices?.length !== CHOICE_COUNT) {
      throw new Error(`คำถามข้อ ${i + 1} ต้องมี ${CHOICE_COUNT} ตัวเลือก`);
    }
    if (item.correctIndex < 0 || item.correctIndex >= CHOICE_COUNT) {
      throw new Error(`คำถามข้อ ${i + 1} มี correctIndex นอกช่วง`);
    }
  }

  const existing = await db.select({ text: question.text }).from(question);
  const known = new Set(existing.map((row) => row.text));
  const fresh = raw.filter((item) => !known.has(item.text));

  if (fresh.length > 0) {
    await db.insert(question).values(fresh);
  }

  console.log(`✅ questions: เพิ่มใหม่ ${fresh.length} ข้อ (มีอยู่แล้ว ${known.size} ข้อ)`);
}

await seedRoster();
await seedQuestions();
process.exit(0);
