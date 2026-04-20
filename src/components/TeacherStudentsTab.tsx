import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { updateStudentStep } from "@/lib/studentProgress";
import {
  Search, CalendarPlus, BookOpen, AlertTriangle,
  Phone, Mail, CalendarCheck, Flame, TrendingUp,
  CheckCircle2, XCircle, Clock, RefreshCw,
} from "lucide-react";
import type { ScheduleStudent } from "@/components/ScheduleClassSheet";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type HealthStatus = "ok" | "attention" | "missed_pending";
type FilterOption = "all" | "missed_pending" | "no_session";

interface StudentSession {
  id: string;
  scheduled_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
}

interface StudentsTabStudent {
  studentId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  languageId: string;
  languageName: string;
  levelId: string;
  levelName: string;
  levelCode: string;
  totalSteps: number;
  studentStatus: string;
  healthStatus: HealthStatus;
  nextSession: StudentSession | null;
  lastCompleted: StudentSession | null;
  missedPendingSessions: StudentSession[];
  missedThisMonth: number;
  rescheduledThisMonth: number;
  xpTotal: number;
  streakCurrent: number;
}

interface DrawerData {
  email: string;
  phone: string | null;
  sessions: StudentSession[];
  stepsCompleted: number;
  totalSteps: number;
  currentNotes: string;
  lastSessionId: string | null;
}

interface Props {
  profileId: string;
  teacherId: string;
  onSchedule: (s?: ScheduleStudent) => void;
}

// ── Utilitários ───────────────────────────────────────────────────────────────

const getInitials = (name: string) =>
  name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

const ptDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });

const ptDateTime = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const h = d.getHours();
  const m = d.getMinutes();
  const time = m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
  if (d.toDateString() === now.toDateString()) return `Hoje ${time}`;
  const tom = new Date(now);
  tom.setDate(now.getDate() + 1);
  if (d.toDateString() === tom.toDateString()) return `Amanhã ${time}`;
  const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  return `${days[d.getDay()]} ${time}`;
};

const isThisMonth = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
};

const SESSION_STATUS_MAP: Record<string, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  scheduled:       { label: "Agendada",         color: "text-blue-600",   Icon: Clock },
  completed:       { label: "Concluída",         color: "text-green-600",  Icon: CheckCircle2 },
  rescheduled:     { label: "Remarcada",         color: "text-amber-600",  Icon: RefreshCw },
  missed_pending:  { label: "Falta pendente",    color: "text-orange-600", Icon: AlertTriangle },
  missed:          { label: "Falta",             color: "text-red-600",    Icon: XCircle },
  missed_recovered:{ label: "Falta recuperada",  color: "text-teal-600",   Icon: RefreshCw },
};

const HEALTH_MAP: Record<HealthStatus, { label: string; className: string }> = {
  ok:             { label: "Em dia",        className: "bg-green-100 text-green-800" },
  attention:      { label: "Atenção",       className: "bg-amber-100 text-amber-800" },
  missed_pending: { label: "Falta pendente",className: "bg-red-100 text-red-800" },
};

// ── Componente ────────────────────────────────────────────────────────────────

