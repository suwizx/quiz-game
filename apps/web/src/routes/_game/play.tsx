import { CHOICE_LABELS, STREAK_BAR_MAX, type QuestionView } from "@singpore-game/game-core";
import { Button } from "@singpore-game/ui/components/button";
import { StreakPipe } from "@singpore-game/ui/components/streak-pipe";
import { cn } from "@singpore-game/ui/lib/utils";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Check, ChevronsDown, ChevronsUp, ListOrdered, Timer, X } from "lucide-react";
import { useEffect, useState } from "react";

import { type AnswerResult, useGameSocket } from "@/lib/game-socket";

export const Route = createFileRoute("/_game/play")({
  component: PlayPage,
});

/** โชว์ผลถูก/ผิดสั้น ๆ ก่อนสไลด์ไปข้อถัดไป */
const FEEDBACK_MS = 350;
/** ตอบไปแล้วแต่ผลไม่กลับมาสักที (แพ็กเก็ตหาย) — ปลดล็อกให้กดใหม่ได้ */
const ANSWER_TIMEOUT_MS = 4000;

/** ข้อที่เพิ่งกดตอบ ค้างไว้จนกว่าจะโชว์ผลเสร็จ ไม่งั้นข้อถัดไปเด้งมาทับก่อนเห็นผล */
interface Pending {
  question: QuestionView;
  index: number;
  /**
   * ผลล่าสุด ณ ตอนที่กด — ใช้แยกว่าผลที่เห็นอยู่เป็นของข้อนี้จริง ไม่ใช่ผลเก่าที่ id บังเอิญซ้ำ
   * (เหลือคำถาม active ข้อเดียว ข้อถัดไปจะเป็น id เดิม)
   */
  previous: AnswerResult | null;
}

function PlayPage() {
  const { question, score, rank, remainingMs, lastResult, answer, notices, dismissNotice } =
    useGameSocket();

  const [pending, setPending] = useState<Pending | null>(null);

  // ผลลัพธ์ต้องเป็นของข้อที่เพิ่งกดเท่านั้น — ผลของข้อก่อนหน้ายังค้างอยู่ใน state
  // (เคยทำให้ข้อที่ตอบถูกโชว์กากบาทแดงแวบหนึ่งก่อนจะเปลี่ยนเป็นถูก)
  const result =
    pending && lastResult !== pending.previous && lastResult?.questionId === pending.question.id
      ? lastResult
      : null;

  useEffect(() => {
    if (!pending) return;

    // เซิร์ฟเวอร์ push ข้อใหม่มาโดยไม่มีผลลัพธ์ (เช่น ข้อนั้นถูกปิดใช้งานกลางคัน) — ไปต่อเลย
    if (!result && question && question.id !== pending.question.id) {
      setPending(null);
      return;
    }

    const id = setTimeout(() => setPending(null), result ? FEEDBACK_MS : ANSWER_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [pending, result, question]);

  const choose = (index: number) => {
    if (!question || pending) return;
    setPending({ question, index, previous: lastResult });
    answer(question.id, index);
  };

  // ระหว่างรอผล/โชว์ผล ยังต้องเห็นข้อเดิม ไม่ใช่ข้อถัดไปที่เซิร์ฟเวอร์ส่งมาพร้อมผล
  const shown = pending?.question ?? question;
  const picked = pending?.index ?? null;
  const wasCorrect = result ? result.correct : null;

  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto] overflow-hidden">
      <TopBar remainingMs={remainingMs} correct={score.correctCount} wrong={score.wrongCount} rank={rank} />

      <div className="grid min-h-0 grid-cols-[auto_1fr] gap-3 overflow-hidden px-3 py-3">
        <StreakPipe value={score.currentStreak} max={STREAK_BAR_MAX} />

        <div className="flex min-h-0 flex-col gap-3">
          {shown ? (
            <>
              <div className="flex min-h-0 flex-1 flex-col justify-center">
                <p className="text-muted-foreground text-xs">ข้อที่ {shown.number}</p>
                <h2 className="mt-1 text-balance font-semibold text-lg leading-snug">
                  {shown.text}
                </h2>
              </div>

              <div className="grid shrink-0 gap-2">
                {shown.choices.map((choice, index) => {
                  const isPicked = picked === index;
                  return (
                    <button
                      key={`${shown.id}-${index}`}
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
