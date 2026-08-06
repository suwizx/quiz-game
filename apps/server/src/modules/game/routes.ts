import { isDevLoginEnabled, isGoogleAuthConfigured } from "@singpore-game/env/server";
import { NICKNAME_MAX_LENGTH } from "@singpore-game/game-core";
import { Elysia, t } from "elysia";

import { requireUser, withUser } from "../../lib/session";
import * as hub from "./hub";
import * as service from "./service";
import { issueTicket } from "./ticket";

export const gameRoutes = new Elysia({ prefix: "/api/game" })
  .use(withUser)
  .get("/config", ({ user }) => ({
    googleEnabled: isGoogleAuthConfigured,
    devLogin: isDevLoginEnabled,
    user: user && {
      id: user.id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      studentId: user.studentId,
    },
  }))
  .use(requireUser)
  /** ตั๋วอายุ 30 วิ สำหรับ handshake ของ WebSocket */
  .post("/ws-ticket", ({ user }) => ({ ticket: issueTicket(user) }))
  /** ข้อมูลตั้งต้นของหน้าเตรียมตัว: ชื่อที่แนะนำ + สถานะเกม */
  .get("/prepare", async ({ user }) => {
    const current = await service.getOrCreateGame();
    const existing = await service.getParticipant(current.id, user.id);

    return {
      game: await service.toGameState(current),
      nickname: existing?.nickname ?? (await service.suggestedNickname(user.studentId, user.name)),
      joined: !!existing,
      // ค่าตั้งต้นก่อน WS ต่อติด จากนั้น event lobby จะอัปเดตให้ทุกวินาที
      onlineCount: hub.onlineCount(),
      players: await service.listLobbyPlayers(current.id),
    };
  })
  /** เข้าร่วมเกม / เปลี่ยนชื่อเล่น */
  .post(
    "/join",
    async ({ user, body, status }) => {
      const current = await service.getOrCreateGame();
      if (current.status === "ended") {
        return status(409, { message: "เกมรอบนี้จบไปแล้ว" });
      }

      const nickname = body.nickname.trim();
      const row = await service.joinGame({
        gameId: current.id,
        userId: user.id,
        nickname,
        studentId: user.studentId,
      });

      await hub.broadcastLobby(current.id);
      // แท็บอื่นของคนเดียวกันต้องรู้ว่าเข้าร่วมแล้วด้วย ไม่ใช่รู้แค่แท็บที่กด
      await hub.pushStateTo(user.id);
      return { participantId: row.id, nickname: row.nickname };
    },
    {
      body: t.Object({
        nickname: t.String({ minLength: 1, maxLength: NICKNAME_MAX_LENGTH }),
      }),
    },
  );
