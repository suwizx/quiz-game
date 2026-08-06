import { describe, expect, test } from "bun:test";

import { MAX_RESPONSE_MS, STREAK_BAR_MAX } from "./constants";
import { buildQueue, nextQuestion } from "./queue";
import { accuracyPercent, applyAnswer, barFill, compareParticipants, emptyScore } from "./scoring";

const answerMany = (results: boolean[], ms = 1000) =>
  results.reduce((score, isCorrect) => applyAnswer(score, isCorrect, ms), emptyScore());

describe("applyAnswer", () => {
  test("ตอบถูกติดกันทำให้ streak และ bestStreak เพิ่มขึ้น", () => {
    const score = answerMany([true, true, true]);
    expect(score.currentStreak).toBe(3);
    expect(score.bestStreak).toBe(3);
    expect(score.correctCount).toBe(3);
    expect(score.wrongCount).toBe(0);
  });

  test("ตอบผิดรีเซ็ต streak เป็น 0 แต่ bestStreak ยังอยู่", () => {
    const score = answerMany([true, true, true, false]);
    expect(score.currentStreak).toBe(0);
    expect(score.bestStreak).toBe(3);
    expect(score.wrongCount).toBe(1);
  });

  test("streak วิ่งเกิน 10 ได้ (หลอดเต็มแต่ตัวเลขไม่หยุด)", () => {
    const score = answerMany(Array<boolean>(13).fill(true));
    expect(score.currentStreak).toBe(13);
    expect(score.bestStreak).toBe(13);
  });

  test("บวกเวลาตอบสะสม และ clamp ค่าที่เกินเพดาน", () => {
    const score = applyAnswer(applyAnswer(emptyScore(), true, 1500), true, MAX_RESPONSE_MS * 10);
    expect(score.totalAnswerMs).toBe(1500 + MAX_RESPONSE_MS);
  });

  test("เวลาติดลบถูกปัดเป็น 0", () => {
    expect(applyAnswer(emptyScore(), true, -5000).totalAnswerMs).toBe(0);
  });
});

describe("compareParticipants", () => {
  const player = (bestStreak: number, correctCount: number, totalAnswerMs: number) => ({
    ...emptyScore(),
    bestStreak,
    correctCount,
    totalAnswerMs,
  });

  test("best streak มาก่อนเสมอ", () => {
    const rows = [player(3, 99, 100), player(10, 1, 99_999)].sort(compareParticipants);
    expect(rows[0]?.bestStreak).toBe(10);
  });

  test("streak เท่ากันใช้จำนวนข้อถูกตัดสิน", () => {
    const rows = [player(5, 10, 100), player(5, 20, 100)].sort(compareParticipants);
    expect(rows[0]?.correctCount).toBe(20);
  });

  test("streak และข้อถูกเท่ากัน ใครใช้เวลาน้อยกว่าชนะ", () => {
    const rows = [player(5, 10, 9000), player(5, 10, 4000)].sort(compareParticipants);
    expect(rows[0]?.totalAnswerMs).toBe(4000);
  });
});

describe("barFill", () => {
  test("เต็มหลอดพอดีที่ 10 และคงเต็มเมื่อเกิน", () => {
    expect(barFill(0)).toBe(0);
    expect(barFill(5)).toBe(0.5);
    expect(barFill(STREAK_BAR_MAX)).toBe(1);
    expect(barFill(42)).toBe(1);
  });
});

describe("accuracyPercent", () => {
  test("ไม่มีคำตอบเลยได้ 0 ไม่ใช่ NaN", () => {
    expect(accuracyPercent(0, 0)).toBe(0);
  });

  test("ปัดเป็นจำนวนเต็ม", () => {
    expect(accuracyPercent(12, 3)).toBe(80);
    expect(accuracyPercent(1, 2)).toBe(33);
  });
});

describe("queue", () => {
  const ids = Array.from({ length: 8 }, (_, i) => `q${i}`);

  test("buildQueue คืนคำถามครบทุกข้อโดยไม่ซ้ำ", () => {
    const queue = buildQueue(ids);
    expect(queue).toHaveLength(ids.length);
    expect(new Set(queue).size).toBe(ids.length);
  });

  test("เจอครบทุกข้อโดยไม่ซ้ำ แล้วคืน null (จบเกมของตัวเอง)", () => {
    let position = { queue: buildQueue(ids), index: 0 };
    const seen: string[] = [];

    for (let i = 0; i < ids.length; i++) {
      const result = nextQuestion(position, ids);
      expect(result).not.toBeNull();
      seen.push(result!.questionId);
      position = result!.next;
    }

    expect(new Set(seen).size).toBe(ids.length);
    // ข้อถัดไปไม่มีแล้ว — ไม่วนกลับไปข้อเดิม
    expect(nextQuestion(position, ids)).toBeNull();
    expect(nextQuestion(position, ids)).toBeNull();
  });

  test("ข้อที่ admin เพิ่มระหว่างเกมถูกต่อท้ายคิวให้คนที่ join ไปแล้ว", () => {
    let position = { queue: buildQueue(ids), index: 0 };
    for (let i = 0; i < ids.length; i++) position = nextQuestion(position, ids)!.next;
    expect(nextQuestion(position, ids)).toBeNull();

    const withNew = [...ids, "q-new-1", "q-new-2"];
    const first = nextQuestion(position, withNew);
    expect(first).not.toBeNull();
    position = first!.next;
    const second = nextQuestion(position, withNew)!;

    expect([first!.questionId, second.questionId].sort()).toEqual(["q-new-1", "q-new-2"]);
    expect(nextQuestion(second.next, withNew)).toBeNull();
  });

  test("ไม่มีคำถามในระบบเลยคืน null", () => {
    expect(nextQuestion({ queue: [], index: 0 }, [])).toBeNull();
  });

  test("ข้อที่ถูกลบระหว่างเกมถูกข้าม ไม่โผล่มาให้ตอบอีก", () => {
    const remaining = ids.filter((id) => id !== "q3" && id !== "q5");
    let position = { queue: [...ids], index: 0 };
    const seen: string[] = [];

    for (let result = nextQuestion(position, remaining); result; ) {
      seen.push(result.questionId);
      position = result.next;
      result = nextQuestion(position, remaining);
    }

    expect(seen).not.toContain("q3");
    expect(seen).not.toContain("q5");
    expect(new Set(seen).size).toBe(remaining.length);
  });

  test("ลบจนเหลือข้อเดียว เจอข้อนั้นครั้งเดียวแล้วจบ", () => {
    const position = { queue: [...ids], index: 0 };
    const result = nextQuestion(position, ["q7"]);
    expect(result?.questionId).toBe("q7");
    expect(nextQuestion(result!.next, ["q7"])).toBeNull();
  });

  test("ลบคำถามหมดทุกข้อคืน null ไม่วนไม่รู้จบ", () => {
    expect(nextQuestion({ queue: [...ids], index: 0 }, [])).toBeNull();
  });
});
