import { Toaster } from "@singpore-game/ui/components/sonner";
import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { ThemeProvider } from "@/components/theme-provider";

import "../index.css";

export interface RouterAppContext {}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "ปริศนาฟ้าแลบ",
      },
      {
        name: "description",
        content: "เกมควิซแข่งสะสม streak เล่นพร้อมกันทั้งห้อง",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

function RootComponent() {
  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        {/* ไม่มี header กลาง — แต่ละ layout จัดพื้นที่เอง เพราะหน้าเล่นต้องใช้เต็มจอ */}
        <div className="h-dvh overflow-hidden">
          <Outlet />
        </div>
        <Toaster richColors position="top-center" />
      </ThemeProvider>
      <TanStackRouterDevtools position="bottom-left" />
    </>
  );
}
