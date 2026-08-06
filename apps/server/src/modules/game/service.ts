import { type Db, createDb } from "@singpore-game/db";
import { answer, game, participant, question, roster } from "@singpore-game/db/schema";
import {
  DEFAULT_DURATION_SEC,
  MAX_RESPONSE_MS,
  NICKNAME_MAX_LENGTH,
  type GameState,
  type LobbyPlayer,
  type PlayerScore,
  type QuestionView,
  type ScoreRow,
  applyAnswer,
  buildQueue,
  compareParticipants,
  nextQuestion,
} from "@singpore-game/game-core";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

export const db: Db = createDb();

/** ตัว transaction ของ drizzle ใช้แทน db ได้ในฟังก์ชันที่เขียนร่วมกัน */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type DbOrTx = Db | Tx;
type Participant = typeof participant.$inferSelect;

/* ------------------------------------------------------------------ เกม */

/** เกมล่าสุด — ระบบนี้มีเกมที่ active ได้ครั้งละหนึ่งรอบ */
export async function getCurrentGame() {
  const [row] = await db.select().from(game).orderBy(desc(game.createdAt)).limit(1);
  return row ?? null;
}

/** ใช้ตอน server บูตหรือ admin เปิดหน้าแรก — ไม่มีเกมก็สร้าง lobby ให้เลย */
export async function getOrCreateGame() {
  const existing = await getCurrentGame();
  if (existing) return existing;

  const [created] = await db
    .insert(game)
    .values({ status: "lobby", durationSec: DEFAULT_DURATION_SEC })
    .returning();
  return created!;
}

export async function toGameState(row: typeof game.$inferSelect): Promise<GameState> {
  const [[counted], [questions]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(participant)
      .where(eq(participant.gameId, row.id)),
    db.select({ count: sql<number>`count(*)::int` }).from(question).where(servable),
  ]);

  return {
    id: row.id,
    status: row.status,
    durationSec: row.durationSec,
    startsAt: row.startsAt?.getTime() ?? null,
    endsAt: row.endsAt?.getTime() ?? null,
    playerCount: counted?.count ?? 0,
    questionPoolEmpty: (questions?.count ?? 0) === 0,
  };
}

export async function setDuration(gameId: string, durationSec: number) {
  const [row] = await db
    .update(game)
    .set({ durationSec })
    .where(and(eq(game.id, gameId), eq(game.status, "lobby")))
    .returning();
  return row ?? null;
}

/** เริ่มนับถอยหลัง — เวลาเล่นจริงเริ่มนับหลัง countdown จบ ไม่กินเวลาเกม */
export async function startCountdown(gameId: string, countdownMs: number) {
  const current = await db.query.game.findFirst({ where: eq(game.id, gameId) });
  if (!current || current.status !== "lobby") return null;

  const startsAt = new Date(Date.now() + countdownMs);
  const endsAt = new Date(startsAt.getTime() + current.durationSec * 1000);

  const [row] = await db
    .update(game)
    .set({ status: "countdown", startsAt, endsAt })
    .where(eq(game.id, gameId))
    .returning();
  return row ?? null;
}

export async function markRunning(gameId: string) {
  const [row] = await db
    .update(game)
    .set({ status: "running" })
    .where(and(eq(game.id, gameId), eq(game.status, "countdown")))
    .returning();
  return row ?? null;
}

export async function endGame(gameId: string) {
  const [row] = await db
    .update(game)
    .set({ status: "ended", endedAt: new Date() })
    .where(eq(game.id, gameId))
    .returning();
  return row ?? null;
}

/** เปิดรอบใหม่ — เกมเก่าถูกปิดไว้เป็นประวัติ ไม่ลบทิ้ง */
export async function resetGame(durationSec = DEFAULT_DURATION_SEC) {
  const current = await getCurrentGame();
  if (current && current.status !== "ended") {
    await endGame(current.id);
  }

  const [created] = await db.insert(game).values({ status: "lobby", durationSec }).returning();
  return created!;
}

/* ------------------------------------------------------------- ผู้เล่น */

/**
 * ชื่อตั้งต้น "รหัสนักศึกษา ชื่อเต็ม" เช่น "67070001 นายกฤตภัทร แจ่มวัฏกูล"
 * ชื่อเต็มมาจาก roster ตามรหัส ถ้าไม่เจอในรายชื่อค่อยใช้ชื่อจาก Google
 * ไม่มีรหัส (เช่นอีเมล admin ที่ไม่ใช่ของนักศึกษา) ก็ใช้ชื่อ Google เปล่า ๆ
 */
