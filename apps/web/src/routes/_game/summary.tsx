import { Button } from "@singpore-game/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Trophy, X, Zap } from "lucide-react";

import { ScoreboardTable, formatDuration } from "@/components/scoreboard-table";
import { authClient } from "@/lib/auth-client";
import { useGameSocket } from "@/lib/game-socket";

export const Route = createFileRoute("/_game/summary")({
  component: SummaryPage,
});

function SummaryPage() {
  const { scoreboard, myParticipantId, score, rank, finishedMs } = useGameSocket();
  const podium = scoreboard[0];

  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto] overflow-hidden">
      <div className="space-y-3 border-border border-b px-4 py-4">
        <div className="text-center">
          <h1 className="font-bold text-xl">จบเกม</h1>
          {podium && (
            <p className="mt-0.5 flex items-center justify-center gap-1.5 text-muted-foreground text-sm">
              <Trophy className="size-3.5 text-primary" />
              ผู้ชนะคือ <span className="font-medium text-foreground">{podium.nickname}</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat label="อันดับ" value={rank ? `#${rank}` : "—"} />
          <Stat label="streak สูงสุด" value={score.bestStreak} icon={<Zap className="size-3" />} />
          <Stat label="ถูก" value={score.correctCount} icon={<Check className="size-3" />} />
          <Stat label="ผิด" value={score.wrongCount} icon={<X className="size-3" />} />
        </div>

        <p className="text-center text-muted-foreground text-xs">
          เวลาที่ใช้ตอบรวม {formatDuration(score.totalAnswerMs)}
          {finishedMs !== null && ` · ตอบครบทุกข้อใน ${formatDuration(finishedMs)}`}
        </p>
      </div>

      <div className="min-h-0 overflow-y-auto px-3 py-2">
        <ScoreboardTable rows={scoreboard} highlightId={myParticipantId} />
      </div>

      <div className="border-border border-t p-3">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            void authClient.signOut().then(() => {
              window.location.href = "/login";
            });
          }}
        >
          ออกจากระบบ
        </Button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border py-2">
      <div className="font-bold text-lg tabular-nums">{value}</div>
      <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
        {icon}
        {label}
      </div>
    </div>
  );
}
