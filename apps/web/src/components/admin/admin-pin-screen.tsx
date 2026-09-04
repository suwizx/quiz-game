import { cn } from "@singpore-game/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { Delete, KeyRound, Loader2, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

interface AdminPinScreenProps {
  adminEmail: string;
  onSuccess: () => void;
}

export function AdminPinScreen({ adminEmail, onSuccess }: AdminPinScreenProps) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleVerify = async (pinToVerify: string) => {
    if (pinToVerify.length !== 4 || loading) return;
    setLoading(true);
    setError(false);
    try {
      await api.admin.verifyPin(pinToVerify);
      toast.success("ยืนยันรหัส PIN สำเร็จ");
      onSuccess();
    } catch (err) {
      setError(true);
      setPin("");
      const message = err instanceof Error ? err.message : "รหัส PIN ไม่ถูกต้อง";
      toast.error(message);
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleDigit = (digit: string) => {
    if (loading || pin.length >= 4) return;
    const nextPin = pin + digit;
    setPin(nextPin);
    if (nextPin.length === 4) {
      void handleVerify(nextPin);
    }
  };

  const handleDelete = () => {
    if (loading) return;
    setPin((prev) => prev.slice(0, -1));
    setError(false);
  };

  const handleClear = () => {
    if (loading) return;
    setPin("");
    setError(false);
    inputRef.current?.focus();
  };

  const signOut = async () => {
    await authClient.signOut();
    api.admin.clearPin();
    window.location.href = "/prepare";
  };

  return (
    <div className="flex h-full min-h-[500px] flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-xs space-y-6">
        {/* Header */}
        <div className="space-y-2 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <KeyRound className="size-7" />
          </div>
          <h1 className="font-bold text-xl tracking-tight">ยืนยันรหัส PIN ผู้ดูแล</h1>
          <p className="text-muted-foreground text-xs">
            เข้าสู่ระบบด้วย <span className="font-medium text-foreground">{adminEmail}</span>
          </p>
        </div>

        {/* PIN Display Boxes */}
        <div
          className="relative flex justify-center gap-3 cursor-pointer py-2"
          onClick={() => inputRef.current?.focus()}
        >
          {/* Invisible input to capture physical keyboard / mobile paste */}
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "").slice(0, 4);
              setPin(val);
              if (val.length === 4) {
                void handleVerify(val);
              }
            }}
            className="absolute inset-0 opacity-0 pointer-events-none"
            autoFocus
          />

          {[0, 1, 2, 3].map((index) => {
            const hasDigit = pin.length > index;
            const isCurrent = pin.length === index;
            return (
              <div
                key={index}
                className={cn(
                  "flex size-14 items-center justify-center rounded-xl border-2 text-2xl font-bold transition-all shadow-sm",
                  error
                    ? "border-destructive bg-destructive/10 text-destructive animate-shake"
                    : isCurrent
                      ? "border-primary bg-background ring-4 ring-primary/20 scale-105"
                      : hasDigit
                        ? "border-primary/60 bg-primary/5 text-primary"
                        : "border-border/80 bg-muted/30 text-muted-foreground",
                )}
              >
                {hasDigit ? "●" : ""}
              </div>
            );
          })}
        </div>

        {/* Status / Error feedback */}
        <div className="h-5 text-center">
          {loading ? (
            <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              <span>กำลังตรวจสอบ PIN…</span>
            </div>
          ) : error ? (
            <span className="text-xs font-medium text-destructive">รหัส PIN ไม่ถูกต้อง</span>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              กดตัวเลขบนแป้นพิมพ์ หรือแตะปุ่มด้านล่าง
            </span>
          )}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              type="button"
              disabled={loading}
              onClick={() => handleDigit(num.toString())}
              className="flex h-12 items-center justify-center rounded-xl border border-border/70 bg-card text-lg font-semibold shadow-xs transition-colors hover:bg-muted active:scale-95 disabled:opacity-50"
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            disabled={loading || pin.length === 0}
            onClick={handleClear}
            className="flex h-12 items-center justify-center rounded-xl border border-border/70 bg-card text-xs font-medium text-muted-foreground shadow-xs transition-colors hover:bg-muted active:scale-95 disabled:opacity-40"
          >
            ล้าง
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleDigit("0")}
            className="flex h-12 items-center justify-center rounded-xl border border-border/70 bg-card text-lg font-semibold shadow-xs transition-colors hover:bg-muted active:scale-95 disabled:opacity-50"
          >
            0
          </button>
          <button
            type="button"
            disabled={loading || pin.length === 0}
            onClick={handleDelete}
            className="flex h-12 items-center justify-center rounded-xl border border-border/70 bg-card text-muted-foreground shadow-xs transition-colors hover:bg-muted active:scale-95 disabled:opacity-40"
          >
            <Delete className="size-5" />
          </button>
        </div>

        {/* Footer actions */}
        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="flex items-center gap-4 text-xs">
            <Link to="/prepare" className="text-muted-foreground hover:text-foreground">
              ← กลับไปหน้าเล่นเกม
            </Link>
            <span className="text-border">|</span>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive transition-colors"
            >
              <LogOut className="size-3" />
              ออกจากระบบ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
