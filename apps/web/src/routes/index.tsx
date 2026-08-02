import { createFileRoute, redirect } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

/** หน้าแรกไม่มีเนื้อหาของตัวเอง — พาไปตามสถานะการเข้าสู่ระบบ */
export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    throw redirect({ to: session.data ? "/prepare" : "/login" });
  },
});
