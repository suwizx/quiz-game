import type { ScoreRow } from "@singpore-game/game-core";
import { cn } from "@singpore-game/ui/lib/utils";

/** mm:ss จาก ms — ใช้ทั้งคอลัมน์ "เวลาที่ใช้" และนาฬิกาจับเวลาระหว่างเกม */
export function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

interface ScoreboardTableProps {
  rows: ScoreRow[];
  /** participantId ของเรา ใช้ไฮไลต์แถวตัวเอง — ชื่อเล่นซ้ำกันได้จึงใช้แทนไม่ได้ */
  highlightId?: string | null;
  /** เกมยังไม่จบ → คอลัมน์ท้ายคือเวลาที่จับอยู่ ไม่ใช่เวลาสรุป */
  live?: boolean;
  className?: string;
}

export function ScoreboardTable({ rows, highlightId, live, className }: ScoreboardTableProps) {
  if (rows.length === 0) {
    return (
      <p className={cn("py-10 text-center text-muted-foreground text-sm", className)}>
        ยังไม่มีผู้เล่น
      </p>
    );
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-border border-b text-muted-foreground text-xs">
            <th className="w-10 py-2 text-left font-medium">#</th>
            <th className="py-2 text-left font-medium">ชื่อ</th>
            <th className="w-14 py-2 text-right font-medium">streak</th>
            <th className="w-12 py-2 text-right font-medium">ถูก</th>
            <th className="w-12 py-2 text-right font-medium">ผิด</th>
            <th className="w-16 py-2 text-right font-medium">{live ? "จับเวลา" : "เวลาที่ใช้"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const isMe = highlightId != null && row.participantId === highlightId;
            return (
              <tr
                key={row.participantId}
                className={cn(
                  "border-border/60 border-b transition-colors last:border-0",
                  isMe && "bg-primary/10",
                )}
              >
                <td className="py-2 text-muted-foreground tabular-nums">{index + 1}</td>
                <td className="max-w-0 truncate py-2 pr-2">
                  <span className={cn(isMe && "font-semibold")}>{row.nickname}</span>
                  {/* ตอบครบทุกข้อแล้ว — เวลาที่ใช้คือเวลาปิดเกมของคนนี้ */}
                  {row.finishedMs !== null && (
                    <span className="ml-1.5 whitespace-nowrap rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary tabular-nums">
                      จบ {formatDuration(row.finishedMs)}
                    </span>
                  )}
                </td>
                <td className="py-2 text-right font-semibold tabular-nums">{row.bestStreak}</td>
                <td className="py-2 text-right text-primary tabular-nums">{row.correctCount}</td>
                <td className="py-2 text-right text-destructive tabular-nums">{row.wrongCount}</td>
                <td className="py-2 text-right text-muted-foreground tabular-nums">
                  {formatDuration(row.totalAnswerMs)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
