import { Button } from "@singpore-game/ui/components/button";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { ScoreboardTable } from "@/components/scoreboard-table";
import { useGameSocket } from "@/lib/game-socket";

export const Route = createFileRoute("/_game/scoreboard")({
  component: ScoreboardPage,
});

function ScoreboardPage() {
  const { scoreboard, nickname, game, rank } = useGameSocket();
  const live = game?.status !== "ended";

  return (
    <div className="grid h-full grid-rows-[auto_1fr] overflow-hidden">
      <div className="flex items-center justify-between border-border border-b px-3 py-2">
        <div>
          <h1 className="font-semibold text-sm">กระดานคะแนน</h1>
          <p className="text-muted-foreground text-xs">
            {live ? "อัปเดตสด" : "จบเกมแล้ว"} · เรียงตาม streak → ถูก → เวลา
          </p>
        </div>
        {live && (
          <Button variant="outline" size="sm" render={<Link to="/play" />}>
            <ArrowLeft className="size-3.5" />
            กลับไปเล่น {rank ? `(#${rank})` : ""}
          </Button>
        )}
      </div>

      <div className="min-h-0 overflow-y-auto px-3 py-2">
        <ScoreboardTable rows={scoreboard} highlight={nickname} live={live} />
      </div>
    </div>
  );
}
