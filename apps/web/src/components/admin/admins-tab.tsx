import { Badge } from "@singpore-game/ui/components/badge";
import { Button } from "@singpore-game/ui/components/button";
import { Input } from "@singpore-game/ui/components/input";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { type AdminEntry, api } from "@/lib/api";

export function AdminsTab() {
  const [admins, setAdmins] = useState<AdminEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setAdmins(await api.admin.admins());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "โหลดรายชื่อผู้ดูแลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = async () => {
    const value = email.trim();
    if (!value) return;

    setSaving(true);
    try {
      await api.admin.addAdmin(value, note.trim() || null);
      setEmail("");
      setNote("");
      await refresh();
      toast.success(`เพิ่ม ${value.toLowerCase()} เป็นผู้ดูแลแล้ว`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "เพิ่มผู้ดูแลไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      <div className="space-y-2 rounded-md border border-border p-3">
        <p className="font-medium text-sm">เพิ่มผู้ดูแล</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="อีเมล"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void add();
            }}
            className="h-8 w-56"
          />
          <Input
            placeholder="โน้ต (ไม่บังคับ)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void add();
            }}
            className="h-8 w-48"
          />
          <Button size="sm" disabled={saving || !email.trim()} onClick={() => void add()}>
            <Plus className="size-3.5" />
            เพิ่ม
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          เพิ่มไว้ล่วงหน้าได้แม้เจ้าตัวยังไม่เคยล็อกอิน · ผู้ดูแลข้ามข้อจำกัดโดเมนอีเมลได้
        </p>
      </div>

      <div className="space-y-2">
        {admins.map((admin) => (
          <AdminRow key={admin.email} admin={admin} onRefresh={refresh} />
        ))}
      </div>
    </div>
  );
}

function AdminRow({ admin, onRefresh }: { admin: AdminEntry; onRefresh: () => Promise<void> }) {
  const [removing, setRemoving] = useState(false);
  const locked = admin.isRoot || admin.isSelf;

  const remove = async () => {
    setRemoving(true);
    try {
      await api.admin.removeAdmin(admin.email);
      await onRefresh();
      toast.success(`ถอดสิทธิ์ ${admin.email} แล้ว`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ถอดสิทธิ์ไม่สำเร็จ");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-md border border-border p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-sm">{admin.email}</span>
          {admin.isRoot && <Badge variant="secondary">ผู้ดูแลหลัก</Badge>}
          {admin.isSelf && <Badge variant="outline">คุณ</Badge>}
        </div>
        <p className="text-muted-foreground text-xs">
          {admin.note && <span>{admin.note} · </span>}
          {admin.isRoot
            ? "ตั้งค่าจาก ADMIN_EMAILS"
            : admin.addedByEmail
              ? `เพิ่มโดย ${admin.addedByEmail}`
              : "เพิ่มจากฐานข้อมูล"}
        </p>
      </div>

      <Button
        size="sm"
        variant="ghost"
        disabled={locked || removing}
        title={
          admin.isRoot
            ? "แก้ที่ ADMIN_EMAILS ในไฟล์ตั้งค่า"
            : admin.isSelf
              ? "ถอดสิทธิ์ตัวเองไม่ได้"
              : "ถอดสิทธิ์"
        }
        onClick={() => void remove()}
      >
        {removing ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      </Button>
    </div>
  );
}
