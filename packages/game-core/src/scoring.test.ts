import { describe, expect, test } from "bun:test";

import { MAX_RESPONSE_MS, STREAK_BAR_MAX } from "./constants";
import { computeOvertakes } from "./overtake";
import { type QueuePosition, buildQueue, nextQuestion } from "./queue";
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

  /** ขอข้อถัดไปแบบยืนยันว่าต้องได้ — ให้เทสต์ที่พังอ่านง่ายกว่าการ ! ทุกบรรทัด */
  const take = (position: QueuePosition, questionIds: readonly string[]) => {
    const result = nextQuestion(position, questionIds);
    if (result.status !== "ok") throw new Error(`คาดว่าจะได้ข้อถัดไป แต่ได้ ${result.status}`);
    return result;
  };

  /** เล่นรวดเดียวจนหมดคิว คืนลำดับข้อที่เจอกับตำแหน่งสุดท้าย */
  const playThrough = (position: QueuePosition, questionIds: readonly string[]) => {
    const seen: string[] = [];
    let current = position;
    for (let result = nextQuestion(current, questionIds); result.status === "ok"; ) {
      seen.push(result.questionId);
      current = result.next;
      result = nextQuestion(current, questionIds);
    }
    return { seen, position: current };
  };

  test("buildQueue คืนคำถามครบทุกข้อโดยไม่ซ้ำ", () => {
    const queue = buildQueue(ids);
    expect(queue).toHaveLength(ids.length);
    expect(new Set(queue).size).toBe(ids.length);
  });

  test("เจอครบทุกข้อโดยไม่ซ้ำ แล้วคืน exhausted (จบเกมของตัวเอง)", () => {
    const { seen, position } = playThrough({ queue: buildQueue(ids), index: 0 }, ids);

    expect(new Set(seen).size).toBe(ids.length);
    // ข้อถัดไปไม่มีแล้ว — ไม่วนกลับไปข้อเดิม
    expect(nextQuestion(position, ids).status).toBe("exhausted");
    expect(nextQuestion(position, ids).status).toBe("exhausted");
  });

  test("ข้อที่ admin เพิ่มระหว่างเกมถูกต่อท้ายคิวให้คนที่ join ไปแล้ว", () => {
    const { position } = playThrough({ queue: buildQueue(ids), index: 0 }, ids);
    expect(nextQuestion(position, ids).status).toBe("exhausted");

    const withNew = [...ids, "q-new-1", "q-new-2"];
    const first = take(position, withNew);
    const second = take(first.next, withNew);

    expect([first.questionId, second.questionId].sort()).toEqual(["q-new-1", "q-new-2"]);
    expect(nextQuestion(second.next, withNew).status).toBe("exhausted");
  });

  test("ไม่มีคำถามในระบบเลยคืน empty ไม่ใช่ exhausted", () => {
    // ต่างกันตรงที่ exhausted ทำให้ service ตี finishedAt ซึ่งย้อนกลับไม่ได้
    // ส่วน empty แปลว่า admin ลบคำถามหมดชั่วคราว ผู้เล่นต้องรอได้ ไม่ใช่จบเกม
    expect(nextQuestion({ queue: [], index: 0 }, []).status).toBe("empty");
    expect(nextQuestion({ queue: [...ids], index: 0 }, []).status).toBe("empty");
  });

  test("ข้อที่ถูกลบระหว่างเกมถูกข้าม ไม่โผล่มาให้ตอบอีก", () => {
    const remaining = ids.filter((id) => id !== "q3" && id !== "q5");
    const { seen } = playThrough({ queue: [...ids], index: 0 }, remaining);

    expect(seen).not.toContain("q3");
    expect(seen).not.toContain("q5");
    expect(new Set(seen).size).toBe(remaining.length);
  });

  test("ลบจนเหลือข้อเดียว เจอข้อนั้นครั้งเดียวแล้วจบ", () => {
    const result = take({ queue: [...ids], index: 0 }, ["q7"]);
    expect(result.questionId).toBe("q7");
    expect(nextQuestion(result.next, ["q7"]).status).toBe("exhausted");
  });

  test("ข้อที่ปิดใช้งานตอนยังไม่เคยเจอ ถ้าเปิดกลับมาต้องได้เจอทีหลัง", () => {
    const withoutQ3 = ids.filter((id) => id !== "q3");

    // เล่นจนหมดคิวตอนที่ q3 ยังปิดอยู่ — q3 ต้องถูกถอดออกจากคิว ไม่ใช่แค่เดินข้าม
    const { seen, position } = playThrough({ queue: [...ids], index: 0 }, withoutQ3);
    expect(seen).not.toContain("q3");

    // admin เปิด q3 กลับมา → ต้องถูกต่อท้ายคิวให้ ไม่ใช่ถูกนับว่าเคยเจอแล้ว
    const result = take(position, ids);
    expect(result.questionId).toBe("q3");
    expect(nextQuestion(result.next, ids).status).toBe("exhausted");
  });

  test("ไม่แก้ไขคิวเดิมที่ผู้เรียกส่งเข้ามา", () => {
    const queue = [...ids];
    nextQuestion({ queue, index: 0 }, ["q7"]);
    expect(queue).toEqual(ids);
  });
});

