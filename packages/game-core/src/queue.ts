/** สับไพ่ Fisher–Yates (ไม่แก้ array เดิม) */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * คิวคำถามส่วนตัวของผู้เล่นแต่ละคน — สุ่มลำดับแยกกัน
 * เพื่อไม่ให้คนนั่งข้างกันลอกคำตอบได้
 */
export function buildQueue(questionIds: readonly string[]): string[] {
  return shuffle(questionIds);
}

export interface QueuePosition {
  queue: string[];
  index: number;
}

/**
 * ผลของการขอข้อถัดไป — ต้องแยก "พูลว่าง" ออกจาก "เล่นครบแล้ว" ให้ชัด
 * เพราะฝั่ง service เอา exhausted ไปตี finishedAt ซึ่งย้อนกลับไม่ได้
 * ถ้าเหมารวมกัน admin ลบคำถามข้อสุดท้ายทีเดียวจะจบเกมให้ทุกคนถาวร
 */
export type NextQuestionResult =
  /** ได้ข้อถัดไป */
  | { status: "ok"; questionId: string; next: QueuePosition }
  /** ผู้เล่นคนนี้เจอครบทุกข้อที่เปิดใช้งานอยู่แล้ว = จบเกมของตัวเอง */
  | { status: "exhausted" }
  /** ไม่มีคำถามที่เปิดใช้งานในระบบเลย — ไม่ใช่ความผิดผู้เล่น ให้รอต่อ */
  | { status: "empty" };

/**
 * ดึงคำถามถัดไปจากคิวส่วนตัว
 * ไม่วนซ้ำ เพราะรอบสองเป็นการตอบข้อที่จำคำตอบได้แล้ว ปั่น streak ได้ไม่ยุติธรรม
 *
 * คิวถูกสับไว้ตั้งแต่ตอน join จึงต้องรับมือสองอย่างที่เกิดระหว่างเกม
 * - ข้อที่ถูกลบ/ปิดใช้งาน ยังค้างอยู่ในคิวเก่า → ถอดออกจากคิว
 * - ข้อที่ admin เพิ่งเพิ่ม ไม่มีในคิวเก่า → ต่อท้ายให้ ไม่งั้นคนที่ join ก่อนไม่มีวันได้เจอ
 */
export function nextQuestion(
  position: QueuePosition,
  questionIds: readonly string[],
): NextQuestionResult {
  const active = new Set(questionIds);
  if (active.size === 0) return { status: "empty" };

  let { queue, index } = position;
  let extended = false;
  /** queue เป็นสำเนาของเราแล้วหรือยัง — ห้ามแก้ array ที่ผู้เรียกส่งมา */
  let owned = false;

  while (true) {
    if (index >= queue.length) {
      if (extended) return { status: "exhausted" };

      const seen = new Set(queue);
      const unseen = questionIds.filter((id) => !seen.has(id));
      if (unseen.length === 0) return { status: "exhausted" };

      queue = [...queue, ...buildQueue(unseen)];
      extended = true;
      owned = true;
    }

    const questionId = queue[index];
    if (questionId !== undefined && active.has(questionId)) {
      return { status: "ok", questionId, next: { queue, index: index + 1 } };
    }

    // ข้อนี้ถูกลบ/ปิดใช้งานไปแล้ว — ถอดออกจากคิว ไม่ใช่แค่เดินข้าม
    // ถ้าปล่อยค้างไว้ ตอนต่อท้ายคิวมันจะถูกนับเป็น "เคยเจอแล้ว" แล้วผู้เล่นจะไม่มีวัน
    // ได้เจอข้อนี้อีกแม้ admin เปิดใช้งานกลับมา
    // index อยู่ที่เดิมเพราะตัวถัดไปเลื่อนมาแทนที่แล้ว
    if (!owned) {
      queue = [...queue];
      owned = true;
    }
    queue.splice(index, 1);
  }
}
