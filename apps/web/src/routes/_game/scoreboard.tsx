import { Button, buttonVariants } from "@singpore-game/ui/components/button";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, PartyPopper } from "lucide-react";

import { ScoreboardTable, formatDuration } from "@/components/scoreboard-table";
import { useGameSocket } from "@/lib/game-socket";

export const Route = createFileRoute("/_game/scoreboard")({
  component: ScoreboardPage,
});

function ScoreboardPage() {
  const { scoreboard, myParticipantId, game, rank, finishedMs } = useGameSocket();
  const live = game?.status !== "ended";
  const finished = finishedMs !== null;

  return (
    <div className="grid h-full grid-rows-[auto_1fr] overflow-hidden">
      <div className="flex items-center justify-between border-border border-b px-3 py-2">
        <div>
          <h1 className="font-semibold text-sm">กระดานคะแนน</h1>
          <p className="text-muted-foreground text-xs">
            {live ? "อัปเดตสด" : "จบเกมแล้ว"} · เรียงตาม streak → ถูก → เวลา
          </p>
        </div>
        {/* คนที่ตอบครบแล้วไม่มีข้อให้กลับไปตอบ ปุ่มนี้จึงไม่ต้องมี */}
        {live && !finished && (
          <Link to="/play" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ArrowLeft className="size-3.5" />
            กลับไปเล่น {rank ? `(#${rank})` : ""}
          </Link>
        )}
      </div>

      <div className="min-h-0 overflow-y-auto px-3 py-2">
        {finished && (
          <div className="mb-3 flex items-center gap-2.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-2.5">
            <PartyPopper className="size-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="font-medium text-primary text-sm">คุณตอบครบทุกข้อแล้ว</p>
              <p className="text-muted-foreground text-xs tabular-nums">
                ใช้เวลา {formatDuration(finishedMs)}
                {live && " · รอเพื่อนที่เหลือ อันดับยังขยับได้"}
              </p>
            </div>
          </div>
        )}

        <ScoreboardTable rows={scoreboard} highlightId={myParticipantId} live={live} />
      </div>
    </div>
  );
}
