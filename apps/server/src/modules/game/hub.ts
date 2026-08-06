import {
  COUNTDOWN_MS,
  HEARTBEAT_INTERVAL_MS,
  TICK_INTERVAL_MS,
  type GameState,
  type GameStatus,
  type QuestionView,
  type ScoreRow,
  type ServerEvent,
  computeOvertakes,
} from "@singpore-game/game-core";

import * as service from "./service";

/** ตัวส่งข้อความหนึ่งการเชื่อมต่อ — ผู้ใช้คนเดียวเปิดได้หลายแท็บ */
export interface Connection {
  id: string;
  userId: string;
  isAdmin: boolean;
  send: (event: ServerEvent) => void;
}

type Participant = NonNullable<Awaited<ReturnType<typeof service.getParticipant>>>;

const connections = new Map<string, Connection>();
/** อันดับล่าสุดของแต่ละ participant ไว้ตรวจว่าใครแซงใคร */
let previousRanks = new Map<string, number>();
let previousNicknames = new Map<string, string>();
/** เกมที่อันดับด้านบนเป็นของรอบนั้น — คนละรอบต้องไม่เอามาเทียบกัน */
let previousGameId: string | null = null;
let loopStarted = false;

export function addConnection(connection: Connection) {
  connections.set(connection.id, connection);
}

export function removeConnection(id: string) {
  connections.delete(id);
}

export function connectionCount() {
  return connections.size;
}

/**
 * จำนวน "คน" ที่เปิดเว็บค้างอยู่ — นับ userId ไม่ซ้ำ ไม่ใช่จำนวน socket
 * คนเดียวเปิดหลายแท็บ (หรือมือถือ+โน้ตบุ๊ก) ต้องนับเป็นหนึ่ง
 */
export function onlineCount() {
  return connectedUserIds().length;
}

function connectedUserIds() {
  return [...new Set([...connections.values()].map((connection) => connection.userId))];
}

export function broadcast(event: ServerEvent) {
  for (const connection of connections.values()) {
    connection.send(event);
  }
}

export function sendToUser(userId: string, event: ServerEvent) {
  for (const connection of connections.values()) {
    if (connection.userId === userId) connection.send(event);
  }
}

/* ------------------------------------------------------------- lobby */

export async function broadcastLobby(gameId: string) {
  const players = await service.listLobbyPlayers(gameId);
  broadcast({ t: "lobby", playerCount: players.length, onlineCount: onlineCount(), players });
  // ตารางผู้เล่น (โดยเฉพาะหน้า admin) อ่านจาก scoreboard ไม่ใช่ lobby
  // ถ้าไม่ push ตรงนี้ คนที่เพิ่ง join ตอนรอเริ่มเกมจะไม่โผล่ในตารางเลย
  await pushScoreboard(gameId);
}

/* --------------------------------------------------- กระดาน + อันดับ */

function toClientRows(rows: service.ScoreboardRow[]): ScoreRow[] {
  // ตัด userId/studentId ทิ้งก่อนส่งออก — กระดานคะแนนทุกคนเห็น
  return rows.map(({ userId: _userId, studentId: _studentId, ...row }) => row);
}

/** อันดับของแต่ละคนจากกระดานที่เรียงมาแล้ว (1 = ที่หนึ่ง) */
function toRankMap(rows: service.ScoreboardRow[]) {
  return new Map(rows.map((row, index) => [row.participantId, index + 1] as const));
}

/**
 * ส่งกระดานคะแนนให้ทุกคน และ (เฉพาะตอนเกมกำลังเล่น) แจ้งว่าใครแซงใคร
 * ตัวตัดสินการแซงอยู่ใน game-core — ที่นี่แค่แปลง participantId เป็นชื่อ
 */
