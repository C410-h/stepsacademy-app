import { useState } from "react";
import { Headphones, GraduationCap, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatLayout } from "./ChatLayout";
import type { BroadcastRecipient } from "./BroadcastDialog";
import type { ChatRoom } from "./types";

type Tab = "support_students" | "support_teachers" | "monitor";

const TABS: { value: Tab; label: string; icon: typeof Headphones }[] = [
  { value: "support_students", label: "Suporte alunos",   icon: Headphones },
  { value: "support_teachers", label: "Suporte profs",    icon: GraduationCap },
  { value: "monitor",          label: "Monitor aluno↔prof", icon: Users },
];

interface StudentLite { userId: string; profile: { name: string } | null; language: { name: string } | null }
interface TeacherLite { userId: string; name: string }

interface Props {
  students: StudentLite[];
  teachers: TeacherLite[];
}

export function AdminChatPane({ students, teachers }: Props) {
  const [tab, setTab] = useState<Tab>("support_students");

  const filterFor = (t: Tab) => (room: ChatRoom): boolean => {
    if (t === "support_students") {
      return room.kind === "support" && room.members.some(m => m.role === "student");
    }
    if (t === "support_teachers") {
      return room.kind === "support" && room.members.some(m => m.role === "teacher");
    }
    // monitor
    return room.kind === "student_teacher";
  };

  // Broadcast recipients per tab
  const studentRecs: BroadcastRecipient[] = students
    .filter(s => s.userId)
    .map(s => ({ user_id: s.userId, name: s.profile?.name ?? "—", subtitle: `Aluno · ${s.language?.name ?? ""}` }));
  const teacherRecs: BroadcastRecipient[] = teachers
    .filter(t => t.userId)
    .map(t => ({ user_id: t.userId, name: t.name, subtitle: "Professor" }));

  const broadcastRecipients =
    tab === "support_students" ? studentRecs :
    tab === "support_teachers" ? teacherRecs :
    [...studentRecs, ...teacherRecs];

  const emptyHint =
    tab === "support_students" ? "Nenhum aluno entrou em contato com o suporte ainda." :
    tab === "support_teachers" ? "Nenhum professor entrou em contato com o suporte ainda." :
    "Nenhuma conversa entre alunos e professores ainda.";

  return (
    <div className="space-y-3">
      {/* Sub-tabs */}
      <div className="flex gap-1 flex-wrap border-b">
        {TABS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-2 border-b-2 -mb-px transition-colors",
              tab === value
                ? "border-[var(--theme-brand-on-bg)] text-[var(--theme-brand-on-bg)] font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="h-[calc(100vh-220px)] min-h-[500px]">
        <ChatLayout
          key={tab}
          roomsFilter={filterFor(tab)}
          broadcastRecipients={broadcastRecipients}
          emptyHint={emptyHint}
        />
      </div>
    </div>
  );
}
