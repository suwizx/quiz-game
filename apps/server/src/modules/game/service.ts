import { type Db, createDb } from "@singpore-game/db";
import { answer, game, participant, question, roster } from "@singpore-game/db/schema";
import {
  DEFAULT_DURATION_SEC,
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
  const [counted] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(participant)
    .where(eq(participant.gameId, row.id));

  return {
    id: row.id,
    status: row.status,
    durationSec: row.durationSec,
    startsAt: row.startsAt?.getTime() ?? null,
    endsAt: row.endsAt?.getTime() ?? null,
    playerCount: counted?.count ?? 0,
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

  if (row.currentQuestionId && row.currentServedAt) {
    // ข้อที่ค้างอยู่อาจถูกลบ/ปิดใช้งานไปแล้วระหว่างที่ผู้เล่นกำลังดูอยู่ — ข้ามไปข้อใหม่
    const current = await db.query.question.findFirst({
      where: and(eq(question.id, row.currentQuestionId), servable),
    });
    if (current) return toQuestionView(current, row.questionNumber, row.currentServedAt);
  }

  return advanceQuestion(db, row);
}

async function advanceQuestion(tx: DbOrTx, row: Participant): Promise<QuestionView | null> {
  const ids = await activeQuestionIds();
  const picked = nextQuestion({ queue: row.queue, index: row.queueIndex }, ids);
  if (!picked) return null;

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
  | { ok: false; reason: "not_found" | "stale" | "not_running" }
  | { ok: true; correct: boolean; correctIndex: number; score: PlayerScore; next: QuestionView | null };

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

    const currentGame = await tx.query.game.findFirst({ where: eq(game.id, row.gameId) });
    if (!currentGame || currentGame.status !== "running") {
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
    const responseMs = Date.now() - (row.currentServedAt?.getTime() ?? Date.now());
    const score = applyAnswer(row, isCorrect, responseMs);

    await tx.insert(answer).values({
      gameId: row.gameId,
      participantId: row.id,
      questionId: current.id,
      choiceIndex: input.choiceIndex,
      isCorrect,
      responseMs: Math.max(0, Math.min(responseMs, 2_147_483_647)),
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

    return {
      ok: true,
      correct: isCorrect,
      correctIndex: current.correctIndex,
      score,
      next,
    } as const;
  });
}

/* -------------------------------------------------------- กระดานคะแนน */

export type ScoreboardRow = ScoreRow & { userId: string };

export async function getScoreboard(gameId: string): Promise<ScoreboardRow[]> {
  const rows = await db
    .select({
      participantId: participant.id,
      userId: participant.userId,
      nickname: participant.nickname,
      bestStreak: participant.bestStreak,
      currentStreak: participant.currentStreak,
      correctCount: participant.correctCount,
      wrongCount: participant.wrongCount,
      totalAnswerMs: participant.totalAnswerMs,
    })
    .from(participant)
    .where(eq(participant.gameId, gameId))
    // คนคะแนนเท่ากันต้องเรียงเหมือนเดิมทุกครั้ง ไม่งั้น sort ที่ stable ก็ยัง
    // สลับอันดับได้ตามลำดับแถวที่ Postgres คืนมา แล้วยิง overtake มั่ว
    .orderBy(participant.joinedAt, participant.id);

  return rows.sort(compareParticipants);
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
