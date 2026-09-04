import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AdminPinScreen } from "@/components/admin/admin-pin-screen";
import { api } from "@/lib/api";
import { GameSocketProvider } from "@/lib/game-socket";

export const Route = createFileRoute("/_admin")({
  component: AdminLayout,
  beforeLoad: async () => {
    // เช็คสิทธิ์กับ server เสมอ — client ตัดสินเองไม่ได้
    const config = await api.config().catch(() => null);
    if (!config?.user || !config.user.isAdmin) {
      throw redirect({ to: "/login" });
    }
  },
  loader: async () => {
    const [config, pinStatus] = await Promise.all([
      api.config().catch(() => null),
      api.admin.pinStatus().catch(() => ({ verified: false })),
    ]);
    return {
      admin: config?.user ?? null,
      initialPinVerified: pinStatus.verified,
    };
  },
});

function AdminLayout() {
  const { admin, initialPinVerified } = Route.useLoaderData();
  const [pinVerified, setPinVerified] = useState(initialPinVerified);

  useEffect(() => {
    let cancelled = false;
    api.admin
      .pinStatus()
      .then((res) => {
        if (!cancelled) setPinVerified(res.verified);
      })
      .catch(() => {
        if (!cancelled) setPinVerified(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!pinVerified) {
    return (
      <AdminPinScreen
        adminEmail={admin?.email ?? "ผู้ดูแลระบบ"}
        onSuccess={() => setPinVerified(true)}
      />
    );
  }

  // admin ต่อ WS ด้วย เพื่อให้เห็นกระดานคะแนนแบบเรียลไทม์เหมือนผู้เล่น
  return (
    <GameSocketProvider>
      <Outlet />
    </GameSocketProvider>
  );
}
