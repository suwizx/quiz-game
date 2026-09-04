import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { WifiOff } from "lucide-react";
import { useEffect } from "react";

import { GameSocketProvider, useGameSocket } from "@/lib/game-socket";

export const Route = createFileRoute("/_game")({
  component: GameLayout,
});

function GameLayout() {
  return (
    <GameSocketProvider>
      <GameShell />
    </GameSocketProvider>
  );
}

/** หน้าที่ควรอยู่ ณ สถานะเกมหนึ่ง ๆ */
const routeForStatus = {
  lobby: "/prepare",
  countdown: "/prepare",
  running: "/play",
  ended: "/summary",
} as const;

const GAME_ROUTES = ["/prepare", "/play", "/scoreboard", "/summary"] as const;

function GameShell() {
  const { game, joined, finishedMs, reconnecting, connected } = useGameSocket();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    // joined เป็น null แปลว่ายังไม่ได้ snapshot แรก — ยังตัดสินใจไม่ได้
    if (!game || joined === null) return;

    // ถ้ากำลังอยู่หรือกำลังไปหน้านอกเกม (เช่น /admin, /login) ไม่ต้องดักเปลี่ยนหน้า
    if (!GAME_ROUTES.includes(pathname as (typeof GAME_ROUTES)[number])) return;

    // ดูกระดานคะแนนระหว่างเกมได้ ไม่ต้องถูกดึงกลับหน้าเล่น
    if (pathname === "/scoreboard" && game.status !== "ended") return;

    const target =
      game.status === "ended"
        ? "/summary"
        : !joined
          ? // ยังไม่ได้กดเข้าร่วมรอบนี้ ต้องกลับไปหน้าเตรียมตัวก่อนแม้เกมจะเริ่มไปแล้ว
            // (เดิมถูกส่งเข้า /play ที่ไม่มีคำถามให้ แล้วค้างอยู่หน้า "กำลังโหลด" ทั้งรอบ)
            "/prepare"
          : game.status === "running" && finishedMs !== null
            ? // ตอบครบทุกข้อแล้ว — ไม่มีอะไรให้ทำที่หน้าเล่นอีก ไปดูกระดานคะแนนแทน
              "/scoreboard"
            : routeForStatus[game.status];

    if (pathname !== target) void navigate({ to: target, replace: true });
  }, [game, joined, finishedMs, pathname, navigate]);

  return (
    <div className="relative h-full">
      {reconnecting && !connected && (
        <div className="absolute inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-destructive/15 py-1.5 text-destructive text-xs">
          <WifiOff className="size-3.5" />
          กำลังเชื่อมต่อใหม่…
        </div>
      )}
      <Outlet />
    </div>
  );
}