describe("computeOvertakes", () => {
  const ranks = (entries: Record<string, number>) => new Map(Object.entries(entries));

  test("คนที่ถูกกระโดดข้ามได้ชื่อคนที่แซงจริง ไม่ใช่คนที่ตกลงมาด้วยกัน", () => {
    // A=1 B=2 C=3 D=4 → C พุ่งขึ้นที่ 1 ดัน A กับ B ลงมาคนละอันดับ
    const result = computeOvertakes(
      ranks({ A: 1, B: 2, C: 3, D: 4 }),
      ranks({ C: 1, A: 2, B: 3, D: 4 }),
    );

    expect(result.get("A")).toEqual({ kind: "passed_by", counterpartId: "C" });
    // เดิมบั๊กตรงนี้ — B เคยได้ "A แซงคุณ" ทั้งที่ A ก็ร่วงเหมือนกัน
    expect(result.get("B")).toEqual({ kind: "passed_by", counterpartId: "C" });
    // แซงทั้ง A และ B แต่เล่าคนที่เคยอยู่สูงสุด
    expect(result.get("C")).toEqual({ kind: "passed", counterpartId: "A" });
    // อันดับไม่ขยับ ไม่ต้องแจ้งอะไร
    expect(result.has("D")).toBe(false);
  });

  test("สลับกันสองคนได้ข้อความคนละด้าน", () => {
    const result = computeOvertakes(ranks({ A: 1, B: 2 }), ranks({ B: 1, A: 2 }));

    expect(result.get("A")).toEqual({ kind: "passed_by", counterpartId: "B" });
    expect(result.get("B")).toEqual({ kind: "passed", counterpartId: "A" });
  });

  test("อันดับไม่เปลี่ยนเลย ไม่มีเหตุการณ์", () => {
    const same = { A: 1, B: 2, C: 3 };
    expect(computeOvertakes(ranks(same), ranks(same)).size).toBe(0);
  });

  test("คนที่เพิ่งเข้ามาไม่มีอันดับเก่า จึงไม่ถูกนับว่าแซงใคร", () => {
    const result = computeOvertakes(ranks({ A: 1, B: 2 }), ranks({ A: 1, B: 2, C: 3 }));
    expect(result.size).toBe(0);
  });

  test("ทุกคนเลื่อนขึ้นเพราะคนอันดับ 1 หายไป ไม่นับเป็นการแซง", () => {
    // ไม่มีใครข้ามใคร ลำดับสัมพัทธ์เหมือนเดิมทุกคู่
    const result = computeOvertakes(ranks({ A: 1, B: 2, C: 3 }), ranks({ B: 1, C: 2 }));
    expect(result.size).toBe(0);
  });
});