export async function suggestedNickname(studentId: string | null, fallback: string) {
  if (!studentId) return fallback.trim().slice(0, NICKNAME_MAX_LENGTH);

  const row = await db.query.roster.findFirst({ where: eq(roster.studentId, studentId) });
  const fullname = row?.fullnameTh ?? fallback;
  return `${studentId} ${fullname}`.trim().slice(0, NICKNAME_MAX_LENGTH);
}

export async function getParticipant(gameId: string, userId: string) {
  return (
    (await db.query.participant.findFirst({
      where: and(eq(participant.gameId, gameId), eq(participant.userId, userId)),
    })) ?? null
  );
}

export async function joinGame(input: {
  gameId: string;
  userId: string;
  nickname: string;
  studentId: string | null;
}) {
  const existing = await getParticipant(input.gameId, input.userId);
  if (existing) {
    if (existing.nickname === input.nickname) return existing;
    const [updated] = await db
      .update(participant)
      .set({ nickname: input.nickname })
      .where(eq(participant.id, existing.id))
      .returning();
    return updated!;
  }

  const ids = await activeQuestionIds();
  const [created] = await db
    .insert(participant)
    .values({
      gameId: input.gameId,
      userId: input.userId,
      nickname: input.nickname,
      studentId: input.studentId,
      queue: buildQueue(ids),
    })
    .returning();
  return created!;
}

export async function listLobbyPlayers(gameId: string): Promise<LobbyPlayer[]> {
  const rows = await db
    .select({ participantId: participant.id, nickname: participant.nickname })
    .from(participant)
    .where(eq(participant.gameId, gameId))
    .orderBy(participant.joinedAt);
  return rows;
}

/* ------------------------------------------------------------ คำถาม */

/** เงื่อนไข "ข้อที่เอาไปแจกในเกมได้" — ยังเปิดใช้งานและยังไม่ถูกลบ */
const servable = and(eq(question.isActive, true), isNull(question.deletedAt));

async function activeQuestionIds(): Promise<string[]> {
  const rows = await db.select({ id: question.id }).from(question).where(servable);
  return rows.map((row) => row.id);
}

function toQuestionView(
  row: typeof question.$inferSelect,
  number: number,
  servedAt: Date,
): QuestionView {
  return {
    id: row.id,
    text: row.text,
    choices: row.choices,
    number,
    servedAt: servedAt.getTime(),
  };
}

/**
 * คืนคำถามที่ผู้เล่นควรเห็นตอนนี้
 * ถ้ามีข้อค้างอยู่แล้วจะคืนข้อเดิมพร้อมเวลาเดิม — refresh หรือเน็ตหลุดแล้ว
 * กลับมาจะไม่ได้ข้อใหม่และนาฬิกาไม่รีเซ็ต
 */
export async function serveQuestion(participantId: string): Promise<QuestionView | null> {
  const row = await db.query.participant.findFirst({ where: eq(participant.id, participantId) });
  if (!row) return null;
  // จบไปแล้ว — ไม่ต้องแจกข้อใหม่แม้จะมีคำถามเพิ่มเข้ามาทีหลัง
  if (row.finishedAt) return null;

  if (row.currentQuestionId && row.currentServedAt) {
    // ข้อที่ค้างอยู่อาจถูกลบ/ปิดใช้งานไปแล้วระหว่างที่ผู้เล่นกำลังดูอยู่ — ข้ามไปข้อใหม่
    const current = await db.query.question.findFirst({
      where: and(eq(question.id, row.currentQuestionId), servable),
    });
    if (current) return toQuestionView(current, row.questionNumber, row.currentServedAt);
  }

  return advanceQuestion(db, row);
}

/**
 * ปิดเกมของผู้เล่นคนเดียว — เขียนเวลาครั้งแรกครั้งเดียว
 * เงื่อนไข isNull กันเขียนทับตอนมีหลายแท็บยิงพร้อมกัน เวลาที่บันทึกจะได้ไม่ขยับ
 */
async function markFinished(tx: DbOrTx, row: Participant): Promise<Date> {
  if (row.finishedAt) return row.finishedAt;

  const [updated] = await tx
    .update(participant)
    .set({ finishedAt: new Date() })
    .where(and(eq(participant.id, row.id), isNull(participant.finishedAt)))
    .returning({ finishedAt: participant.finishedAt });

  if (updated?.finishedAt) return updated.finishedAt;

  // แพ้เกมชิงกัน — อ่านค่าที่อีกฝั่งเพิ่งเขียนมาใช้แทน
  const current = await tx.query.participant.findFirst({ where: eq(participant.id, row.id) });
  return current?.finishedAt ?? new Date();
}

