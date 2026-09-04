import { createFileRoute, redirect } from "@tanstack/react-router";

/** หน้าแรกพาไปหน้าเตรียมตัวเล่นเกมทันที (ไม่ต้องล็อกอิน) */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/prepare" });
  },
});
