import { Badge } from "@singpore-game/ui/components/badge";
import { Button } from "@singpore-game/ui/components/button";
import { Input } from "@singpore-game/ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@singpore-game/ui/components/tabs";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Download, Play, RotateCcw, Square, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminsTab } from "@/components/admin/admins-tab";
import { QuestionsTab } from "@/components/admin/questions-tab";
import { ScoreboardTable, formatDuration } from "@/components/scoreboard-table";
import { api } from "@/lib/api";
import { useGameSocket } from "@/lib/game-socket";

export const Route = createFileRoute("/_admin/admin")({
  component: AdminPage,
});

const DURATION_PRESETS = [5, 10, 15];

function AdminPage() {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col overflow-hidden">
      <Tabs defaultValue="playing" className="flex h-full min-h-0 flex-col">
        <div className="border-border border-b px-3 py-2">
          <h1 className="mb-2 font-semibold text-sm">แผงควบคุมผู้ดูแล</h1>
          <TabsList>
            <TabsTrigger value="playing">กำลังเล่น</TabsTrigger>
            <TabsTrigger value="questions">คำถาม</TabsTrigger>
            <TabsTrigger value="admins">ผู้ดูแล</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="playing" className="min-h-0 flex-1 overflow-y-auto">
          <PlayingTab />
        </TabsContent>
        <TabsContent value="questions" className="min-h-0 flex-1 overflow-y-auto">
          <QuestionsTab />
        </TabsContent>
        <TabsContent value="admins" className="min-h-0 flex-1 overflow-y-auto">
          <AdminsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PlayingTab() {
  const { game, scoreboard, remainingMs, onlineCount } = useGameSocket();
  const [minutes, setMinutes] = useState(5);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (game) setMinutes(Math.round(game.durationSec / 60));
  }, [game?.durationSec]);

  const status = game?.status ?? "lobby";
  const notStarted = status === "lobby";

  const run = async (action: () => Promise<unknown>, successMessage: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={status} />

        <span
          className="flex items-center gap-1 text-muted-foreground text-xs tabular-nums"
          title="คนที่เปิดเว็บค้างอยู่ตอนนี้ (นับคนไม่ซ้ำ ต่อให้เปิดหลายแท็บ)"
        >
          <Wifi className="size-3.5" />
          {onlineCount ?? "—"} เปิดเว็บอยู่
        </span>
        <span
          className="flex items-center gap-1 text-primary text-xs tabular-nums"
          title="คนที่กดเข้าร่วมรอบนี้แล้ว"
        >
          <Check className="size-3.5" />
          {game?.playerCount ?? 0} เข้าร่วมแล้ว
        </span>

        {status === "running" && remainingMs !== null && (
          <span className="ml-auto font-medium text-sm tabular-nums">
            เหลือ {formatDuration(remainingMs)}
          </span>
        )}
      </div>

      {notStarted && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="font-medium text-sm">เวลาเล่น</p>
          <div className="flex flex-wrap items-center gap-2">
            {DURATION_PRESETS.map((preset) => (
              <Button
                key={preset}
                size="sm"
                variant={minutes === preset ? "default" : "outline"}
                onClick={() => setMinutes(preset)}
              >
                {preset} นาที
              </Button>
            ))}
            <Input
              type="number"
              min={1}
              max={120}
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
              className="h-7 w-20"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                run(() => api.admin.setDuration(minutes * 60), `ตั้งเวลาเป็น ${minutes} นาทีแล้ว`)
              }
            >
              บันทึกเวลา
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || !notStarted}
          onClick={() => run(api.admin.start, "เริ่มนับถอยหลัง 3 วินาที")}
        >
          <Play className="size-3.5" />
          เริ่มเกม
        </Button>
        <Button
          variant="outline"
          disabled={busy || status === "ended"}
          onClick={() => run(api.admin.end, "จบเกมแล้ว")}
        >
          <Square className="size-3.5" />
          จบเกมทันที
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => run(api.admin.reset, "เปิดรอบใหม่แล้ว")}
        >
          <RotateCcw className="size-3.5" />
          เปิดรอบใหม่
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">
        การนับถอยหลัง 3-2-1 ไม่กินเวลาเล่น · เปิดรอบใหม่จะปิดรอบปัจจุบันและล้างผู้เล่นทั้งหมด
      </p>

      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm">กระดานคะแนน</p>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || scoreboard.length === 0}
          onClick={() =>
            run(api.admin.exportScoreboard, `ดาวน์โหลดคะแนน ${scoreboard.length} คนแล้ว`)
          }
        >
          <Download className="size-3.5" />
          ดาวน์โหลด CSV
        </Button>
      </div>

      <ScoreboardTable rows={scoreboard} live={status !== "ended"} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = {
    lobby: "ยังไม่เริ่ม",
    countdown: "กำลังนับถอยหลัง",
    running: "กำลังเล่น",
    ended: "จบแล้ว",
  }[status];

  return <Badge variant={status === "running" ? "default" : "secondary"}>{label}</Badge>;
}
