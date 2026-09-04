import { CHOICE_LABELS, accuracyPercent } from "@singpore-game/game-core";
import { Button, buttonVariants } from "@singpore-game/ui/components/button";
import { cn } from "@singpore-game/ui/lib/utils";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Maximize,
  Minimize,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { type AdminQuestion, api } from "@/lib/api";

export const Route = createFileRoute("/_admin/slides")({
  component: SlidesPage,
});

function SlidesPage() {
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.admin
      .questions()
      .then((qs) => setQuestions(qs.filter((question) => question.isActive)))
      .catch((err) => toast.error(err instanceof Error ? err.message : "โหลดคำถามไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  const [index, setIndex] = useState(0);
  // โน้ตเป็นของภายใน ("ผู้เล่นไม่เห็น") — ฉายขึ้นจอห้องได้แต่ต้องปิดได้ไวด้วยปุ่มเดียว
  const [showNote, setShowNote] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const total = questions.length;
  const go = useCallback(
    (delta: number) => setIndex((current) => Math.min(Math.max(current + delta, 0), total - 1)),
    [total],
  );

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    const sync = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      switch (event.key) {
        case "ArrowRight":
        case "PageDown":
        case " ":
          event.preventDefault();
          go(1);
          break;
        case "ArrowLeft":
        case "PageUp":
          event.preventDefault();
          go(-1);
          break;
        case "Home":
          setIndex(0);
          break;
        case "End":
          setIndex(total - 1);
          break;
        case "n":
        case "N":
          setShowNote((value) => !value);
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, total, toggleFullscreen]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-muted-foreground">ยังไม่มีคำถามที่เปิดใช้งาน</p>
        <Link to="/admin" className={buttonVariants({ variant: "outline", size: "sm" })}>
          กลับแผงควบคุม
        </Link>
      </div>
    );
  }

  const question = questions[index] as AdminQuestion;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Slide question={question} number={index + 1} total={total} showNote={showNote} />

      <div className="flex shrink-0 items-center gap-2 border-border border-t px-3 py-2">
        <Button
          size="sm"
          variant="outline"
          disabled={index === 0}
          onClick={() => go(-1)}
          aria-label="ข้อก่อนหน้า"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={index === total - 1}
          onClick={() => go(1)}
          aria-label="ข้อถัดไป"
        >
          <ChevronRight className="size-4" />
        </Button>

        <span className="ml-1 text-muted-foreground text-xs tabular-nums">
          {index + 1} / {total}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowNote((value) => !value)}>
            {showNote ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            <span className="hidden sm:inline">{showNote ? "ซ่อนโน้ต" : "แสดงโน้ต"}</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={toggleFullscreen}>
            {fullscreen ? <Minimize className="size-3.5" /> : <Maximize className="size-3.5" />}
            <span className="hidden sm:inline">เต็มจอ</span>
          </Button>
          <Link to="/admin" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <X className="size-3.5" />
            <span className="hidden sm:inline">ปิด</span>
          </Link>
        </div>
      </div>

      <p className="shrink-0 border-border border-t px-3 py-1.5 text-[10px] text-muted-foreground">
        ← → เปลี่ยนข้อ · N ซ่อน/แสดงโน้ต · F เต็มจอ
      </p>
    </div>
  );
}

/** หนึ่งข้อเต็มหน้า — ตัวใหญ่พอฉายโปรเจกเตอร์แล้วอ่านออกจากหลังห้อง */
function Slide({
  question,
  number,
  total,
  showNote,
}: {
  question: AdminQuestion;
  number: number;
  total: number;
  showNote: boolean;
}) {
  const answered = question.correctCount + question.wrongCount;

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-8 sm:py-8">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-muted-foreground text-sm tabular-nums">
          ข้อ {number} / {total}
        </p>
        <p className="text-muted-foreground text-xs tabular-nums">
          {answered === 0
            ? "ยังไม่มีใครตอบ"
            : `ตอบถูก ${question.correctCount} · ผิด ${question.wrongCount} · ${accuracyPercent(question.correctCount, question.wrongCount)}%`}
        </p>
      </div>

      <h2 className="text-balance font-bold text-2xl leading-snug sm:text-4xl">{question.text}</h2>

      <div className="grid gap-2.5 sm:gap-3">
        {question.choices.map((choice, choiceIndex) => {
          const isCorrect = choiceIndex === question.correctIndex;
          return (
            <div
              key={choiceIndex}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-4 py-3 text-lg sm:text-2xl",
                isCorrect
                  ? "border-primary bg-primary/15 font-semibold"
                  : "border-border text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-md font-medium text-base sm:size-9",
                  isCorrect ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                {CHOICE_LABELS[choiceIndex]}
              </span>
              <span className="flex-1 text-balance">{choice}</span>
              {isCorrect && <Check className="size-6 shrink-0 text-primary sm:size-7" />}
            </div>
          );
        })}
      </div>

      {showNote && question.adminComment && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <p className="font-medium text-amber-600 text-xs dark:text-amber-400">โน้ตของผู้ดูแล</p>
          <p className="mt-1 whitespace-pre-wrap text-base sm:text-lg">{question.adminComment}</p>
        </div>
      )}
    </div>
  );
}
