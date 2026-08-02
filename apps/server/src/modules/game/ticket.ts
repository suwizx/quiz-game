import { randomUUID } from "node:crypto";

import type { CurrentUser } from "../../lib/session";

/**
 * ตั๋วอายุสั้นสำหรับต่อ WebSocket
 * ใช้แทนการพึ่ง cookie ตอน handshake ซึ่งพังง่ายเมื่อ web กับ server คนละ origin
 * (dev: :3001 ↔ :3000) และเมื่อวิ่งผ่าน Cloudflare Tunnel
 */
const TICKET_TTL_MS = 30_000;

interface Ticket {
  user: CurrentUser;
  expiresAt: number;
}

const tickets = new Map<string, Ticket>();

export function issueTicket(user: CurrentUser): string {
  const id = randomUUID();
  tickets.set(id, { user, expiresAt: Date.now() + TICKET_TTL_MS });
  return id;
}

/** ใช้ได้ครั้งเดียว — ป้องกันตั๋วรั่วแล้วถูกนำไปใช้ซ้ำ */
export function redeemTicket(id: string | null | undefined): CurrentUser | null {
  if (!id) return null;

  const ticket = tickets.get(id);
  if (!ticket) return null;
  tickets.delete(id);

  return ticket.expiresAt < Date.now() ? null : ticket.user;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, ticket] of tickets) {
    if (ticket.expiresAt < now) tickets.delete(id);
  }
}, TICKET_TTL_MS).unref?.();
