import type { PlayerScore } from "./scoring";

export type GameStatus = "lobby" | "countdown" | "running" | "ended";

export interface GameState {
  id: string;
  status: GameStatus;
  durationSec: number;
  /** epoch ms — มีค่าเมื่อ status เป็น countdown ขึ้นไป */
  startsAt: number | null;
  endsAt: number | null;
  playerCount: number;
}

/** คำถามที่ส่งให้ client — ไม่มี correctIndex เด็ดขาด */
export interface QuestionView {
  id: string;
  text: string;
  choices: string[];
  /** ลำดับข้อที่ผู้เล่นคนนี้เจอ (นับจาก 1) ไว้โชว์ว่า "ข้อที่ N" */
  number: number;
  /** epoch ms ที่ server เริ่มจับเวลาข้อนี้ — reconnect แล้วเวลาไม่รีเซ็ต */
  servedAt: number;
}

export interface PlayerState extends PlayerScore {
  nickname: string;
  rank: number;
  question: QuestionView | null;
}

export interface ScoreRow {
  participantId: string;
  nickname: string;
  bestStreak: number;
  currentStreak: number;
  correctCount: number;
  wrongCount: number;
  totalAnswerMs: number;
  isMe?: boolean;
}

export interface LobbyPlayer {
  participantId: string;
  nickname: string;
}

export type ServerEvent =
  /** snapshot เต็มก้อนแรกหลังต่อ WS ได้ — ใช้กู้สถานะหลัง refresh/เน็ตหลุด */
  | { t: "state"; game: GameState; me: PlayerState | null }
  | { t: "lobby"; playerCount: number; players: LobbyPlayer[] }
  | { t: "countdown"; startsAt: number }
  | { t: "question"; question: QuestionView }
  | {
      t: "result";
      questionId: string;
      correct: boolean;
      correctIndex: number;
      score: PlayerScore;
      next: QuestionView | null;
    }
  | { t: "tick"; remainingMs: number; serverNow: number }
  | { t: "scoreboard"; rows: ScoreRow[]; myRank: number | null }
  | { t: "overtake"; kind: "passed" | "passed_by"; nickname: string }
  | { t: "ended" }
  | { t: "ping" }
  | { t: "error"; message: string };

export type ClientEvent =
  | { t: "hello" }
  | { t: "answer"; questionId: string; choiceIndex: number }
  | { t: "pong" };

export function isClientEvent(value: unknown): value is ClientEvent {
  if (typeof value !== "object" || value === null) return false;
  const t = (value as { t?: unknown }).t;
  return t === "hello" || t === "answer" || t === "pong";
}
