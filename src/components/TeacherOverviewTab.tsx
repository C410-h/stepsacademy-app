import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Users, CalendarCheck, Clock, AlertTriangle,
  CalendarPlus, BookOpen, CheckCircle2,
} from "lucide-react";
import type { ScheduleStudent } from "@/components/ScheduleClassSheet";
import TeacherUpcomingClasses from "@/components/TeacherUpcomingClasses";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface OverviewStudent {
  studentId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  languageName: string;
  levelName: string;
  totalSteps: number;
  status: string;
  nextSession: { id: string; scheduled_at: string } | null;
  lastCompleted: { scheduled_at: string } | null;
  missedPending: number;
  xpTotal: number;
  streakCurrent: number;
  hasMaterial: boolean;
}

interface Props {
  profileId: string;
  teacherId: string;
  onSchedule: (s?: ScheduleStudent) => void;
  onSwitchToStudents: () => void;
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

// ── Componente ────────────────────────────────────────────────────────────────

const TeacherOverviewTab = ({ profileId, teacherId, onSchedule, onSwitchToStudents }: Props) => {
  const { toast } = useToast();
  const [students, setStudents] = useState<OverviewStudent[]>([]);
  const [metrics, setMetrics] = useState({
    active: 0,
    completedThisMonth: 0,
    nextSession: null as string | null,
    missedPending: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [profileId, teacherId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: tsRows } = await supabase
        .from("teacher_students")
        .select(`
          students!inner(
            id, user_id, current_step_id, status,
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
      const stepIds = tsRows
        .map((r: any) => r.students.current_step_id)
        .filter(Boolean) as string[];

      const [
        { data: profileRows },
        { data: sessions },
        { data: gamif },
      ] = await Promise.all([
        supabase.from("profiles").select("id, name, avatar_url").in("id", userIds),
        (supabase as any)
          .from("class_sessions")
          .select("id, student_id, scheduled_at, status")
          .eq("teacher_id", profileId)
          .in("student_id", studentIds)
          .order("scheduled_at"),
        supabase
          .from("student_gamification")
          .select("student_id, xp_total, streak_current")
          .in("student_id", studentIds),
      ]);

      const submissions: any[] = stepIds.length
        ? (
            await supabase
              .from("content_submissions")
              .select("step_id, status")
              .eq("teacher_id", teacherId)
              .in("step_id", stepIds)
              .eq("status", "approved")
          ).data || []
        : [];

      const nowIso = new Date().toISOString();
      const allSessions: any[] = sessions || [];

      // Métricas globais
      const missedPendingAll = allSessions.filter((s) => s.status === "missed_pending");
      const nextGlobal = allSessions
        .filter((s) => s.status === "scheduled" && s.scheduled_at > nowIso)
        .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];

      setMetrics({
        active: tsRows.filter((r: any) => r.students.status === "active").length,
        completedThisMonth: allSessions.filter(
          (s) => s.status === "completed" && isThisMonth(s.scheduled_at)
        ).length,
        nextSession: nextGlobal?.scheduled_at ?? null,
        missedPending: missedPendingAll.length,
      });

      // Dados por aluno
      const enriched: OverviewStudent[] = tsRows.map((r: any) => {
        const s = r.students;
        const prof = (profileRows || []).find((p: any) => p.id === s.user_id);
        const g = (gamif || []).find((g: any) => g.student_id === s.id);
        const hasSub = submissions.some((sub) => sub.step_id === s.current_step_id);
        const sSessions = allSessions.filter((ss) => ss.student_id === s.id);

        const nextSession =
          sSessions
            .filter((ss) => ss.status === "scheduled" && ss.scheduled_at > nowIso)
            .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0] ?? null;

        const lastCompleted =
          sSessions
            .filter((ss) => ss.status === "completed")
            .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))[0] ?? null;

        return {
          studentId: s.id,
          userId: s.user_id,
          name: prof?.name ?? "Aluno",
          avatarUrl: prof?.avatar_url ?? null,
          languageName: s.languages?.name ?? "—",
          levelName: s.levels?.name ?? "—",
          totalSteps: s.levels?.total_steps ?? 30,
          status: s.status ?? "active",
          nextSession: nextSession ? { id: nextSession.id, scheduled_at: nextSession.scheduled_at } : null,
          lastCompleted: lastCompleted ? { scheduled_at: lastCompleted.scheduled_at } : null,
          missedPending: sSessions.filter((ss) => ss.status === "missed_pending").length,
          xpTotal: g?.xp_total ?? 0,
          streakCurrent: g?.streak_current ?? 0,
          hasMaterial: hasSub,
        };
      });

      setStudents(enriched);
    } finally {
      setLoading(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Métricas ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Alunos ativos
              </span>
              <Users className="h-4 w-4 text-primary" />
            </div>
            <p className="text-3xl font-bold">{metrics.active}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Aulas este mês
              </span>
              <CalendarCheck className="h-4 w-4 text-green-600" />
            </div>
            <p className="text-3xl font-bold">{metrics.completedThisMonth}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Próxima aula
              </span>
              <Clock className="h-4 w-4 text-blue-500" />
            </div>
            {metrics.nextSession ? (
              <p className="text-xl font-bold leading-tight">{ptDateTime(metrics.nextSession)}</p>
            ) : (
              <p className="text-sm text-muted-foreground font-light">Nenhuma</p>
            )}
          </CardContent>
        </Card>

        <Card className={metrics.missedPending > 0 ? "border-red-200 bg-red-50" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Atenção
              </span>
              <AlertTriangle
                className={cn(
                  "h-4 w-4",
                  metrics.missedPending > 0 ? "text-red-500" : "text-muted-foreground"
                )}
              />
            </div>
            <div className="flex items-end gap-2">
              <p className={cn("text-3xl font-bold", metrics.missedPending > 0 && "text-red-600")}>
                {metrics.missedPending}
              </p>
              {metrics.missedPending > 0 && (
                <span className="text-xs text-red-500 font-medium mb-1">
                  {metrics.missedPending === 1 ? "falta pend." : "faltas pend."}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Banner missed_pending ── */}
      {metrics.missedPending > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="flex-1 text-sm font-medium text-amber-800">
            {metrics.missedPending === 1
              ? "1 aula aguardando confirmação de falta"
              : `${metrics.missedPending} aulas aguardando confirmação de falta`}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100"
            onClick={onSwitchToStudents}
          >
            Revisar
          </Button>
        </div>
      )}

      {/* ── Próximas aulas (Google Calendar) ── */}
      <div className="space-y-3">
        <p className="text-sm font-bold">Aulas de hoje</p>
        <TeacherUpcomingClasses />
      </div>

      {/* ── Cards de alunos ── */}
      {students.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-bold">Nenhum aluno vinculado ainda.</p>
            <p className="text-xs text-muted-foreground font-light mt-1">
              Peça ao administrador para vincular alunos à sua conta.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {students.map((student) => (
            <Card
              key={student.studentId}
              className="cursor-pointer hover:shadow-md transition-shadow group"
              onClick={onSwitchToStudents}
            >
              <CardContent className="p-4 space-y-3">

                {/* Cabeçalho do card */}
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={student.avatarUrl || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                      {getInitials(student.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm truncate">{student.name}</p>
                      {student.missedPending > 0 && (
                        <Badge variant="destructive" className="text-[9px] h-4 px-1">
                          {student.missedPending} falta
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-light">
                      {student.languageName} · {student.levelName}
                    </p>
                  </div>
                </div>

                {/* Grade de infos */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <p className="text-muted-foreground mb-0.5">Próx. aula</p>
                    {student.nextSession ? (
                      <p className="font-semibold">{ptDateTime(student.nextSession.scheduled_at)}</p>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2 gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSchedule({
                            studentId: student.studentId,
                            userId: student.userId,
                            name: student.name,
                            languageName: student.languageName,
                          });
                        }}
                      >
                        <CalendarPlus className="h-3 w-3" />
                        Agendar
                      </Button>
                    )}
                  </div>

                  <div>
                    <p className="text-muted-foreground mb-0.5">Material</p>
                    <p
                      className={cn(
                        "font-semibold flex items-center gap-1",
                        student.hasMaterial ? "text-green-600" : "text-amber-600"
                      )}
                    >
                      {student.hasMaterial ? (
                        <><CheckCircle2 className="h-3 w-3" /> Pronto</>
                      ) : (
                        <><AlertTriangle className="h-3 w-3" /> Pendente</>
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-muted-foreground mb-0.5">Última aula</p>
                    <p className="font-semibold">
                      {student.lastCompleted ? ptDate(student.lastCompleted.scheduled_at) : "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-muted-foreground mb-0.5">Streak</p>
                    <p className="font-semibold">🔥 {student.streakCurrent} dias</p>
                  </div>
                </div>

                {/* Barra XP */}
                <div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                    <span>{student.levelName}</span>
                    <span>{student.xpTotal} XP</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(
                          (student.xpTotal / Math.max(student.totalSteps * 30, 1)) * 100,
                          100
                        )}%`,
                        backgroundColor: "var(--theme-accent)",
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeacherOverviewTab;
