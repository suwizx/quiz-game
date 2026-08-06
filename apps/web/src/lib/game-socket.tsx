import {
  type ClientEvent,
  type GameState,
  type PlayerScore,
  type QuestionView,
  type ScoreRow,
  type ServerEvent,
  emptyScore,
} from "@singpore-game/game-core";
import {
  type ReactNode,
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { api, socketUrl } from "./api";

export interface OvertakeNotice {
  id: number;
  kind: "passed" | "passed_by";
  nickname: string;
}

export interface AnswerResult {
  questionId: string;
  correct: boolean;
  correctIndex: number;
}

interface GameSocketValue {
  connected: boolean;
  /** เคยต่อติดแล้วหลุด — ใช้แยกจากการต่อครั้งแรกเพื่อไม่ขึ้นแบนเนอร์เตือนโดยไม่จำเป็น */
  reconnecting: boolean;
  game: GameState | null;
  /** คนที่เปิดเว็บค้างอยู่ตอนนี้ (นับคนไม่ซ้ำ) — null คือยังไม่รู้ ยังไม่ได้ snapshot แรก */
  onlineCount: number | null;
  /** อยู่ในเกมรอบปัจจุบันแล้วหรือยัง — null คือยังไม่ได้ snapshot แรกจาก server */
  joined: boolean | null;
  /** ตอบครบทุกข้อแล้ว — เวลาที่ใช้ (ms) null คือยังเล่นอยู่ */
  finishedMs: number | null;
  nickname: string | null;
  score: PlayerScore;
  rank: number | null;
  question: QuestionView | null;
  scoreboard: ScoreRow[];
  remainingMs: number | null;
  lastResult: AnswerResult | null;
  notices: OvertakeNotice[];
  dismissNotice: (id: number) => void;
  answer: (questionId: string, choiceIndex: number) => void;
}

const GameSocketContext = createContext<GameSocketValue | null>(null);

const MAX_BACKOFF_MS = 8000;

export function GameSocketProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [game, setGame] = useState<GameState | null>(null);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [joined, setJoined] = useState<boolean | null>(null);
  const [finishedMs, setFinishedMs] = useState<number | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);
  const [score, setScore] = useState<PlayerScore>(emptyScore);
  const [rank, setRank] = useState<number | null>(null);
  const [question, setQuestion] = useState<QuestionView | null>(null);
  const [scoreboard, setScoreboard] = useState<ScoreRow[]>([]);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<AnswerResult | null>(null);
  const [notices, setNotices] = useState<OvertakeNotice[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);
  const noticeIdRef = useRef(0);

  const send = useCallback((event: ClientEvent) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(event));
    }
  }, []);

  const handleEvent = useCallback((event: ServerEvent) => {
    switch (event.t) {
      case "state":
        setGame(event.game);
        setOnlineCount(event.onlineCount);
        setJoined(Boolean(event.me));
        if (event.me) {
          setNickname(event.me.nickname);
          setRank(event.me.rank);
          setQuestion(event.me.question);
          setFinishedMs(event.me.finishedMs);
          setScore({
            currentStreak: event.me.currentStreak,
            bestStreak: event.me.bestStreak,
            correctCount: event.me.correctCount,
            wrongCount: event.me.wrongCount,
            totalAnswerMs: event.me.totalAnswerMs,
          });
        } else {
          // ยังไม่ได้อยู่ในเกมนี้ (เช่น admin เพิ่งเปิดรอบใหม่) — ล้างของรอบก่อนทิ้ง
          setRank(null);
          setQuestion(null);
          setScore(emptyScore());
          setLastResult(null);
          setRemainingMs(null);
          setFinishedMs(null);
        }
        break;
      case "lobby":
        setGame((current) => (current ? { ...current, playerCount: event.playerCount } : current));
        setOnlineCount(event.onlineCount);
        break;
      case "countdown":
        setGame((current) =>
          current ? { ...current, status: "countdown", startsAt: event.startsAt } : current,
        );
        break;
      case "question":
        setQuestion(event.question);
        break;
      case "result":
        setScore(event.score);
        setLastResult({
          questionId: event.questionId,
          correct: event.correct,
          correctIndex: event.correctIndex,
        });
        setQuestion(event.next);
        break;
      case "tick":
        setRemainingMs(event.remainingMs);
        setOnlineCount(event.onlineCount);
        break;
      case "scoreboard":
        setScoreboard(event.rows);
        setRank(event.myRank);
        break;
      case "overtake":
        setNotices((current) => [
          ...current.slice(-2),
          { id: ++noticeIdRef.current, kind: event.kind, nickname: event.nickname },
        ]);
        break;
      case "ended":
        setGame((current) => (current ? { ...current, status: "ended" } : current));
        setQuestion(null);
        setRemainingMs(0);
        break;
      case "ping":
        break;
    }
  }, []);

  // ตัวชี้ไปยัง connect ล่าสุด — ตัดวงจรอ้างอิงระหว่าง connect กับ scheduleReconnect
  const connectRef = useRef<() => void>(() => {});

  const scheduleReconnect = useCallback(() => {
    if (closedRef.current) return;

    setReconnecting(true);
    // ถอยห่างขึ้นเรื่อย ๆ 1s → 8s กันยิงถล่ม server ตอน tunnel หรือ server รีสตาร์ต
    const delay = Math.min(1000 * 2 ** retryRef.current, MAX_BACKOFF_MS);
    retryRef.current += 1;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => connectRef.current(), delay);
  }, []);

  const connect = useCallback(async () => {
    if (closedRef.current) return;

    try {
      const { ticket } = await api.wsTicket();
      if (closedRef.current) return;

      const socket = new WebSocket(socketUrl(ticket));
      socketRef.current = socket;

      socket.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
        setReconnecting(false);
      };

      socket.onmessage = (message) => {
        try {
          const parsed = JSON.parse(message.data as string) as ServerEvent;
          if (parsed.t === "ping") send({ t: "pong" });
          handleEvent(parsed);
        } catch {
          // ข้อความที่ parse ไม่ได้ — ข้ามไป
        }
      };

      socket.onclose = () => {
        setConnected(false);
        socketRef.current = null;
        scheduleReconnect();
      };

      socket.onerror = () => socket.close();
    } catch {
      scheduleReconnect();
    }
  }, [handleEvent, send, scheduleReconnect]);

  useEffect(() => {
    connectRef.current = () => void connect();
  }, [connect]);

  useEffect(() => {
    closedRef.current = false;
    void connect();

    // กลับมาที่แท็บหรือเน็ตกลับมา → ต่อใหม่ทันทีไม่ต้องรอ backoff
    const revive = () => {
      if (document.visibilityState !== "visible") return;
      if (socketRef.current?.readyState === WebSocket.OPEN) return;
      retryRef.current = 0;
      if (timerRef.current) clearTimeout(timerRef.current);
      void connect();
    };

    document.addEventListener("visibilitychange", revive);
    window.addEventListener("online", revive);

    return () => {
      closedRef.current = true;
      document.removeEventListener("visibilitychange", revive);
      window.removeEventListener("online", revive);
      if (timerRef.current) clearTimeout(timerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connect]);

  const answer = useCallback(
    (questionId: string, choiceIndex: number) => {
      send({ t: "answer", questionId, choiceIndex });
    },
    [send],
  );

  const dismissNotice = useCallback((id: number) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
  }, []);

  const value = useMemo<GameSocketValue>(
    () => ({
      connected,
      reconnecting,
      game,
      onlineCount,
      joined,
      finishedMs,
      nickname,
      score,
      rank,
      question,
      scoreboard,
      remainingMs,
      lastResult,
      notices,
      dismissNotice,
      answer,
    }),
    [
      connected,
      reconnecting,
      game,
      onlineCount,
      joined,
      finishedMs,
      nickname,
      score,
      rank,
      question,
      scoreboard,
      remainingMs,
      lastResult,
      notices,
      dismissNotice,
      answer,
    ],
  );

  return <GameSocketContext value={value}>{children}</GameSocketContext>;
}

export function useGameSocket() {
  const value = use(GameSocketContext);
  if (!value) throw new Error("useGameSocket ต้องอยู่ภายใต้ GameSocketProvider");
  return value;
}
