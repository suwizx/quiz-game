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
 * ดึงคำถามถัดไป — คืน null เมื่อผู้เล่นคนนี้เจอครบทุกข้อแล้ว (= จบเกมของตัวเอง)
 * ไม่วนซ้ำ เพราะรอบสองเป็นการตอบข้อที่จำคำตอบได้แล้ว ปั่น streak ได้ไม่ยุติธรรม
 *
 * คิวถูกสับไว้ตั้งแต่ตอน join จึงต้องรับมือสองอย่างที่เกิดระหว่างเกม
 * - ข้อที่ถูกลบ/ปิดใช้งาน ยังค้างอยู่ในคิวเก่า → ข้ามทิ้ง
 * - ข้อที่ admin เพิ่งเพิ่ม ไม่มีในคิวเก่า → ต่อท้ายให้ ไม่งั้นคนที่ join ก่อนไม่มีวันได้เจอ
 */
export function nextQuestion(
  position: QueuePosition,
  questionIds: readonly string[],
): { questionId: string; next: QueuePosition } | null {
  const active = new Set(questionIds);
  if (active.size === 0) return null;

  let { queue, index } = position;
  let extended = false;

  while (true) {
    if (index >= queue.length) {
      if (extended) return null;

      const seen = new Set(queue);
      const unseen = questionIds.filter((id) => !seen.has(id));
      if (unseen.length === 0) return null; // เจอครบทุกข้อแล้ว

      queue = [...queue, ...buildQueue(unseen)];
      extended = true;
    }

    const questionId = queue[index];
    index += 1;
    if (questionId !== undefined && active.has(questionId)) {
      return { questionId, next: { queue, index } };
    }
  }
}
