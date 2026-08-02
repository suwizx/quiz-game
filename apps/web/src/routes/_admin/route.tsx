import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { api } from "@/lib/api";
import { GameSocketProvider } from "@/lib/game-socket";

export const Route = createFileRoute("/_admin")({
  component: AdminLayout,
  beforeLoad: async () => {
    // เช็คสิทธิ์กับ server เสมอ — client ตัดสินเองไม่ได้
    const config = await api.config().catch(() => null);
    if (!config?.user) throw redirect({ to: "/login" });
    if (!config.user.isAdmin) throw redirect({ to: "/prepare" });
    return { admin: config.user };
  },
});

function AdminLayout() {
  // admin ต่อ WS ด้วย เพื่อให้เห็นกระดานคะแนนแบบเรียลไทม์เหมือนผู้เล่น
  return (
    <GameSocketProvider>
      <Outlet />
    </GameSocketProvider>
  );
}
