import { cn } from "@singpore-game/ui/lib/utils";

interface StreakPipeProps {
  /** streak ปัจจุบัน — เกิน max ได้ หลอดจะเต็มค้างไว้ */
  value: number;
  /** ค่าที่ทำให้หลอดเต็มพอดี */
  max?: number;
  className?: string;
}

/**
 * หลอดน้ำแนวตั้งบอกระดับ streak
 * น้ำขึ้นทีละขั้นจนเต็มที่ `max` แล้วคงเต็มไว้ ส่วนตัวเลขด้านล่างวิ่งต่อได้ไม่จำกัด
 */
export function StreakPipe({ value, max = 10, className }: StreakPipeProps) {
  const clamped = Math.min(Math.max(value, 0), max);
  const fill = (clamped / max) * 100;
  const isFull = value >= max;

  return (
    <div className={cn("flex h-full flex-col items-center gap-2", className)}>
      <div
        role="meter"
        aria-label="ระดับ streak"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuetext={`streak ${value}`}
        className={cn(
          "relative w-9 flex-1 overflow-hidden rounded-full border-2 border-border bg-muted/40",
          isFull && "border-primary/60",
        )}
      >
        {/* ขีดบอกระดับทุกขั้น */}
        <div className="absolute inset-0 flex flex-col-reverse">
          {Array.from({ length: max }, (_, i) => (
            <div key={i} className="flex-1 border-t border-border/40 first:border-t-0" />
          ))}
        </div>

        {/* ตัวน้ำ */}
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 transition-[height] duration-500 ease-out",
            "motion-reduce:transition-none",
            "bg-linear-to-t from-primary/90 to-primary/60",
          )}
          style={{ height: `${fill}%` }}
        >
          {/* ผิวน้ำกระเพื่อม */}
          <div
            className={cn(
              "absolute inset-x-0 top-0 h-1.5 -translate-y-1/2 rounded-[50%] bg-primary",
              "animate-pulse motion-reduce:animate-none",
            )}
          />
        </div>
      </div>

      <div className="flex flex-col items-center leading-none">
        <span
          className={cn(
            "font-bold text-xl tabular-nums transition-colors",
            isFull ? "text-primary" : "text-foreground",
          )}
        >
          {value}
        </span>
        <span className="text-[10px] text-muted-foreground">streak</span>
      </div>
    </div>
  );
}