async function advanceQuestion(tx: DbOrTx, row: Participant): Promise<QuestionView | null> {
  const ids = await activeQuestionIds();
  const picked = nextQuestion({ queue: row.queue, index: row.queueIndex }, ids);

  // ไม่มีคำถามที่เปิดใช้งานเลยสักข้อ — เป็นเรื่องของ admin ไม่ใช่ผู้เล่นเล่นครบ
  // ห้ามตี finishedAt เพราะย้อนกลับไม่ได้ (ลบข้อสุดท้ายทีเดียวจะจบเกมให้ทุกคนถาวร)
  // แค่ปล่อยข้อที่ค้างอยู่ทิ้ง แล้วรอจนกว่าจะมีคำถามกลับมา
  if (picked.status === "empty") {
    await tx
      .update(participant)
      .set({ currentQuestionId: null, currentServedAt: null })
      .where(eq(participant.id, row.id));
    return null;
  }

  if (picked.status === "exhausted") {
    await markFinished(tx, row);
    return null;
  }

  const current = await tx.query.question.findFirst({ where: eq(question.id, picked.questionId) });
  if (!current) return null;

  const servedAt = new Date();
  const number = row.questionNumber + 1;

  await tx
    .update(participant)
    .set({
      queue: picked.next.queue,
      queueIndex: picked.next.index,
      currentQuestionId: picked.questionId,
      currentServedAt: servedAt,
      questionNumber: number,
    })
    .where(eq(participant.id, row.id));

  return toQuestionView(current, number, servedAt);
}

export type SubmitResult =
  | { ok: false; reason: "not_found" | "stale" | "not_running" | "finished" }
  | {
      ok: true;
      correct: boolean;
      correctIndex: number;
      score: PlayerScore;
      next: QuestionView | null;
      /** มีค่าเมื่อข้อนี้เป็นข้อสุดท้าย — ผู้เล่นคนนี้จบเกมแล้ว */
      finishedAt: number | null;
    };

/**
 * ตรวจคำตอบและเดินไปข้อถัดไปในทรานแซกชันเดียว
 * ปฏิเสธคำตอบที่ไม่ตรงกับข้อที่ค้างอยู่ (กันกดซ้ำ / ยิง request มั่ว)
 */
export async function submitAnswer(input: {
  participantId: string;
  questionId: string;
  choiceIndex: number;
}): Promise<SubmitResult> {
  return db.transaction(async (tx) => {
    const row = await tx.query.participant.findFirst({
      where: eq(participant.id, input.participantId),
    });
    if (!row) return { ok: false, reason: "not_found" } as const;
    if (row.finishedAt) return { ok: false, reason: "finished" } as const;

    const currentGame = await tx.query.game.findFirst({ where: eq(game.id, row.gameId) });
    if (!currentGame || currentGame.status !== "running") {
      return { ok: false, reason: "not_running" } as const;
    }

    // สถานะพลิกเป็น ended ตอน tick รอบถัดไป ไม่ใช่วินาทีที่หมดเวลาพอดี
    // ถ้าไม่เทียบนาฬิกาตรงนี้ คำตอบหลังหมดเวลาจะยังถูกนับได้อีกราวหนึ่งวินาที
    const endsAt = currentGame.endsAt?.getTime();
    if (endsAt !== undefined && Date.now() > endsAt) {
      return { ok: false, reason: "not_running" } as const;
    }

    if (!row.currentQuestionId || row.currentQuestionId !== input.questionId) {
      return { ok: false, reason: "stale" } as const;
    }

    const current = await tx.query.question.findFirst({
      where: eq(question.id, input.questionId),
    });
    if (!current) return { ok: false, reason: "not_found" } as const;

    // ถูกลบ/ปิดใช้งานหลังจากเสิร์ฟ — ไม่นับคะแนนข้อนี้ ให้ client sync ข้อใหม่แทน
    if (!current.isActive || current.deletedAt) return { ok: false, reason: "stale" } as const;

    const isCorrect = current.correctIndex === input.choiceIndex;
    // clamp ครั้งเดียวแล้วใช้ทั้งสองที่ ไม่งั้นสถิติรายข้อกับตัวตัดสินอันดับเป็นคนละค่ากัน
    const elapsedMs = Date.now() - (row.currentServedAt?.getTime() ?? Date.now());
    const responseMs = Math.min(Math.max(elapsedMs, 0), MAX_RESPONSE_MS);
    const score = applyAnswer(row, isCorrect, responseMs);

    await tx.insert(answer).values({
      gameId: row.gameId,
      participantId: row.id,
      questionId: current.id,
      choiceIndex: input.choiceIndex,
      isCorrect,
      responseMs,
      streakAfter: score.currentStreak,
    });

    await tx
      .update(participant)
      .set({ ...score, currentQuestionId: null, currentServedAt: null })
      .where(eq(participant.id, row.id));

    const next = await advanceQuestion(tx, {
      ...row,
      ...score,
      currentQuestionId: null,
      currentServedAt: null,
    });

    // ไม่มีข้อถัดไป = advanceQuestion เพิ่งปิดเกมของคนนี้ไป อ่านเวลาที่บันทึกไว้กลับมา
    const finished = next
      ? null
      : await tx.query.participant.findFirst({
          where: eq(participant.id, row.id),
          columns: { finishedAt: true },
        });

    return {
      ok: true,
      correct: isCorrect,
      correctIndex: current.correctIndex,
      score,
      next,
      finishedAt: finished?.finishedAt?.getTime() ?? null,
    } as const;
  });
}