async function pushScoreboard(gameId: string, notifyOvertake = false) {
  const rows = await service.getScoreboard(gameId);
  const clientRows = toClientRows(rows);
  const ranks = toRankMap(rows);

  for (const connection of connections.values()) {
    const mine = rows.find((row) => row.userId === connection.userId);
    connection.send({
      t: "scoreboard",
      rows: clientRows,
      myRank: mine ? (ranks.get(mine.participantId) ?? null) : null,
    });
  }

  // มีแต่ tick ตอนเกมกำลังเล่นที่แตะ state ของอันดับก่อนหน้า ผู้เรียกอื่น
  // (lobby, admin) จะได้ไม่แย่งเขียนจนการเทียบอันดับเพี้ยน
  if (!notifyOvertake) return;

  // ข้ามรอบแล้ว — อันดับของรอบก่อนใช้เทียบไม่ได้
  if (previousGameId !== gameId) {
    previousRanks = new Map();
    previousNicknames = new Map();
    previousGameId = gameId;
  }

  if (previousRanks.size > 0) {
    const byId = new Map(rows.map((row) => [row.participantId, row] as const));

    for (const [participantId, overtake] of computeOvertakes(previousRanks, ranks)) {
      const me = byId.get(participantId);
      if (!me) continue;

      const nickname =
        byId.get(overtake.counterpartId)?.nickname ??
        previousNicknames.get(overtake.counterpartId) ??
        "ผู้เล่นคนอื่น";

      sendToUser(me.userId, { t: "overtake", kind: overtake.kind, nickname });
    }
  }

  previousRanks = ranks;
  previousNicknames = new Map(rows.map((row) => [row.participantId, row.nickname] as const));
}

export async function pushScoreboardNow() {
  const current = await service.getCurrentGame();
  if (current) await pushScoreboard(current.id);
}

/* ------------------------------------------------- วงจรชีวิตของเกม */

export async function startGame(gameId: string) {
  const row = await service.startCountdown(gameId, COUNTDOWN_MS);
  if (!row?.startsAt) return null;

  broadcast({ t: "countdown", startsAt: row.startsAt.getTime() });
  await broadcastState();
  return row;
}

/**
 * งานที่ต้อง "เขียน" db ของผู้เล่นหนึ่งคน — serveQuestion อาจเสิร์ฟข้อใหม่
 * หรือตี finishedAt ให้คนที่เล่นครบ
 *
 * ⚠️ ต้องรันส่วนนี้ให้ครบทุกคนก่อนอ่านกระดานคะแนนเสมอ ไม่งั้นคนที่เพิ่งเล่นครบพอดี
 * จะได้ finishedMs = null แล้วค้างอยู่หน้า "กำลังโหลดคำถาม" เพราะไม่รู้ว่าตัวเองจบแล้ว
 */
async function serveFor(gameId: string, status: GameStatus, userId: string) {
  const me = await service.getParticipant(gameId, userId);
  if (!me) return { me: null, question: null };

  // ส่งคำถามให้เฉพาะตอนเกมกำลังเล่นอยู่ — ยังไม่เริ่ม/จบแล้วไม่ต้องมีข้อค้าง
  const question = status === "running" ? await service.serveQuestion(me.id) : null;
  return { me, question };
}

/** ประกอบ snapshot ของผู้ใช้คนเดียวจากข้อมูลที่โหลดมาแล้ว — ไม่แตะ db */
function toStateEvent(input: {
  state: GameState;
  rows: service.ScoreboardRow[];
  me: Participant | null;
  question: QuestionView | null;
}): ServerEvent {
  const { state, rows, me, question } = input;
  if (!me) return { t: "state", game: state, me: null, onlineCount: onlineCount() };

  const rank = rows.findIndex((row) => row.participantId === me.id) + 1;
  const mine = rows.find((row) => row.participantId === me.id);

  return {
    t: "state",
    game: state,
    onlineCount: onlineCount(),
    me: {
      participantId: me.id,
      nickname: me.nickname,
      rank: rank || rows.length + 1,
      currentStreak: me.currentStreak,
      bestStreak: me.bestStreak,
      correctCount: me.correctCount,
      wrongCount: me.wrongCount,
      totalAnswerMs: me.totalAnswerMs,
      question,
      finishedMs: mine?.finishedMs ?? null,
    },
  };
}

/**
 * snapshot เต็มก้อนเดียวสำหรับผู้ใช้หนึ่งคน — client ใช้กู้สถานะทั้งหมด
 * หลัง refresh หรือเน็ตหลุด โดยไม่ต้องจำอะไรไว้เองเลย
 */
