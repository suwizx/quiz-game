import { Button, buttonVariants } from "@singpore-game/ui/components/button";
import { Input } from "@singpore-game/ui/components/input";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  loader: () =>
    api
      .config()
      .catch(() => ({ googleEnabled: true, devLogin: false, user: null })),
});

function LoginPage() {
  const { googleEnabled, devLogin, user } = Route.useLoaderData();
  const [signingIn, setSigningIn] = useState(false);

  const signIn = async () => {
    setSigningIn(true);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}/admin`,
      errorCallbackURL: `${window.location.origin}/login`,
    });

    if (error) {
      toast.error(error.message ?? "เข้าสู่ระบบไม่สำเร็จ");
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    api.admin.clearPin();
    window.location.reload();
  };

  const handleSwitchAccount = async () => {
    await authClient.signOut();
    api.admin.clearPin();
    void signIn();
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="font-bold text-3xl tracking-tight">เข้าสู่ระบบผู้ดูแล</h1>
          <p className="text-muted-foreground text-sm">
            สำหรับผู้ดูแลระบบ (อีเมล @kmitl.ac.th หรืออีเมลผู้ดูแล)
          </p>
        </div>

        {user ? (
          <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
            {user.isAdmin ? (
              <div className="space-y-3 text-center">
                <div className="inline-flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm">คุณเข้าสู่ระบบในฐานะผู้ดูแลแล้ว</p>
                  <p className="text-muted-foreground text-xs">{user.email}</p>
                </div>
                <div className="pt-2 space-y-2">
                  <Link
                    to="/admin"
                    className={buttonVariants({ className: "w-full text-sm", size: "lg" })}
                  >
                    ไปที่แผงควบคุมผู้ดูแล
                  </Link>
                  <Button
                    variant="outline"
                    className="w-full text-sm"
                    onClick={handleSignOut}
                  >
                    ออกจากระบบ
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-center">
                <div className="inline-flex size-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                  <ShieldAlert className="size-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm">บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ</p>
                  <p className="text-muted-foreground text-xs break-all">
                    {user.email}
                  </p>
                  <p className="text-muted-foreground text-xs mt-1">
                    ต้องใช้อีเมลสถาบัน (@kmitl.ac.th) หรืออีเมลผู้ดูแล
                  </p>
                </div>
                <div className="pt-2 space-y-2">
                  <Button
                    className="w-full text-sm"
                    size="lg"
                    disabled={!googleEnabled || signingIn}
                    onClick={handleSwitchAccount}
                  >
                    <GoogleMark />
                    {signingIn ? "กำลังพาไปที่ Google…" : "สลับบัญชี Google อื่น"}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full text-sm"
                    onClick={handleSignOut}
                  >
                    ออกจากระบบ
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Button
              className="h-11 w-full text-sm"
              size="lg"
              disabled={!googleEnabled || signingIn}
              onClick={signIn}
            >
              <GoogleMark />
              {signingIn ? "กำลังพาไปที่ Google…" : "เข้าสู่ระบบด้วย Google"}
            </Button>

            <p className="text-center text-muted-foreground text-xs">
              ผู้เล่นทั่วไปสามารถเข้าเล่นได้ทันทีโดยไม่ต้องเข้าสู่ระบบ
            </p>

            {!googleEnabled && (
              <p className="rounded-md border border-border bg-muted/40 p-3 text-center text-muted-foreground text-xs">
                ยังไม่ได้ตั้งค่า Google OAuth บนเซิร์ฟเวอร์ — ใส่ <code>GOOGLE_CLIENT_ID</code> และ{" "}
                <code>GOOGLE_CLIENT_SECRET</code> ใน <code>apps/server/.env</code>
              </p>
            )}
          </div>
        )}

        <div className="text-center pt-1">
          <Link to="/prepare" className="text-xs text-primary hover:underline">
            ← กลับไปหน้าเล่นเกม
          </Link>
        </div>

        {devLogin && <DevLogin />}
      </div>
    </div>
  );
}

/** ฟอร์มทดสอบเฉพาะตอน dev (DEV_LOGIN=true) — ยังถูกจำกัดโดเมนเหมือนกัน */
function DevLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (mode: "signIn" | "signUp") => {
    setBusy(true);
    const result =
      mode === "signIn"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: email.split("@")[0] ?? email });

    setBusy(false);
    if (result.error) {
      toast.error(result.error.message ?? "ไม่สำเร็จ");
      return;
    }
    window.location.href = "/prepare";
  };

  return (
    <div className="space-y-2 rounded-md border border-dashed border-border p-3">
      <p className="text-center text-[10px] text-muted-foreground uppercase tracking-wide">
        โหมดทดสอบ (dev เท่านั้น)
      </p>
      <Input
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="67070001@kmitl.ac.th"
        autoComplete="username"
        className="h-9"
      />
      <Input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="รหัสผ่าน (อย่างน้อย 8 ตัว)"
        autoComplete="current-password"
        className="h-9"
      />
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" disabled={busy} onClick={() => submit("signIn")}>
          เข้าสู่ระบบ
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={busy}
          onClick={() => submit("signUp")}
        >
          สมัคร
        </Button>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="currentColor"
        d="M12 11v2.8h4.6c-.2 1.2-1.4 3.5-4.6 3.5-2.8 0-5-2.3-5-5.1S9.2 7 12 7c1.6 0 2.6.7 3.2 1.2l2.2-2.1C16 4.8 14.2 4 12 4a8 8 0 1 0 0 16c4.6 0 7.7-3.2 7.7-7.8 0-.5 0-.9-.1-1.2H12Z"
      />
    </svg>
  );
}