/* -------------------------------------------------------- กระดานคะแนน */

/** userId/studentId ใช้ในฝั่ง server เท่านั้น (จับคู่ผู้เล่น + export) ห้ามส่งออกไปหา client */
export type ScoreboardRow = ScoreRow & { userId: string; studentId: string | null };

export async function getScoreboard(gameId: string): Promise<ScoreboardRow[]> {
  const [current] = await db.select().from(game).where(eq(game.id, gameId));

  const rows = await db
    .select({
      participantId: participant.id,
      userId: participant.userId,
      studentId: participant.studentId,
      nickname: participant.nickname,
      bestStreak: participant.bestStreak,
      currentStreak: participant.currentStreak,
      correctCount: participant.correctCount,
      wrongCount: participant.wrongCount,
      totalAnswerMs: participant.totalAnswerMs,
      finishedAt: participant.finishedAt,
    })
    .from(participant)
    .where(eq(participant.gameId, gameId))
    // คนคะแนนเท่ากันต้องเรียงเหมือนเดิมทุกครั้ง ไม่งั้น sort ที่ stable ก็ยัง
    // สลับอันดับได้ตามลำดับแถวที่ Postgres คืนมา แล้วยิง overtake มั่ว
    .orderBy(participant.joinedAt, participant.id);

  const startedAt = current?.startsAt?.getTime() ?? null;

  return rows
    .map(({ finishedAt, ...row }) => ({
      ...row,
      // เวลาที่ใช้ = ตั้งแต่เกมเริ่มจนตอบข้อสุดท้ายเสร็จ
      // ต้องไม่เป็น null เมื่อจบแล้ว เพราะ client ใช้ค่านี้ตัดสินว่า "จบหรือยัง"
      // (เกมที่ไม่มี startsAt ด้วยเหตุผลใดก็ตาม ให้เป็น 0 ดีกว่ากลายเป็นยังไม่จบ)
      finishedMs: finishedAt ? Math.max(0, finishedAt.getTime() - (startedAt ?? Date.now())) : null,
    }))
    .sort(compareParticipants);
}

/* ---------------------------------------------------- สถิติสำหรับ admin */

export async function questionStats() {
  const rows = await db
    .select({
      id: question.id,
      text: question.text,
      choices: question.choices,
      correctIndex: question.correctIndex,
      isActive: question.isActive,
      adminComment: question.adminComment,
      // ใช้ FILTER ไม่ใช่ CASE เพราะ left join ทำให้ข้อที่ยังไม่มีใครตอบ
      // ได้แถว NULL หนึ่งแถว ซึ่ง CASE จะนับเป็น "ตอบผิด 1" ทั้งที่ไม่มีใครตอบ
      correctCount: sql<number>`count(${answer.id}) filter (where ${answer.isCorrect})::int`,
      wrongCount: sql<number>`count(${answer.id}) filter (where not ${answer.isCorrect})::int`,
    })
    .from(question)
    .leftJoin(answer, eq(answer.questionId, question.id))
    // ข้อที่ลบไปแล้วไม่ต้องโผล่ในหน้า admin อีก (ยังอยู่ใน db เพื่อไม่ให้สถิติรอบเก่าพัง)
    .where(isNull(question.deletedAt))
    .groupBy(question.id)
    .orderBy(question.createdAt);

  return rows;
}
