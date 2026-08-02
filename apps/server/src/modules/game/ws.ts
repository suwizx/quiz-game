import { randomUUID } from "node:crypto";

import { type ClientEvent, type ServerEvent, isClientEvent } from "@singpore-game/game-core";
import { Elysia, t } from "elysia";

import * as hub from "./hub";
import * as service from "./service";
import { redeemTicket } from "./ticket";

/** ผูก connection id กับผู้ใช้ที่ถือตั๋วนั้น (ws.data ใช้ร่วมกันไม่ได้ระหว่าง handler) */
const sockets = new Map<string, { userId: string; connectionId: string }>();

export const gameSocket = new Elysia().ws("/ws/game", {
  query: t.Object({ ticket: t.String() }),

  open(ws) {
    const user = redeemTicket(ws.data.query.ticket);
    if (!user) {
      ws.send({ t: "error", message: "ตั๋วหมดอายุ กรุณาเชื่อมต่อใหม่" } satisfies ServerEvent);
      ws.close();
      return;
    }

    const connectionId = randomUUID();
    sockets.set(ws.id, { userId: user.id, connectionId });

    hub.addConnection({
      id: connectionId,
      userId: user.id,
      isAdmin: user.isAdmin,
      send: (event) => {
        try {
          ws.send(event);
        } catch {
          // socket ปิดไปแล้ว — ปล่อยให้ close handler เก็บกวาด
        }
      },
    });

    // snapshot ก้อนแรก: client กู้สถานะทั้งหมดจากตรงนี้
    void hub.buildStateFor(user.id).then((event) => {
      if (event) ws.send(event);
    });
  },

  async message(ws, raw) {
    const session = sockets.get(ws.id);
    if (!session) return;

    if (!isClientEvent(raw)) return;
    const event = raw as ClientEvent;

    if (event.t === "pong" || event.t === "hello") {
      const state = await hub.buildStateFor(session.userId);
      if (event.t === "hello" && state) ws.send(state);
      return;
    }

    const current = await service.getCurrentGame();
    if (!current) return;

    const me = await service.getParticipant(current.id, session.userId);
    if (!me) {
      ws.send({ t: "error", message: "ยังไม่ได้เข้าร่วมเกม" } satisfies ServerEvent);
      return;
    }

    const result = await service.submitAnswer({
      participantId: me.id,
      questionId: event.questionId,
      choiceIndex: event.choiceIndex,
    });

    if (!result.ok) {
      // คำตอบไม่ตรงกับข้อที่ค้างอยู่ (กดซ้ำ/ยิงมั่ว) — ส่งข้อปัจจุบันกลับให้ sync
      if (result.reason === "stale") {
        const question = await service.serveQuestion(me.id);
        if (question) ws.send({ t: "question", question } satisfies ServerEvent);
      }
      return;
    }

    ws.send({
      t: "result",
      questionId: event.questionId,
      correct: result.correct,
      correctIndex: result.correctIndex,
      score: result.score,
      next: result.next,
    } satisfies ServerEvent);
  },

  close(ws) {
    const session = sockets.get(ws.id);
    if (!session) return;
    hub.removeConnection(session.connectionId);
    sockets.delete(ws.id);
  },
});
