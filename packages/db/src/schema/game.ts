import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/** รายชื่อนักศึกษาจาก docs/IPA 2026 Sheet1.csv ใช้ตั้งชื่อเล่นตั้งต้น */
export const roster = pgTable("roster", {
  studentId: text("student_id").primaryKey(),
  fullnameTh: text("fullname_th").notNull(),
  fullnameEn: text("fullname_en"),
  sequence: integer("sequence"),
});

export const question = pgTable(
  "question",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    text: text("text").notNull(),
    /** ตัวเลือก 4 ข้อ — ตรวจความยาวที่ชั้น API */
    choices: jsonb("choices").$type<string[]>().notNull(),
    correctIndex: integer("correct_index").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    /** โน้ตภายในของ admin — ผู้เล่นไม่มีทางเห็น */
    adminComment: text("admin_comment"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("question_active_idx").on(table.isActive)],
);

export const gameStatus = pgEnum("game_status", ["lobby", "countdown", "running", "ended"]);

export const game = pgTable(
  "game",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: gameStatus("status").default("lobby").notNull(),
    durationSec: integer("duration_sec").default(300).notNull(),
    /** เวลาที่เกมเริ่มจริง (หลังนับถอยหลัง 3..2..1 จบ) */
    startsAt: timestamp("starts_at"),
    endsAt: timestamp("ends_at"),
    endedAt: timestamp("ended_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("game_status_idx").on(table.status)],
);

export const participant = pgTable(
  "participant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    nickname: text("nickname").notNull(),
    studentId: text("student_id"),

    currentStreak: integer("current_streak").default(0).notNull(),
    bestStreak: integer("best_streak").default(0).notNull(),
    correctCount: integer("correct_count").default(0).notNull(),
    wrongCount: integer("wrong_count").default(0).notNull(),
    totalAnswerMs: bigint("total_answer_ms", { mode: "number" }).default(0).notNull(),

    /** คิวคำถามส่วนตัว (สุ่มแยกรายคน) + ตำแหน่งปัจจุบันในคิว */
    queue: jsonb("queue").$type<string[]>().default([]).notNull(),
    queueIndex: integer("queue_index").default(0).notNull(),
    /** ข้อที่ค้างอยู่ — reconnect แล้วต้องได้ข้อเดิมและเวลาเดิม */
    currentQuestionId: uuid("current_question_id").references(() => question.id, {
      onDelete: "set null",
    }),
    currentServedAt: timestamp("current_served_at"),
    questionNumber: integer("question_number").default(0).notNull(),

    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("participant_game_user_unique").on(table.gameId, table.userId),
    index("participant_game_idx").on(table.gameId),
  ],
);

export const answer = pgTable(
  "answer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participant.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => question.id, { onDelete: "cascade" }),
    choiceIndex: integer("choice_index").notNull(),
    isCorrect: boolean("is_correct").notNull(),
    responseMs: integer("response_ms").notNull(),
    streakAfter: integer("streak_after").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  // ไม่ทำ unique (participant, question) เพราะคำถามวนซ้ำได้เมื่อเล่นครบพูล
  // การกันตอบซ้ำใช้การเทียบกับ participant.currentQuestionId ใน transaction แทน
  (table) => [
    index("answer_question_idx").on(table.questionId),
    index("answer_participant_idx").on(table.participantId),
  ],
);

export const gameRelations = relations(game, ({ many }) => ({
  participants: many(participant),
}));

export const participantRelations = relations(participant, ({ one, many }) => ({
  game: one(game, { fields: [participant.gameId], references: [game.id] }),
  user: one(user, { fields: [participant.userId], references: [user.id] }),
  answers: many(answer),
}));

export const answerRelations = relations(answer, ({ one }) => ({
  participant: one(participant, {
    fields: [answer.participantId],
    references: [participant.id],
  }),
  question: one(question, { fields: [answer.questionId], references: [question.id] }),
}));
