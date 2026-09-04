import { env } from "@singpore-game/env/web";
import type { GameState, LobbyPlayer, ScoreRow } from "@singpore-game/game-core";

const SERVER_URL = env.VITE_SERVER_URL.replace(/\/$/, "");

export function getGuestId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "oph_guest_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `guest_${crypto.randomUUID().replace(/-/g, "")}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function getAdminPinToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("oph_admin_pin_token");
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const guestId = getGuestId();
  const adminPinToken = getAdminPinToken();
  const response = await fetch(`${SERVER_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(guestId ? { "x-guest-id": guestId } : {}),
      ...(adminPinToken ? { "x-admin-pin": adminPinToken } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(body?.message ?? `คำขอล้มเหลว (${response.status})`, response.status);
  }

  return (await response.json()) as T;
}

/**
 * โหลดไฟล์จาก endpoint ที่ต้องใช้ cookie ผ่าน fetch แล้วค่อยยัดใส่ <a download>
 * ใช้ลิงก์ตรง ๆ ไม่ได้เพราะตอน dev คนละ origin กัน (web 3001 → server 3000)
 */
async function download(path: string, fallbackName: string) {
  const guestId = getGuestId();
  const response = await fetch(`${SERVER_URL}${path}`, {
    credentials: "include",
    headers: {
      ...(guestId ? { "x-guest-id": guestId } : {}),
    },
  });
  if (!response.ok) {
    throw new ApiError(`ดาวน์โหลดไม่สำเร็จ (${response.status})`, response.status);
  }

  const disposition = response.headers.get("content-disposition") ?? "";
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const url = URL.createObjectURL(await response.blob());

  const link = document.createElement("a");
  link.href = url;
  link.download = encoded ? decodeURIComponent(encoded) : fallbackName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const post = <T,>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

const patch = <T,>(path: string, body: unknown) =>
  request<T>(path, { method: "PATCH", body: JSON.stringify(body) });

/* ------------------------------------------------------------- ผู้เล่น */

export interface AppConfig {
  googleEnabled: boolean;
  /** เข้าสู่ระบบด้วยอีเมล/รหัสผ่านสำหรับทดสอบตอน dev เท่านั้น */
  devLogin: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    isAdmin: boolean;
    studentId: string | null;
  } | null;
}

export interface PrepareData {
  game: GameState;
  nickname: string;
  joined: boolean;
  isAdmin: boolean;
  onlineCount: number;
  players: LobbyPlayer[];
}

export const api = {
  config: () => request<AppConfig>("/api/game/config"),
  prepare: () => request<PrepareData>("/api/game/prepare"),
  join: (nickname: string) =>
    post<{ participantId: string; nickname: string }>("/api/game/join", { nickname }),
  wsTicket: () => post<{ ticket: string }>("/api/game/ws-ticket"),

  admin: {
    game: () => request<{ game: GameState; scoreboard: ScoreRow[] }>("/api/admin/game"),
    setDuration: (durationSec: number) =>
      patch<GameState>("/api/admin/game/duration", { durationSec }),
    start: () => post<GameState>("/api/admin/game/start"),
    end: () => post<{ ok: true }>("/api/admin/game/end"),
    reset: () => post<GameState>("/api/admin/game/reset"),
    exportScoreboard: () => download("/api/admin/export/scoreboard.csv", "scoreboard.csv"),
    questions: () => request<AdminQuestion[]>("/api/admin/questions"),
    createQuestion: (body: QuestionInput) => post<AdminQuestion>("/api/admin/questions", body),
    updateQuestion: (id: string, body: Partial<QuestionInput>) =>
      patch<AdminQuestion>(`/api/admin/questions/${id}`, body),
    deleteQuestion: (id: string) =>
      request<{ ok: true }>(`/api/admin/questions/${id}`, { method: "DELETE" }),
    admins: () => request<AdminEntry[]>("/api/admin/admins"),
    addAdmin: (email: string, note?: string | null) =>
      post<AdminEntry>("/api/admin/admins", { email, note }),
    removeAdmin: (email: string) =>
      request<{ ok: true }>(`/api/admin/admins/${encodeURIComponent(email)}`, { method: "DELETE" }),
    pinStatus: () => request<{ verified: boolean }>("/api/admin/pin-status"),
    verifyPin: async (pin: string) => {
      const res = await post<{ ok: true; token: string }>("/api/admin/verify-pin", { pin });
      if (typeof window !== "undefined" && res.token) {
        localStorage.setItem("oph_admin_pin_token", res.token);
      }
      return res;
    },
    clearPin: () => {
      if (typeof window !== "undefined") {
        localStorage.removeItem("oph_admin_pin_token");
      }
    },
  },
};

export interface QuestionInput {
  text: string;
  choices: string[];
  correctIndex: number;
  isActive?: boolean;
  adminComment?: string | null;
}

export interface AdminEntry {
  email: string;
  addedByEmail: string | null;
  note: string | null;
  createdAt: string | null;
  /** มาจาก ADMIN_EMAILS — ถอดสิทธิ์ผ่านหน้านี้ไม่ได้ */
  isRoot: boolean;
  isSelf: boolean;
}

export interface AdminQuestion {
  id: string;
  text: string;
  choices: string[];
  correctIndex: number;
  isActive: boolean;
  adminComment: string | null;
  correctCount: number;
  wrongCount: number;
}

/** URL ของ WebSocket แปลงจาก http(s) เป็น ws(s) */
export function socketUrl(ticket: string) {
  const base = SERVER_URL.replace(/^http/, "ws");
  return `${base}/ws/game?ticket=${encodeURIComponent(ticket)}`;
}
