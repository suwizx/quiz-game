import { MAX_RESPONSE_MS, STREAK_BAR_MAX } from "./constants";

/** ตัวเลขทั้งหมดที่ใช้ตัดสินผู้เล่นหนึ่งคน */
export interface PlayerScore {
  currentStreak: number;
  bestStreak: number;
  correctCount: number;
  wrongCount: number;
  totalAnswerMs: number;
}

export const emptyScore = (): PlayerScore => ({
  currentStreak: 0,
  bestStreak: 0,
  correctCount: 0,
  wrongCount: 0,
  totalAnswerMs: 0,
});

/**
 * ผลของการตอบหนึ่งข้อ — ตอบถูก streak +1 (ไม่มีเพดาน), ตอบผิดกลับไป 0
 * bestStreak คือค่าที่ใช้จัดอันดับ จึงไม่ลดลงเมื่อตอบผิด
 */
export function applyAnswer(
  score: PlayerScore,
  isCorrect: boolean,
  responseMs: number,
): PlayerScore {
  const clampedMs = Math.min(Math.max(responseMs, 0), MAX_RESPONSE_MS);
  const currentStreak = isCorrect ? score.currentStreak + 1 : 0;

  return {
    currentStreak,
    bestStreak: Math.max(score.bestStreak, currentStreak),
    correctCount: score.correctCount + (isCorrect ? 1 : 0),
    wrongCount: score.wrongCount + (isCorrect ? 0 : 1),
    totalAnswerMs: score.totalAnswerMs + clampedMs,
  };
}

/**
 * ลำดับ: best streak มาก → ตอบถูกมาก → ใช้เวลารวมน้อย
 * ใช้กับ Array.prototype.sort ได้ตรง ๆ (คนอันดับ 1 อยู่หน้าสุด)
 */
export function compareParticipants(a: PlayerScore, b: PlayerScore): number {
  if (a.bestStreak !== b.bestStreak) return b.bestStreak - a.bestStreak;
  if (a.correctCount !== b.correctCount) return b.correctCount - a.correctCount;
  return a.totalAnswerMs - b.totalAnswerMs;
}

/** สัดส่วนน้ำในหลอด 0..1 — streak เกิน 10 หลอดยังเต็มเท่าเดิม */
export function barFill(streak: number): number {
  return Math.min(Math.max(streak, 0), STREAK_BAR_MAX) / STREAK_BAR_MAX;
}

/** อัตราตอบถูกเป็น % ใช้ในแท็บคำถามของ admin */
export function accuracyPercent(correct: number, wrong: number): number {
  const total = correct + wrong;
  return total === 0 ? 0 : Math.round((correct / total) * 100);
}