const TeacherStudentsTab = ({ profileId, teacherId, onSchedule }: Props) => {
  const { toast } = useToast();

  const [students, setStudents] = useState<StudentsTabStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterOption>("all");

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerStudent, setDrawerStudent] = useState<StudentsTabStudent | null>(null);
  const [drawerData, setDrawerData] = useState<DrawerData | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerNotes, setDrawerNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [confirmingAbsence, setConfirmingAbsence] = useState<string | null>(null);

  // Step update
  const [stepLevelId, setStepLevelId] = useState("");
  const [stepUnitId, setStepUnitId] = useState("");
  const [newStepId, setNewStepId] = useState("");
  const [stepLevels, setStepLevels] = useState<{ id: string; name: string; code: string }[]>([]);
  const [stepUnits, setStepUnits] = useState<{ id: string; number: number; title: string }[]>([]);
  const [stepSteps, setStepSteps] = useState<{ id: string; number: number; title: string }[]>([]);
  const [confirmStepOpen, setConfirmStepOpen] = useState(false);
  const [updatingStep, setUpdatingStep] = useState(false);

  useEffect(() => {
    loadData();
  }, [profileId, teacherId]);

  // ── Fetch principal ────────────────────────────────────────────────────────

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: tsRows } = await supabase
        .from("teacher_students")
        .select(`
          students!inner(
            id, user_id, current_step_id, status, language_id, level_id,
            levels!students_level_id_fkey(name, code, total_steps),
            languages!students_language_id_fkey(name)
          )
        `)
        .eq("teacher_id", teacherId);

      if (!tsRows || tsRows.length === 0) {
        setLoading(false);
        return;
      }

      const studentIds = tsRows.map((r: any) => r.students.id);
      const userIds = tsRows.map((r: any) => r.students.user_id);

      const [{ data: profileRows }, { data: sessions }, { data: gamif }] = await Promise.all([
        supabase.from("profiles").select("id, name, avatar_url").in("id", userIds),
        (supabase as any)
          .from("class_sessions")
          .select("id, student_id, scheduled_at, ends_at, status, notes")
          .eq("teacher_id", profileId)
          .in("student_id", studentIds)
          .order("scheduled_at", { ascending: false }),
        supabase
          .from("student_gamification")
          .select("student_id, xp_total, streak_current")
          .in("student_id", studentIds),
      ]);

      const nowIso = new Date().toISOString();
      const allSessions: StudentSession[] = sessions || [];

      const enriched: StudentsTabStudent[] = tsRows.map((r: any) => {
        const s = r.students;
        const prof = (profileRows || []).find((p: any) => p.id === s.user_id);
        const g = (gamif || []).find((g: any) => g.student_id === s.id);
        const sSessions = allSessions.filter((ss) => ss.student_id === s.id);

        const nextSession =
          [...sSessions]
            .filter((ss) => ss.status === "scheduled" && ss.scheduled_at > nowIso)
            .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0] ?? null;

        const lastCompleted =
          sSessions.find((ss) => ss.status === "completed") ?? null;

        const missedPending = sSessions.filter((ss) => ss.status === "missed_pending");

        const missedThisMonth = sSessions.filter(
          (ss) => ss.status === "missed" && isThisMonth(ss.scheduled_at)
        ).length;

        const rescheduledThisMonth = sSessions.filter(
          (ss) => ss.status === "rescheduled" && isThisMonth(ss.scheduled_at)
        ).length;

        const healthStatus: HealthStatus =
          missedPending.length > 0
            ? "missed_pending"
            : missedThisMonth > 0
            ? "attention"
            : "ok";

        return {
          studentId: s.id,
          userId: s.user_id,
          name: prof?.name ?? "Aluno",
          avatarUrl: prof?.avatar_url ?? null,
          languageId: s.language_id ?? "",
          languageName: s.languages?.name ?? "—",
          levelId: s.level_id ?? "",
          levelName: s.levels?.name ?? "—",
          levelCode: s.levels?.code ?? "",
          totalSteps: s.levels?.total_steps ?? 30,
          studentStatus: s.status ?? "active",
          healthStatus,
          nextSession,
          lastCompleted,
          missedPendingSessions: missedPending,
          missedThisMonth,
          rescheduledThisMonth,
          xpTotal: g?.xp_total ?? 0,
          streakCurrent: g?.streak_current ?? 0,
        };
      });

      setStudents(enriched);
    } finally {
      setLoading(false);
    }
  };

  // ── Filtro + busca ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = students;
    if (filter === "missed_pending") list = list.filter((s) => s.missedPendingSessions.length > 0);
    if (filter === "no_session") list = list.filter((s) => !s.nextSession);
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(term));
    }
    return list;
  }, [students, filter, search]);

  // ── Drawer ─────────────────────────────────────────────────────────────────

  const openDrawer = async (student: StudentsTabStudent) => {
    setDrawerStudent(student);
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerData(null);
    setNewStepId(""); setStepUnitId(""); setStepSteps([]);

    // Pre-load levels for the student's language
    if (student.languageId) {
      supabase.from("levels").select("id, name, code").eq("language_id", student.languageId).order("order_index")
        .then(({ data }) => { setStepLevels(data || []); });
    }
    setStepLevelId(student.levelId || "");

    const [{ data: prof }, { data: allSessions }, { data: progress }] = await Promise.all([
      supabase.from("profiles").select("email, phone").eq("id", student.userId).maybeSingle() as any,
      (supabase as any)
        .from("class_sessions")
        .select("id, scheduled_at, ends_at, status, notes")
        .eq("teacher_id", profileId)
        .eq("student_id", student.studentId)
        .order("scheduled_at", { ascending: false }),
      supabase
        .from("student_progress")
        .select("id")
        .eq("student_id", student.studentId)
        .eq("status", "done"),
    ]);

    const sessions: StudentSession[] = allSessions || [];
    const lastSessionId = sessions[0]?.id ?? null;
    const currentNotes = sessions[0]?.notes ?? "";

    setDrawerData({
      email: (prof as any)?.email ?? "",
      phone: (prof as any)?.phone ?? null,
      sessions,
      stepsCompleted: (progress || []).length,
      totalSteps: student.totalSteps,
      currentNotes,
      lastSessionId,
    });
    setDrawerNotes(currentNotes);
    setDrawerLoading(false);
  };

  const saveNotes = async () => {
    if (!drawerData?.lastSessionId) {
      toast({ title: "Nenhuma sessão recente para salvar.", variant: "destructive" });
      return;
    }
    setSavingNotes(true);
    await (supabase as any)
      .from("class_sessions")
      .update({ notes: drawerNotes || null })
      .eq("id", drawerData.lastSessionId);
    toast({ title: "Observações salvas!" });
    setSavingNotes(false);
  };

  const confirmAbsence = async (sessionId: string) => {
    setConfirmingAbsence(sessionId);
    const { error } = await (supabase as any)
      .from("class_sessions")
      .update({
        status: "missed",
        missed_confirmed_at: new Date().toISOString(),
        missed_confirmed_by: profileId,
      })
      .eq("id", sessionId);

    if (error) {
      toast({ title: "Erro ao confirmar falta.", variant: "destructive" });
    } else {
      toast({
        title: "Falta confirmada.",
        description: "O aluno foi notificado sobre a falta registrada.",
      });
      await loadData();
      setDrawerOpen(false);
    }
    setConfirmingAbsence(null);
  };

  // ── Step update cascade ───────────────────────────────────────────────────

  useEffect(() => {
    if (!stepLevelId) { setStepUnits([]); setStepUnitId(""); setStepSteps([]); setNewStepId(""); return; }
    supabase.from("units").select("id, number, title").eq("level_id", stepLevelId).order("number")
      .then(({ data }) => { setStepUnits(data || []); setStepUnitId(""); setStepSteps([]); setNewStepId(""); });
  }, [stepLevelId]);

  useEffect(() => {
    if (!stepUnitId) { setStepSteps([]); setNewStepId(""); return; }
    supabase.from("steps").select("id, number, title").eq("unit_id", stepUnitId).order("number")
      .then(({ data }) => { setStepSteps(data || []); setNewStepId(""); });
  }, [stepUnitId]);

  const handleUpdateStep = async () => {
    if (!drawerStudent || !newStepId) return;
    setUpdatingStep(true);
    try {
      await updateStudentStep(supabase as any, drawerStudent.studentId, newStepId);
      toast({ title: "Step atualizado!", description: "O progresso do aluno foi atualizado com sucesso." });
      setConfirmStepOpen(false);
      setNewStepId(""); setStepUnitId(""); setStepLevelId("");
      await loadData();
    } catch (e: any) {
      toast({ title: "Erro ao atualizar step", description: e.message, variant: "destructive" });
    }
    setUpdatingStep(false);
  };

  // ── Skeleton ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Header + busca + filtro */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Meus Alunos</h2>
          <span className="text-sm text-muted-foreground font-light">
            {students.length} {students.length === 1 ? "aluno" : "alunos"}
          </span>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar por nome…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterOption)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="missed_pending">Com falta pendente</SelectItem>
              <SelectItem value="no_session">Sem aula agendada</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <Card>
          <CardContent className="py-14 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-bold">
              {students.length === 0
                ? "Nenhum aluno vinculado ainda."
                : "Nenhum aluno encontrado."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map((student) => {
          const health = HEALTH_MAP[student.healthStatus];
          return (
            <Card key={student.studentId} className="overflow-hidden">
              <CardContent className="p-4 space-y-4">

                {/* Cabeçalho */}
                <div className="flex items-start gap-3">
                  <Avatar className="h-11 w-11 shrink-0">
                    <AvatarImage src={student.avatarUrl || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
                      {getInitials(student.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold truncate">{student.name}</p>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">
                        {student.levelName}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground font-light">{student.languageName}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full",
                      health.className
                    )}
                  >
                    {health.label}
                  </span>
                </div>

                {/* Métricas em grid 2×3 */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                  <div>
                    <p className="text-muted-foreground flex items-center gap-1 mb-0.5">
                      <Clock className="h-3 w-3" /> Próxima aula
                    </p>
                    <p className="font-semibold">
                      {student.nextSession
                        ? ptDateTime(student.nextSession.scheduled_at)
                        : <span className="text-muted-foreground font-light">Não agendada</span>}
                    </p>
                  </div>

                  <div>
                    <p className="text-muted-foreground flex items-center gap-1 mb-0.5">
                      <CalendarCheck className="h-3 w-3" /> Última concluída
                    </p>
                    <p className="font-semibold">
                      {student.lastCompleted
                        ? ptDate(student.lastCompleted.scheduled_at)
                        : <span className="text-muted-foreground font-light">—</span>}
                    </p>
                  </div>

                  <div>
                    <p className="text-muted-foreground flex items-center gap-1 mb-0.5">
                      <Flame className="h-3 w-3" /> Streak
                    </p>
                    <p className="font-semibold">🔥 {student.streakCurrent} dias</p>
                  </div>

                  <div>
                    <p className="text-muted-foreground flex items-center gap-1 mb-0.5">
                      <TrendingUp className="h-3 w-3" /> XP total
                    </p>
                    <p className="font-semibold">{student.xpTotal}</p>
                  </div>

                  <div>
                    <p className="text-muted-foreground mb-0.5">Faltas/mês</p>
                    <p className={cn("font-semibold", student.missedThisMonth > 0 && "text-red-600")}>
                      {student.missedThisMonth}
                    </p>
                  </div>

                  <div>
                    <p className="text-muted-foreground mb-0.5">Remarc./mês</p>
                    <p className={cn("font-semibold", student.rescheduledThisMonth > 0 && "text-amber-600")}>
                      {student.rescheduledThisMonth}
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Rodapé */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5 text-xs"
                    onClick={() =>
                      onSchedule({
                        studentId: student.studentId,
                        userId: student.userId,
                        name: student.name,
                        languageName: student.languageName,
                      })
                    }
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                    Agendar aula
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5 text-xs"
                    onClick={() => openDrawer(student)}
                  >
                    Ver ficha
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Drawer de ficha ── */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg overflow-y-auto flex flex-col gap-0 p-0"
          style={{ fontFamily: "'Libre Franklin', sans-serif" }}
        >
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle>Ficha do aluno</SheetTitle>
          </SheetHeader>

          {drawerLoading || !drawerData ? (
            <div className="p-6 space-y-4">
              <div className="flex gap-3">
                <Skeleton className="h-14 w-14 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">

              {/* Perfil */}
              <div className="px-6 py-5 space-y-3">
                <div className="flex items-start gap-4">
                  <Avatar className="h-14 w-14 shrink-0">
                    <AvatarImage src={drawerStudent?.avatarUrl || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">
                      {getInitials(drawerStudent?.name || "")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="font-bold text-base truncate">{drawerStudent?.name}</p>
                    {drawerData.email && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 font-light">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        {drawerData.email}
                      </p>
                    )}
                    {drawerData.phone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 font-light">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        {drawerData.phone}
                      </p>
                    )}
                  </div>
                </div>

                {/* Nível + progresso */}
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span>
                      {drawerStudent?.levelName} · {drawerStudent?.languageName}
                    </span>
                    <span>
                      {drawerData.stepsCompleted} / {drawerData.totalSteps} passos
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(
                          (drawerData.stepsCompleted / Math.max(drawerData.totalSteps, 1)) * 100,
                          100
                        )}%`,
                        backgroundColor: "var(--theme-accent)",
                      }}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Faltas pendentes */}
              {drawerStudent && drawerStudent.missedPendingSessions.length > 0 && (
                <div className="px-6 py-4 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Faltas aguardando confirmação
                  </p>
                  {drawerStudent.missedPendingSessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg bg-orange-50 border border-orange-200"
                    >
                      <div>
                        <p className="text-sm font-semibold text-orange-800">
                          {ptDateTime(session.scheduled_at)}
                        </p>
                        <p className="text-xs text-orange-600 font-light">Falta pendente</p>
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="shrink-0 text-xs"
                        disabled={confirmingAbsence === session.id}
                        onClick={() => confirmAbsence(session.id)}
                      >
                        {confirmingAbsence === session.id ? "Confirmando…" : "Confirmar falta"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {drawerStudent && drawerStudent.missedPendingSessions.length > 0 && (
                <Separator />
              )}

              {/* Histórico de sessões */}
              <div className="px-6 py-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Histórico de aulas
                </p>
                {drawerData.sessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground font-light py-2">
                    Nenhuma sessão registrada.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {drawerData.sessions.map((session) => {
                      const info = SESSION_STATUS_MAP[session.status] ?? {
                        label: session.status,
                        color: "text-muted-foreground",
                        Icon: Clock,
                      };
                      return (
                        <div
                          key={session.id}
                          className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/40"
                        >
                          <info.Icon className={cn("h-4 w-4 shrink-0", info.color)} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{ptDateTime(session.scheduled_at)}</p>
                          </div>
                          <span className={cn("text-xs font-medium shrink-0", info.color)}>
                            {info.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <Separator />

              {/* Observações */}
              <div className="px-6 py-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Observações
                </p>
                <Textarea
                  placeholder="Anotações sobre o aluno, dificuldades, pontos de atenção…"
                  className="text-sm font-light resize-none"
                  rows={4}
                  value={drawerNotes}
                  onChange={(e) => setDrawerNotes(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs"
                  onClick={saveNotes}
                  disabled={savingNotes}
                >
                  {savingNotes ? "Salvando…" : "Salvar observações"}
                </Button>
              </div>

              <Separator />

              {/* Atualizar step */}
              <div className="px-6 py-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Step atual
                </p>
                <div className="space-y-2">
                  <Select value={stepLevelId} onValueChange={setStepLevelId}>
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue placeholder="Selecionar nível…" />
                    </SelectTrigger>
                    <SelectContent>
                      {stepLevels.map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {stepLevelId && (
                    <Select value={stepUnitId} onValueChange={setStepUnitId}>
                      <SelectTrigger className="text-xs h-8">
                        <SelectValue placeholder="Selecionar unidade…" />
                      </SelectTrigger>
                      <SelectContent>
                        {stepUnits.map((u) => (
                          <SelectItem key={u.id} value={u.id}>Unidade {u.number} — {u.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {stepUnitId && (
                    <Select value={newStepId} onValueChange={setNewStepId}>
                      <SelectTrigger className="text-xs h-8">
                        <SelectValue placeholder="Selecionar step…" />
                      </SelectTrigger>
                      <SelectContent>
                        {stepSteps.map((s) => (
                          <SelectItem key={s.id} value={s.id}>Step {s.number} — {s.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-xs"
                    disabled={!newStepId}
                    onClick={() => setConfirmStepOpen(true)}
                  >
                    Atualizar step
                  </Button>
                </div>
              </div>

              <div className="h-6" />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmStepOpen} onOpenChange={setConfirmStepOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Atualizar step do aluno?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os steps anteriores serão marcados como concluídos. O step selecionado será definido como o atual. Esta ação não pode ser desfeita facilmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updatingStep}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={updatingStep} onClick={handleUpdateStep}>
              {updatingStep ? "Atualizando…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TeacherStudentsTab;
