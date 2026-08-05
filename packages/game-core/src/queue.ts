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
 * ดึงคำถามถัดไป ถ้าหมดคิวแล้วสับใหม่วนต่อ (ไม่มีใครหมดคำถามก่อนหมดเวลา)
 * ตอนสับใหม่จะกันไม่ให้ข้อแรกซ้ำกับข้อสุดท้ายที่เพิ่งเจอไป
 *
 * คิวถูกสับไว้ตั้งแต่ตอน join ข้อที่ admin ลบ/ปิดใช้งานระหว่างเกมจึงยังค้างอยู่ในคิวเก่า
 * ต้องข้ามทิ้งด้วย questionIds (= ข้อที่ยัง active) ไม่ใช่ใช้แค่ตอนสับคิวใหม่
 */
export function nextQuestion(
  position: QueuePosition,
  questionIds: readonly string[],
): { questionId: string; next: QueuePosition } | null {
  const active = new Set(questionIds);
  if (active.size === 0) return null;

  let { queue, index } = position;
  let reshuffled = false;

  while (true) {
    if (index >= queue.length) {
      // สับใหม่ได้ครั้งเดียวพอ — คิวใหม่สร้างจาก active ล้วน ๆ ข้อแรกใช้ได้แน่นอน
      if (reshuffled) return null;

      const last = queue.at(-1);
      queue = buildQueue(questionIds);
      if (queue.length > 1 && queue[0] === last) {
        [queue[0], queue[1]] = [queue[1] as string, queue[0] as string];
      }
      index = 0;
      reshuffled = true;
    }

    const questionId = queue[index];
    index += 1;
    if (questionId !== undefined && active.has(questionId)) {
      return { questionId, next: { queue, index } };
    }
  }
}