export async function buildStateFor(userId: string): Promise<ServerEvent | null> {
  const current = await service.getCurrentGame();
  if (!current) return null;

  const state = await service.toGameState(current);
  const served = await serveFor(current.id, current.status, userId);
  // ไม่ได้อยู่ในรอบนี้ก็ไม่ต้องอ่านกระดาน (เช่น admin ที่ไม่ได้ลงเล่น)
  const rows = served.me ? await service.getScoreboard(current.id) : [];

  return toStateEvent({ state, rows, ...served });
}

/** ส่ง snapshot ให้ผู้ใช้คนเดียว — ใช้ตอนสถานะของเขาเปลี่ยนคนเดียว เช่นเพิ่งกดเข้าร่วม */
export async function pushStateTo(userId: string) {
  const event = await buildStateFor(userId);
  if (event) sendToUser(userId, event);
}

export async function broadcastState() {
  const userIds = connectedUserIds();
  if (userIds.length === 0) return;

  const current = await service.getCurrentGame();
  if (!current) return;

  const state = await service.toGameState(current);

  // เฟส 1: งานที่เขียน db ต้องเสร็จให้ครบทุกคนก่อน (ดูคำเตือนใน serveFor)
  // นับ userId ไม่ซ้ำด้วย — คนเดียวเปิดสามแท็บไม่ต้องยิง query สามชุด
  const served = new Map<string, Awaited<ReturnType<typeof serveFor>>>();
  for (const userId of userIds) {
    served.set(userId, await serveFor(current.id, current.status, userId));
  }

  // เฟส 2: อ่านกระดานครั้งเดียว (เดิมอ่านใหม่ทุก connection = สแกนตารางซ้ำ ๆ)
  const anyPlayer = [...served.values()].some((entry) => entry.me);
  const rows = anyPlayer ? await service.getScoreboard(current.id) : [];

  // เฟส 3: ประกอบแล้วส่งให้ทุกแท็บของแต่ละคน
  for (const [userId, entry] of served) {
    sendToUser(userId, toStateEvent({ state, rows, ...entry }));
  }
}

/** จบเกม: freeze กระดานแล้วบอกทุกคนพร้อมกัน */
export async function finishGame(gameId: string) {
  await service.endGame(gameId);
  await pushScoreboard(gameId);
  broadcast({ t: "ended" });
  await broadcastState();
}

/**
 * ลูปกลางของเซิร์ฟเวอร์
 * - ทุก 1 วิ: เดินสถานะเกม + ส่ง tick และกระดานคะแนน
 * - ทุก 25 วิ: ส่ง ping กัน Cloudflare Tunnel ตัด connection ที่เงียบ
 */
export function startLoop() {
  if (loopStarted) return;
  loopStarted = true;

  let ticking = false;
  setInterval(() => {
    // รอบก่อนยังไม่จบ — ข้ามรอบนี้ ไม่ใช่รันทับกันจนอันดับที่ใช้เทียบเพี้ยน
    // หรือเผลอเรียก finishGame สองครั้ง
    if (ticking) return;
    ticking = true;
    void tick().finally(() => {
      ticking = false;
    });
  }, TICK_INTERVAL_MS);

  setInterval(() => {
    broadcast({ t: "ping" });
  }, HEARTBEAT_INTERVAL_MS);
}

async function tick() {
  const current = await service.getCurrentGame();
  if (!current) return;

  const now = Date.now();

  // เดินสถานะต่อแม้ไม่มีใครต่ออยู่ — ถ้าหลุดยกห้อง (tunnel ตาย) แล้วหยุดเดิน
  // เกมจะค้างที่ countdown/running จนกว่าจะมีคนกลับมา
  if (current.status === "countdown" && current.startsAt && now >= current.startsAt.getTime()) {
    await service.markRunning(current.id);
    await broadcastState();
    return;
  }

  if (current.status === "running") {
    const endsAt = current.endsAt?.getTime() ?? now;
    if (now >= endsAt) {
      await finishGame(current.id);
      return;
    }

    if (connections.size === 0) return;

    broadcast({
      t: "tick",
      remainingMs: endsAt - now,
      serverNow: now,
      onlineCount: onlineCount(),
    });
    await pushScoreboard(current.id, true);
    return;
  }

  // ไม่มีใครฟังก็ไม่ต้อง broadcast ต่อ
  if (connections.size === 0) return;

  if (current.status === "lobby" || current.status === "countdown") {
    await broadcastLobby(current.id);
  }
}
