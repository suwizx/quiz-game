import { NICKNAME_MAX_LENGTH } from "@singpore-game/game-core";
import { Button } from "@singpore-game/ui/components/button";
import { Input } from "@singpore-game/ui/components/input";
import { Label } from "@singpore-game/ui/components/label";
import { cn } from "@singpore-game/ui/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { Check, CircleAlert, Loader2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { useGameSocket } from "@/lib/game-socket";

export const Route = createFileRoute("/_game/prepare")({
  component: PreparePage,
  loader: () => api.prepare(),
});

function PreparePage() {
  const initial = Route.useLoaderData();
  const { game, joined: socketJoined, nickname: socketNickname } = useGameSocket();

  const [nickname, setNickname] = useState(initial.nickname);
  const [saving, setSaving] = useState(false);
  // จำว่าเข้าร่วม "รอบไหน" ไม่ใช่แค่ true/false — admin เปิดรอบใหม่แล้วต้องกลับไปเป็นยังไม่เข้าร่วม
  const [joinedGameId, setJoinedGameId] = useState(initial.joined ? initial.game.id : null);

  // ชื่อจาก server ชนะเสมอเมื่อ reconnect กลับมา (เช่นเปลี่ยนชื่อจากอีกแท็บ)
  useEffect(() => {
    if (socketNickname) setNickname(socketNickname);
  }, [socketNickname]);

  const gameId = game?.id ?? initial.game.id;
  const playerCount = game?.playerCount ?? initial.game.playerCount;
  const durationSec = game?.durationSec ?? initial.game.durationSec;
  const startsAt = game?.status === "countdown" ? game.startsAt : null;
  // ผลจาก socket คือความจริง ส่วน local flag กันสถานะกระพริบระหว่างรอ snapshot หลังกดเข้าร่วม
  const joined = joinedGameId === gameId || socketJoined === true;

  const save = async () => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      toast.error("กรุณากรอกชื่อที่จะแสดง");
      return;
    }

    setSaving(true);
    try {
      const result = await api.join(trimmed);
      setNickname(result.nickname);
      setJoinedGameId(gameId);
      toast.success("พร้อมเล่นแล้ว");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      {startsAt !== null && <Countdown startsAt={startsAt} />}

      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-1 text-center">
          <h1 className="font-bold text-2xl tracking-tight">เตรียมตัว</h1>
          <p className="text-muted-foreground text-sm">
            รอผู้ดูแลกดเริ่มเกม · เล่น {Math.round(durationSec / 60)} นาที
          </p>
        </div>

        <div
          className={cn(
            "flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm",
            joined
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {joined ? (
            <Check className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
          )}
          <div className="space-y-0.5">
            <p className="font-medium">{joined ? "เข้าร่วมแล้ว" : "ยังไม่ได้เข้าร่วม"}</p>
            <p className="text-xs opacity-80">
              {joined
                ? `อยู่ในรอบนี้ในชื่อ "${socketNickname ?? nickname}" · รอสัญญาณเริ่มเกม อย่าปิดหน้านี้`
                : 'กด "เข้าร่วม" ก่อน ไม่งั้นจะไม่ได้เล่นรอบนี้'}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="nickname">ชื่อที่จะแสดงบนกระดาน</Label>
          <div className="flex gap-2">
            <Input
              id="nickname"
              value={nickname}
              maxLength={NICKNAME_MAX_LENGTH}
              onChange={(event) => setNickname(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void save()}
              placeholder="ชื่อของคุณ"
              className="h-10"
            />
            <Button className="h-10 px-4" onClick={save} disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : joined ? (
                <Check className="size-4" />
              ) : null}
              {joined ? "บันทึก" : "เข้าร่วม"}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            ค่าเริ่มต้นคือ &quot;รหัสนักศึกษา ชื่อ-นามสกุล&quot; จากรายชื่อ แก้ไขได้ตามต้องการ
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 rounded-md border border-border py-3 text-sm">
          <Users className="size-4 text-muted-foreground" />
          <span className="font-medium tabular-nums">{playerCount}</span>
          <span className="text-muted-foreground">คนพร้อมแล้ว</span>
        </div>
      </div>
    </div>
  );
}

/** ทับทั้งจอตอนนับ 3..2..1 — เวลาช่วงนี้ไม่กินเวลาเล่น */
function Countdown({ startsAt }: { startsAt: number }) {
  const [remaining, setRemaining] = useState(() => startsAt - Date.now());

  useEffect(() => {
    const id = setInterval(() => setRemaining(startsAt - Date.now()), 100);
    return () => clearInterval(id);
  }, [startsAt]);

  const seconds = Math.ceil(remaining / 1000);
  if (seconds <= 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95">
      <span
        key={seconds}
        className="font-bold text-8xl tabular-nums duration-300 animate-in fade-in zoom-in-50"
      >
        {seconds}
      </span>
    </div>
  );
}
