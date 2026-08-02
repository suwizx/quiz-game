import { STREAK_BAR_MAX } from "@singpore-game/game-core";
import { Button } from "@singpore-game/ui/components/button";
import { StreakPipe } from "@singpore-game/ui/components/streak-pipe";
import { cn } from "@singpore-game/ui/lib/utils";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Check, ChevronsDown, ChevronsUp, ListOrdered, Timer, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useGameSocket } from "@/lib/game-socket";

export const Route = createFileRoute("/_game/play")({
  component: PlayPage,
});

const CHOICE_LABELS = ["ก", "ข", "ค", "ง"];
/** โชว์ผลถูก/ผิดสั้น ๆ ก่อนสไลด์ไปข้อถัดไป */
const FEEDBACK_MS = 350;

function PlayPage() {
  const { question, score, rank, remainingMs, lastResult, answer, notices, dismissNotice } =
    useGameSocket();

  const [picked, setPicked] = useState<number | null>(null);
  const pendingRef = useRef<string | null>(null);

  // ล้างตัวเลือกที่กดค้างไว้เมื่อคำถามเปลี่ยนเป็นข้อใหม่
  useEffect(() => {
    if (!question) return;
    if (pendingRef.current !== question.id) {
      pendingRef.current = question.id;
      const id = setTimeout(() => setPicked(null), FEEDBACK_MS);
      return () => clearTimeout(id);
    }
  }, [question]);

  const choose = (index: number) => {
    if (!question || picked !== null) return;
    setPicked(index);
    answer(question.id, index);
  };

  const wasCorrect = lastResult && picked !== null ? lastResult.correct : null;

  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto] overflow-hidden">
      <TopBar remainingMs={remainingMs} correct={score.correctCount} wrong={score.wrongCount} rank={rank} />

      <div className="grid min-h-0 grid-cols-[auto_1fr] gap-3 overflow-hidden px-3 py-3">
        <StreakPipe value={score.currentStreak} max={STREAK_BAR_MAX} />

        <div className="flex min-h-0 flex-col gap-3">
          {question ? (
            <>
              <div className="flex min-h-0 flex-1 flex-col justify-center">
                <p className="text-muted-foreground text-xs">ข้อที่ {question.number}</p>
                <h2 className="mt-1 text-balance font-semibold text-lg leading-snug">
                  {question.text}
                </h2>
              </div>

              <div className="grid shrink-0 gap-2">
                {question.choices.map((choice, index) => {
                  const isPicked = picked === index;
                  return (
                    <button
                      key={`${question.id}-${index}`}
                      type="button"
                      disabled={picked !== null}
                      onClick={() => choose(index)}
                      className={cn(
                        "flex min-h-12 w-full items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left text-sm transition-colors",
                        "active:scale-[0.99] disabled:opacity-60 motion-reduce:active:scale-100",
                        !isPicked && "hover:bg-muted",
                        isPicked && wasCorrect === true && "border-primary bg-primary/15",
                        isPicked && wasCorrect === false && "border-destructive bg-destructive/15",
                        isPicked && wasCorrect === null && "bg-muted",
                      )}
                    >
                      <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-muted font-medium text-xs">
                        {CHOICE_LABELS[index]}
                      </span>
                      <span className="flex-1">{choice}</span>
                      {isPicked && wasCorrect === true && <Check className="size-4 text-primary" />}
                      {isPicked && wasCorrect === false && (
                        <X className="size-4 text-destructive" />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-center text-muted-foreground text-sm">
              กำลังโหลดคำถาม…
            </div>
          )}
        </div>
      </div>

      <EventBar notices={notices} onDismiss={dismissNotice} />
    </div>
  );
}

function TopBar({
  remainingMs,
  correct,
  wrong,
  rank,
}: {
  remainingMs: number | null;
  correct: number;
  wrong: number;
  rank: number | null;
}) {
  const totalSeconds = Math.max(0, Math.ceil((remainingMs ?? 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const urgent = remainingMs !== null && remainingMs <= 30_000;

  return (
    <div className="flex items-center justify-between border-border border-b px-3 py-2">
      <div
        className={cn(
          "flex items-center gap-1.5 font-medium text-sm tabular-nums",
          urgent && "text-destructive",
        )}
      >
        <Timer className="size-4" />
        {minutes}:{String(seconds).padStart(2, "0")}
      </div>

      <div className="flex items-center gap-3 text-sm tabular-nums">
        <span className="flex items-center gap-1 text-primary">
          <Check className="size-3.5" />
          {correct}
        </span>
        <span className="flex items-center gap-1 text-destructive">
          <X className="size-3.5" />
          {wrong}
        </span>
        <Link
          to="/scoreboard"
          className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-muted-foreground hover:bg-muted"
        >
          <ListOrdered className="size-3.5" />
          {rank ? `#${rank}` : "—"}
        </Link>
      </div>
    </div>
  );
}

/** แถบล่างบางๆ แจ้งว่าใครแซงใคร แสดงทีละอันแล้วหายเอง */
function EventBar({
  notices,
  onDismiss,
}: {
  notices: { id: number; kind: "passed" | "passed_by"; nickname: string }[];
  onDismiss: (id: number) => void;
}) {
  const notice = notices.at(-1) ?? null;

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => onDismiss(notice.id), 2500);
    return () => clearTimeout(id);
  }, [notice, onDismiss]);

  return (
    <div className="h-8 border-border border-t">
      {notice && (
        <div
          key={notice.id}
          className={cn(
            "flex h-full items-center gap-1.5 px-3 text-xs duration-200 animate-in fade-in slide-in-from-bottom-2",
            notice.kind === "passed" ? "text-primary" : "text-destructive",
          )}
        >
          {notice.kind === "passed" ? (
            <ChevronsUp className="size-3.5 shrink-0" />
          ) : (
            <ChevronsDown className="size-3.5 shrink-0" />
          )}
          <span className="truncate">
            {notice.kind === "passed"
              ? `คุณแซง ${notice.nickname} แล้ว`
              : `${notice.nickname} แซงอันดับของคุณ`}
          </span>
        </div>
      )}
    </div>
  );
}
