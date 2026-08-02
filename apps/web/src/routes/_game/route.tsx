import { Outlet, createFileRoute, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { WifiOff } from "lucide-react";
import { useEffect } from "react";

import { GameSocketProvider, useGameSocket } from "@/lib/game-socket";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_game")({
  component: GameLayout,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) throw redirect({ to: "/login" });
    return { session: session.data };
  },
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

function GameShell() {
  const { game, reconnecting, connected } = useGameSocket();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    if (!game) return;

    // ดูกระดานคะแนนระหว่างเกมได้ ไม่ต้องถูกดึงกลับหน้าเล่น
    if (pathname === "/scoreboard" && game.status !== "ended") return;

    const target = routeForStatus[game.status];
    if (pathname !== target) void navigate({ to: target, replace: true });
  }, [game, pathname, navigate]);

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
