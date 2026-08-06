import {
  COUNTDOWN_MS,
  HEARTBEAT_INTERVAL_MS,
  TICK_INTERVAL_MS,
  type ScoreRow,
  type ServerEvent,
} from "@singpore-game/game-core";

import * as service from "./service";

/** ตัวส่งข้อความหนึ่งการเชื่อมต่อ — ผู้ใช้คนเดียวเปิดได้หลายแท็บ */
export interface Connection {
  id: string;
  userId: string;
  isAdmin: boolean;
  send: (event: ServerEvent) => void;
}

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
  broadcast({ t: "lobby", playerCount: players.length, players });
  // ตารางผู้เล่น (โดยเฉพาะหน้า admin) อ่านจาก scoreboard ไม่ใช่ lobby
  // ถ้าไม่ push ตรงนี้ คนที่เพิ่ง join ตอนรอเริ่มเกมจะไม่โผล่ในตารางเลย
  await pushScoreboard(gameId);
}

/* --------------------------------------------------- กระดาน + อันดับ */

function toClientRows(rows: service.ScoreboardRow[]): ScoreRow[] {
  // ตัด userId/studentId ทิ้งก่อนส่งออก — กระดานคะแนนทุกคนเห็น
  return rows.map(({ userId: _userId, studentId: _studentId, ...row }) => row);
}

/**
 * ส่งกระดานคะแนนให้ทุกคน และ (เฉพาะตอนเกมกำลังเล่น) หาว่าใครเพิ่งถูกแซง/แซงคนอื่น
 * เทียบเฉพาะคู่ที่สลับตำแหน่งกันจริง ๆ และส่งได้สูงสุด 1 event ต่อคนต่อรอบ
 */
async function pushScoreboard(gameId: string, notifyOvertake = false) {
  const rows = await service.getScoreboard(gameId);
  const clientRows = toClientRows(rows);

  const ranks = new Map<string, number>();
  const nicknames = new Map<string, string>();
  rows.forEach((row, index) => {
    ranks.set(row.participantId, index + 1);
    nicknames.set(row.participantId, row.nickname);
  });

  for (const connection of connections.values()) {
    const mine = rows.find((row) => row.userId === connection.userId);
    connection.send({
      t: "scoreboard",
      rows: clientRows,
      myRank: mine ? (ranks.get(mine.participantId) ?? null) : null,
    });
  }

  // ข้ามรอบแล้ว — อันดับของรอบก่อนใช้เทียบไม่ได้
  if (previousGameId !== gameId) {
    previousRanks = new Map();
    previousNicknames = new Map();
    previousGameId = gameId;
  }

  if (notifyOvertake && previousRanks.size > 0) {
    for (const row of rows) {
      const before = previousRanks.get(row.participantId);
      const after = ranks.get(row.participantId);
      if (before === undefined || after === undefined || before === after) continue;

      // หาคู่ที่สลับกับเราจริง ๆ: คนที่ตอนนี้อยู่ตำแหน่งที่เราเคยอยู่
      const counterpart = rows.find((other) => ranks.get(other.participantId) === before);
      if (!counterpart || counterpart.participantId === row.participantId) continue;

      const counterpartName =
        nicknames.get(counterpart.participantId) ??
        previousNicknames.get(counterpart.participantId) ??
        "ผู้เล่นคนอื่น";

      sendToUser(row.userId, {
        t: "overtake",
        kind: after < before ? "passed" : "passed_by",
        nickname: counterpartName,
      });
    }
  }

  previousRanks = ranks;
  previousNicknames = nicknames;
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
 * snapshot เต็มก้อนเดียวสำหรับผู้ใช้หนึ่งคน — client ใช้กู้สถานะทั้งหมด
 * หลัง refresh หรือเน็ตหลุด โดยไม่ต้องจำอะไรไว้เองเลย
 */
export async function buildStateFor(userId: string): Promise<ServerEvent | null> {
  const current = await service.getCurrentGame();
  if (!current) return null;

  const state = await service.toGameState(current);
  const me = await service.getParticipant(current.id, userId);
  if (!me) return { t: "state", game: state, me: null };

  const rows = await service.getScoreboard(current.id);
  const rank = rows.findIndex((row) => row.participantId === me.id) + 1;

  // ส่งคำถามให้เฉพาะตอนเกมกำลังเล่นอยู่ — ยังไม่เริ่ม/จบแล้วไม่ต้องมีข้อค้าง
  const question = current.status === "running" ? await service.serveQuestion(me.id) : null;

  return {
    t: "state",
    game: state,
    me: {
      nickname: me.nickname,
      rank: rank || rows.length + 1,
      currentStreak: me.currentStreak,
      bestStreak: me.bestStreak,
      correctCount: me.correctCount,
      wrongCount: me.wrongCount,
      totalAnswerMs: me.totalAnswerMs,
      question,
    },
  };
}

/** ส่ง snapshot ให้ผู้ใช้คนเดียว — ใช้ตอนสถานะของเขาเปลี่ยนคนเดียว เช่นเพิ่งกดเข้าร่วม */
export async function pushStateTo(userId: string) {
  const event = await buildStateFor(userId);
  if (event) sendToUser(userId, event);
}

export async function broadcastState() {
  for (const connection of connections.values()) {
    const event = await buildStateFor(connection.userId);
    if (event) connection.send(event);
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

  setInterval(() => {
    void tick();
  }, TICK_INTERVAL_MS);

  setInterval(() => {
    broadcast({ t: "ping" });
  }, HEARTBEAT_INTERVAL_MS);
}

async function tick() {
  if (connections.size === 0) return;

  const current = await service.getCurrentGame();
  if (!current) return;

  const now = Date.now();

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

    broadcast({ t: "tick", remainingMs: endsAt - now, serverNow: now });
    await pushScoreboard(current.id, true);
    return;
  }

  if (current.status === "lobby" || current.status === "countdown") {
    await broadcastLobby(current.id);
  }
}
