import { CHOICE_COUNT, accuracyPercent } from "@singpore-game/game-core";
import { Badge } from "@singpore-game/ui/components/badge";
import { Button } from "@singpore-game/ui/components/button";
import { Input } from "@singpore-game/ui/components/input";
import { Label } from "@singpore-game/ui/components/label";
import { Textarea } from "@singpore-game/ui/components/textarea";
import { cn } from "@singpore-game/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { Check, Loader2, Plus, Presentation, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { type AdminQuestion, type QuestionInput, api } from "@/lib/api";

const emptyDraft = (): QuestionInput => ({
  text: "",
  choices: Array.from({ length: CHOICE_COUNT }, () => ""),
  correctIndex: 0,
});

export function QuestionsTab() {
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setQuestions(await api.admin.questions());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "โหลดคำถามไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs">
          ใช้งานอยู่ {questions.filter((question) => question.isActive).length} จาก{" "}
          {questions.length} ข้อ
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" render={<Link to="/slides" />}>
            <Presentation className="size-3.5" />
            สไลด์เฉลย
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCreating((value) => !value)}>
            <Plus className="size-3.5" />
            เพิ่มคำถาม
          </Button>
        </div>
      </div>

      {creating && (
        <QuestionEditor
          draft={emptyDraft()}
          onCancel={() => setCreating(false)}
          onSave={async (draft) => {
            await api.admin.createQuestion(draft);
            setCreating(false);
            await refresh();
            toast.success("เพิ่มคำถามแล้ว");
          }}
        />
      )}

      <div className="space-y-2">
        {questions.map((question) =>
          editingId === question.id ? (
            <QuestionEditor
              key={question.id}
              draft={question}
              onCancel={() => setEditingId(null)}
              onSave={async (draft) => {
                await api.admin.updateQuestion(question.id, draft);
                setEditingId(null);
                await refresh();
                toast.success("บันทึกแล้ว");
              }}
            />
          ) : (
            <QuestionRow
              key={question.id}
              question={question}
              onEdit={() => setEditingId(question.id)}
              onRefresh={refresh}
            />
          ),
        )}
      </div>
    </div>
  );
}

function QuestionRow({
  question,
  onEdit,
  onRefresh,
}: {
  question: AdminQuestion;
  onEdit: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [comment, setComment] = useState(question.adminComment ?? "");
  const [savingComment, setSavingComment] = useState(false);
  // กดถังขยะครั้งเดียวแล้วหายเลยอันตรายเกินไป (กู้คืนจากหน้า admin ไม่ได้) — ให้ยืนยันก่อน
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const answered = question.correctCount + question.wrongCount;
  const accuracy = accuracyPercent(question.correctCount, question.wrongCount);

  const saveComment = async () => {
    setSavingComment(true);
    try {
      await api.admin.updateQuestion(question.id, { adminComment: comment || null });
      toast.success("บันทึกคอมเมนต์แล้ว");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSavingComment(false);
    }
  };

  return (
    <div
      className={cn(
        "space-y-2 rounded-md border border-border p-3",
        !question.isActive && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex-1 font-medium text-sm">{question.text}</p>
        {!question.isActive && <Badge variant="secondary">ปิดใช้งาน</Badge>}
      </div>

      <ul className="grid gap-0.5 text-xs">
        {question.choices.map((choice, index) => (
          <li
            key={index}
            className={cn(
              "flex items-center gap-1.5",
              index === question.correctIndex ? "text-primary" : "text-muted-foreground",
            )}
          >
            {index === question.correctIndex ? (
              <Check className="size-3 shrink-0" />
            ) : (
              <span className="size-3 shrink-0" />
            )}
            {choice}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
        <span className="text-primary">ถูก {question.correctCount}</span>
        <span className="text-destructive">ผิด {question.wrongCount}</span>
        <span className="text-muted-foreground">
          {answered === 0 ? "ยังไม่มีใครตอบ" : `อัตราตอบถูก ${accuracy}%`}
        </span>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`comment-${question.id}`} className="text-xs">
          คอมเมนต์ภายใน (ผู้เล่นไม่เห็น)
        </Label>
        <Textarea
          id={`comment-${question.id}`}
          value={comment}
          rows={2}
          placeholder="เช่น ข้อนี้กำกวม ควรแก้ตัวเลือก ค."
          onChange={(event) => setComment(event.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="xs" variant="secondary" disabled={savingComment} onClick={saveComment}>
          บันทึกคอมเมนต์
        </Button>
        <Button size="xs" variant="outline" onClick={onEdit}>
          แก้ไขคำถาม
        </Button>
        <Button
          size="xs"
          variant="outline"
          onClick={async () => {
            await api.admin.updateQuestion(question.id, { isActive: !question.isActive });
            await onRefresh();
          }}
        >
          {question.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
        </Button>
        {confirmingDelete ? (
          <>
            <Button
              size="xs"
              variant="destructive"
              onClick={async () => {
                try {
                  await api.admin.deleteQuestion(question.id);
                  await onRefresh();
                  toast.success("ลบคำถามแล้ว");
                } catch (error) {
                  setConfirmingDelete(false);
                  toast.error(error instanceof Error ? error.message : "ลบไม่สำเร็จ");
                }
              }}
            >
              <Trash2 className="size-3" />
              ยืนยันลบถาวร
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setConfirmingDelete(false)}>
              ยกเลิก
            </Button>
          </>
        ) : (
          <Button size="xs" variant="outline" onClick={() => setConfirmingDelete(true)}>
            <Trash2 className="size-3" />
            ลบ
          </Button>
        )}
      </div>
    </div>
  );
}

function QuestionEditor({
  draft: initial,
  onSave,
  onCancel,
}: {
  draft: QuestionInput | AdminQuestion;
  onSave: (draft: QuestionInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial.text);
  const [choices, setChoices] = useState<string[]>([...initial.choices]);
  const [correctIndex, setCorrectIndex] = useState(initial.correctIndex);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!text.trim() || choices.some((choice) => !choice.trim())) {
      toast.error("กรอกคำถามและตัวเลือกให้ครบทุกช่อง");
      return;
    }

    setSaving(true);
    try {
      await onSave({ text: text.trim(), choices: choices.map((c) => c.trim()), correctIndex });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-primary/40 bg-muted/30 p-3">
      <div className="space-y-1.5">
        <Label htmlFor="question-text" className="text-xs">
          คำถาม
        </Label>
        <Textarea
          id="question-text"
          value={text}
          rows={2}
          onChange={(event) => setText(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">ตัวเลือก (เลือกวงกลมหน้าข้อที่ถูก)</Label>
        {choices.map((choice, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="radio"
              name="correct-choice"
              checked={correctIndex === index}
              onChange={() => setCorrectIndex(index)}
              aria-label={`ตัวเลือกที่ ${index + 1} คือคำตอบที่ถูก`}
              className="size-4 accent-primary"
            />
            <Input
              value={choice}
              onChange={(event) =>
                setChoices((current) =>
                  current.map((item, i) => (i === index ? event.target.value : item)),
                )
              }
              className="h-8"
            />
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button size="sm" disabled={saving} onClick={save}>
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          บันทึก
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          ยกเลิก
        </Button>
      </div>
    </div>
  );
}
