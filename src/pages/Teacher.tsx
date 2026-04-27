import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import TeacherLayout from "@/components/TeacherLayout";
import TeacherContentTab from "@/components/TeacherContentTab";
import TeacherAgendaTab from "@/components/TeacherAgendaTab";
import TeacherAvailabilityTab from "@/components/TeacherAvailabilityTab";
import TeacherOverviewTab from "@/components/TeacherOverviewTab";
import TeacherStudentsTab from "@/components/TeacherStudentsTab";
import TeacherStatsTab from "@/components/TeacherStatsTab";
import TeacherProfileTab from "@/components/TeacherProfileTab";
import ScheduleClassSheet, { type ScheduleStudent } from "@/components/ScheduleClassSheet";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import {
  LayoutDashboard, Users, FileText, CalendarDays, Clock, CalendarPlus,
  BarChart2, User, MessageCircle,
} from "lucide-react";
import { useChatRooms } from "@/hooks/useChatRooms";
import { ChatLayout } from "@/components/chat/ChatLayout";
import type { BroadcastRecipient } from "@/components/chat/BroadcastDialog";
import { cn } from "@/lib/utils";

type ActiveTab = "overview" | "students" | "stats" | "agenda" | "content" | "chat" | "availability" | "profile";

const Teacher = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { totalUnread } = useChatRooms();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [pendingOpenStudentUserId, setPendingOpenStudentUserId] = useState<string | null>(null);

  useEffect(() => {
    const tab = searchParams.get("tab") as ActiveTab | null;
    const openUser = searchParams.get("openUser");
    if (tab) setActiveTab(tab);
    if (openUser) setPendingOpenStudentUserId(openUser);
    if (tab || openUser) setSearchParams({}, { replace: true });
  }, []);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [simpleStudents, setSimpleStudents] = useState<ScheduleStudent[]>([]);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [preSelectedStudent, setPreSelectedStudent] = useState<ScheduleStudent | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const initials = profile?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";

  useEffect(() => {
    if (!profile) return;
    loadData();
  }, [profile]);

  const loadData = async () => {
    if (!profile) return;
    setLoading(true);

    const { data: teacher } = await supabase
      .from("teachers")
      .select("id")
      .eq("user_id", profile.id)
      .maybeSingle();

    if (!teacher) { setLoading(false); return; }
    setTeacherId(teacher.id);

    // Lista leve de alunos apenas para o ScheduleClassSheet
    const { data: rows } = await supabase
      .from("teacher_students")
      .select("students!inner(id, user_id, languages!students_language_id_fkey(name))")
      .eq("teacher_id", teacher.id);

    if (rows) {
      const userIds = rows.map((r: any) => r.students.user_id).filter(Boolean) as string[];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", userIds);
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name]));
      const students = rows.map((r: any) => {
        const s = r.students;
        return {
          studentId: s.id,
          userId: s.user_id,
          name: profileMap.get(s.user_id) || "Aluno",
          languageName: s.languages?.name || "",
        };
      });
      setSimpleStudents(students);
    }

    setLoading(false);
  };

  const handleSchedule = (student?: ScheduleStudent) => {
    setPreSelectedStudent(student);
    setScheduleOpen(true);
  };

  // ── Nav ────────────────────────────────────────────────────────────────────

  const navItems: { value: ActiveTab; icon: typeof Users; label: string }[] = [
    { value: "overview",      icon: LayoutDashboard, label: "Overview" },
    { value: "students",      icon: Users,           label: "Alunos" },
    { value: "stats",         icon: BarChart2,       label: "Estatísticas" },
    { value: "agenda",        icon: CalendarDays,    label: "Agenda" },
    { value: "content",       icon: FileText,        label: "Conteúdo" },
    { value: "chat",          icon: MessageCircle,   label: "Mensagens" },
    { value: "availability",  icon: Clock,           label: "Horários" },
    { value: "profile",       icon: User,            label: "Perfil" },
  ];

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <TeacherLayout onMenuClick={() => setMobileNavOpen(true)}>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </TeacherLayout>
    );
  }

  if (!teacherId) {
    return (
      <TeacherLayout onMenuClick={() => setMobileNavOpen(true)}>
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <Users className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-bold">Perfil de professor não encontrado</h2>
          <p className="text-sm text-muted-foreground font-light">
            Entre em contato com a administração para configurar sua conta.
          </p>
        </div>
      </TeacherLayout>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <TeacherLayout onMenuClick={() => setMobileNavOpen(true)}>
      <div className="lg:grid lg:grid-cols-[240px,1fr] lg:gap-6 lg:items-start space-y-4 lg:space-y-0">

        {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col gap-3 sticky top-16">
          <Card>
            <CardContent className="p-4">
              {/* Perfil resumido */}
              <div className="flex items-center gap-3 pb-4 mb-4 border-b">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{profile?.name || "Professor"}</p>
                  <p className="text-xs text-muted-foreground font-light">Professor</p>
                </div>
              </div>

              {/* Nav */}
              <nav className="space-y-1">
                {navItems.map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    onClick={() => setActiveTab(value)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      activeTab === value
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">{label}</span>
                    {value === "chat" && totalUnread > 0 && (
                      <span className="text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--theme-brand-on-bg)] text-[var(--theme-text-on-brand)] flex items-center justify-center">
                        {totalUnread > 99 ? "99+" : totalUnread}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
            </CardContent>
          </Card>

          {/* Botão agendar */}
          <Card>
            <CardContent className="p-4">
              <Button
                className="w-full gap-2"
                size="sm"
                onClick={() => handleSchedule()}
                disabled={simpleStudents.length === 0}
              >
                <CalendarPlus className="h-4 w-4" />
                Agendar aula
              </Button>
            </CardContent>
          </Card>
        </aside>

        {/* ── Conteúdo principal ───────────────────────────────────────────── */}
        <div className="min-w-0 space-y-5">

          {/* Mobile: section label (drawer triggered from header burger) */}
          <div className="lg:hidden flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              {navItems.find(i => i.value === activeTab)?.label ?? ""}
            </p>
          </div>

          {/* Botão agendar mobile — visível na aba overview e students */}
          {(activeTab === "overview" || activeTab === "students") && (
            <div className="flex items-center justify-between lg:hidden">
              <h1 className="text-xl font-bold">
                {activeTab === "overview" ? "Overview" : "Meus Alunos"}
              </h1>
              <Button
                size="sm"
                className="gap-2 shrink-0"
                onClick={() => handleSchedule()}
                disabled={simpleStudents.length === 0}
              >
                <CalendarPlus className="h-4 w-4" />
                Agendar
              </Button>
            </div>
          )}

          {/* ══ Overview ══════════════════════════════════════════════════════ */}
          {activeTab === "overview" && (
            <TeacherOverviewTab
              profileId={profile!.id}
              teacherId={teacherId}
              onSchedule={handleSchedule}
              onSwitchToStudents={() => setActiveTab("students")}
            />
          )}

          {/* ══ Alunos ════════════════════════════════════════════════════════ */}
          {activeTab === "students" && (
            <TeacherStudentsTab
              profileId={profile!.id}
              teacherId={teacherId}
              onSchedule={handleSchedule}
              openStudentUserId={pendingOpenStudentUserId}
              onStudentOpened={() => setPendingOpenStudentUserId(null)}
            />
          )}

          {/* ══ Agenda ════════════════════════════════════════════════════════ */}
          {activeTab === "agenda" && (
            <TeacherAgendaTab
              profileId={profile!.id}
              onSchedule={handleSchedule}
              scheduleDisabled={simpleStudents.length === 0}
            />
          )}

          {/* ══ Estatísticas ══════════════════════════════════════════════════ */}
          {activeTab === "stats" && (
            <TeacherStatsTab profileId={profile!.id} teacherId={teacherId} />
          )}

          {/* ══ Conteúdo ══════════════════════════════════════════════════════ */}
          {activeTab === "content" && <TeacherContentTab teacherId={teacherId} profileId={profile!.id} />}

          {/* ══ Mensagens ═════════════════════════════════════════════════════ */}
          {activeTab === "chat" && (
            <div className="h-[calc(100vh-180px)] min-h-[500px]">
              <ChatLayout
                broadcastRecipients={simpleStudents.map(s => ({
                  user_id: s.userId,
                  name: s.name,
                  subtitle: s.languageName,
                }))}
                emptyHint="Conversas com seus alunos aparecerão aqui."
              />
            </div>
          )}

          {/* ══ Disponibilidade ═══════════════════════════════════════════════ */}
          {activeTab === "availability" && <TeacherAvailabilityTab />}

          {/* ══ Perfil ════════════════════════════════════════════════════════ */}
          {activeTab === "profile" && (
            <TeacherProfileTab
              profileId={profile!.id}
              onSwitchToAvailability={() => setActiveTab("availability")}
            />
          )}
        </div>
      </div>

      <ScheduleClassSheet
        open={scheduleOpen}
        onOpenChange={(open) => {
          setScheduleOpen(open);
          if (!open) setPreSelectedStudent(undefined);
        }}
        teacherProfileId={profile?.id}
        students={simpleStudents}
        preSelectedStudent={preSelectedStudent}
      />

      {/* ── Mobile nav drawer (hamburger) ─────────────────────────────────── */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="px-5 py-4 border-b">
            <SheetTitle className="text-left">
              <img src="/brand/logo-reto-darkpurple.webp" alt="steps academy" className="h-10 w-auto object-contain" />
            </SheetTitle>
          </SheetHeader>
          <nav className="p-3 space-y-0.5">
            {navItems.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => { setActiveTab(value); setMobileNavOpen(false); }}
                className={cn(
                  "flex items-center gap-3 text-sm px-3 py-2.5 rounded-md w-full text-left transition-colors",
                  activeTab === value
                    ? "bg-[var(--theme-accent)]/15 text-[var(--theme-brand-on-bg)] font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{label}</span>
                {value === "chat" && totalUnread > 0 && (
                  <span className="text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--theme-brand-on-bg)] text-[var(--theme-text-on-brand)] flex items-center justify-center">
                    {totalUnread > 99 ? "99+" : totalUnread}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </TeacherLayout>
  );
};

export default Teacher;
