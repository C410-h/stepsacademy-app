import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, Users, Zap, Flame, GraduationCap, TrendingUp } from "lucide-react";
import { startOfMonth, startOfYear, subMonths, format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Period = "month" | "last_month" | "3months" | "year";

interface SessionRow {
  id: string;
  teacher_id: string | null;
  student_id: string | null;
  status: string;
  scheduled_at: string;
  is_trial: boolean;
}

interface TeacherStats {
  teacherId: string;
  name: string;
  individual: number;
  group: number;
  trial: number;
  total: number;
}

interface StudentStats {
  studentId: string;
  name: string;
  teacherName: string;
  sessions: number;
  xpTotal: number;
  streak: number;
  lastSession: string | null;
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "month",      label: "Este mês" },
  { value: "last_month", label: "Mês passado" },
  { value: "3months",    label: "Últimos 3 meses" },
  { value: "year",       label: "Este ano" },
];

function getPeriodRange(period: Period): { start: Date; end: Date } {
  const now = new Date();
  if (period === "month")      return { start: startOfMonth(now), end: now };
  if (period === "last_month") return { start: startOfMonth(subMonths(now, 1)), end: startOfMonth(now) };
  if (period === "3months")    return { start: startOfMonth(subMonths(now, 2)), end: now };
  return { start: startOfYear(now), end: now };
}

const ptDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });

const AdminStatsTab = () => {
  const [period, setPeriod]           = useState<Period>("month");
  const [loading, setLoading]         = useState(true);
  const [sessions, setSessions]       = useState<SessionRow[]>([]);
  const [teacherMap, setTeacherMap]   = useState<Map<string, string>>(new Map());
  const [studentMap, setStudentMap]   = useState<Map<string, { name: string; teacherProfileId: string | null; xp: number; streak: number; isDemo: boolean }>>(new Map());

  const { start, end } = useMemo(() => getPeriodRange(period), [period]);

  useEffect(() => { loadData(); }, [period]);

  const loadData = async () => {
    setLoading(true);
    const { start, end } = getPeriodRange(period);

    const { data: sesData } = await (supabase as any)
      .from("class_sessions")
      .select("id, teacher_id, student_id, status, scheduled_at, is_trial")
      .in("status", ["attended", "completed", "rescheduled"])
      .gte("scheduled_at", start.toISOString())
      .lte("scheduled_at", end.toISOString());

    const rows: SessionRow[] = sesData || [];
    setSessions(rows);

    // Resolve teacher names (teacher_id = profile id)
    const teacherProfileIds = [...new Set(rows.map(r => r.teacher_id).filter(Boolean) as string[])];
    const studentIds = [...new Set(rows.map(r => r.student_id).filter(Boolean) as string[])];

    const [teacherProfs, tsRows, gamiRows] = await Promise.all([
      teacherProfileIds.length
        ? supabase.from("profiles").select("id, name").in("id", teacherProfileIds)
        : Promise.resolve({ data: [] }),
      studentIds.length
        ? (supabase as any).from("students").select("id, user_id, is_demo").in("id", studentIds)
        : Promise.resolve({ data: [] }),
      studentIds.length
        ? (supabase as any).from("student_gamification").select("student_id, xp_total, streak_current").in("student_id", studentIds)
        : Promise.resolve({ data: [] }),
    ]);

    const tMap = new Map(((teacherProfs.data || []) as any[]).map(p => [p.id, p.name]));
    setTeacherMap(tMap);

    const studUserIds = ((tsRows.data || []) as any[]).map(s => s.user_id);
    const { data: studProfs } = studUserIds.length
      ? await supabase.from("profiles").select("id, name").in("id", studUserIds)
      : { data: [] };

    const demoStudentIds = new Set(((tsRows.data || []) as any[]).filter(s => s.is_demo).map(s => s.id));
    const studUserMap = new Map(((tsRows.data || []) as any[]).map(s => [s.id, s.user_id]));
    const studNameMap = new Map(((studProfs || []) as any[]).map(p => [p.id, p.name]));
    const gamiMap     = new Map(((gamiRows.data || []) as any[]).map(g => [g.student_id, g]));

    // Also get teacher_students to map student → teacher profile id
    const { data: tsAllRows } = await supabase
      .from("teacher_students")
      .select("student_id, teachers!teacher_students_teacher_id_fkey(user_id)")
      .in("student_id", studentIds);
    const studToTeacherProfileId = new Map<string, string>(
      ((tsAllRows || []) as any[])
        .filter(r => r.teachers?.user_id)
        .map(r => [r.student_id, r.teachers.user_id])
    );

    const sMap = new Map<string, { name: string; teacherProfileId: string | null; xp: number; streak: number }>();
    for (const sid of studentIds) {
      const userId = studUserMap.get(sid);
      const name   = userId ? (studNameMap.get(userId) ?? "—") : "—";
      const gami   = gamiMap.get(sid);
      const teacherProfileId = studToTeacherProfileId.get(sid) ?? null;
      const isDemo = demoStudentIds.has(sid);
      sMap.set(sid, { name, teacherProfileId, xp: gami?.xp_total || 0, streak: gami?.streak_current || 0, isDemo });
    }
    setStudentMap(sMap);
    setLoading(false);
  };

  const demoIds = useMemo(() => {
    const ids = new Set<string>();
    studentMap.forEach((v, k) => { if (v.isDemo) ids.add(k); });
    return ids;
  }, [studentMap]);

  const completedSessions = useMemo(
    () => sessions.filter(s => (s.status === "attended" || s.status === "completed") && !demoIds.has(s.student_id ?? "")),
    [sessions, demoIds]
  );

  // KPIs
  const kpis = useMemo(() => {
    const totalSessions = completedSessions.reduce((sum, s) => sum + (s.is_trial ? 0.5 : 1), 0);
    const activeStudentIds = new Set(completedSessions.map(s => s.student_id).filter(Boolean));
    const xpTotal = [...studentMap.values()].reduce((sum, s) => sum + s.xp, 0);
    const streakArr = [...studentMap.values()].map(s => s.streak);
    const avgStreak = streakArr.length > 0 ? Math.round(streakArr.reduce((a, b) => a + b, 0) / streakArr.length) : 0;
    return { totalSessions, activeStudents: activeStudentIds.size, xpTotal, avgStreak };
  }, [completedSessions, studentMap]);

  // Per-teacher stats
  const teacherStats = useMemo<TeacherStats[]>(() => {
    const map = new Map<string, TeacherStats>();
    for (const s of completedSessions) {
      if (!s.teacher_id) continue;
      if (!map.has(s.teacher_id)) {
        map.set(s.teacher_id, {
          teacherId: s.teacher_id,
          name: teacherMap.get(s.teacher_id) ?? "—",
          individual: 0, group: 0, trial: 0, total: 0,
        });
      }
      const t = map.get(s.teacher_id)!;
      const weight = s.is_trial ? 0.5 : 1;
      if (s.is_trial)               t.trial      += 1;
      else if (s.student_id === null) t.group     += 1;
      else                            t.individual += 1;
      t.total += weight;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [completedSessions, teacherMap]);

  // Per-student stats
  const studentStats = useMemo<StudentStats[]>(() => {
    const map = new Map<string, StudentStats>();
    for (const s of completedSessions) {
      if (!s.student_id) continue;
      if (!map.has(s.student_id)) {
        const info = studentMap.get(s.student_id);
        const teacherProfileId = info?.teacherProfileId ?? s.teacher_id;
        map.set(s.student_id, {
          studentId: s.student_id,
          name: info?.name ?? "—",
          teacherName: teacherProfileId ? (teacherMap.get(teacherProfileId) ?? "—") : "—",
          sessions: 0,
          xpTotal: info?.xp ?? 0,
          streak: info?.streak ?? 0,
          lastSession: null,
        });
      }
      const st = map.get(s.student_id)!;
      st.sessions += 1;
      if (!st.lastSession || s.scheduled_at > st.lastSession) st.lastSession = s.scheduled_at;
    }
    return [...map.values()].sort((a, b) => b.sessions - a.sessions);
  }, [completedSessions, studentMap, teacherMap]);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Estatísticas</h2>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Aulas realizadas</span>
                  <CalendarCheck className="h-4 w-4 text-green-600" />
                </div>
                <p className="text-3xl font-bold">{kpis.totalSessions.toLocaleString("pt-BR")}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">trial conta como 0,5</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Alunos ativos</span>
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <p className="text-3xl font-bold">{kpis.activeStudents}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">com aula no período</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">XP total alunos</span>
                  <Zap className="h-4 w-4 text-yellow-500" />
                </div>
                <p className="text-3xl font-bold">{kpis.xpTotal.toLocaleString("pt-BR")}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">acumulado</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Média streak</span>
                  <Flame className="h-4 w-4 text-orange-500" />
                </div>
                <p className="text-3xl font-bold">{kpis.avgStreak}d</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">dias seguidos (média)</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Teacher payroll table */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <GraduationCap className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-bold">Por professor</p>
          <span className="text-xs text-muted-foreground">(base para folha de pagamento)</span>
        </div>
        {loading ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : teacherStats.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma aula registrada no período.</p>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Professor</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Individual</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Grupo</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Trial (×0,5)</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Total pond.</th>
                  </tr>
                </thead>
                <tbody>
                  {teacherStats.map(t => (
                    <tr key={t.teacherId} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{t.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{t.individual}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{t.group}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{t.trial}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold">{t.total.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                    </tr>
                  ))}
                  <tr className="bg-muted/50">
                    <td className="px-4 py-2.5 font-bold text-xs">Total</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold">{teacherStats.reduce((s, t) => s + t.individual, 0)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold">{teacherStats.reduce((s, t) => s + t.group, 0)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-muted-foreground">{teacherStats.reduce((s, t) => s + t.trial, 0)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold">{teacherStats.reduce((s, t) => s + t.total, 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Student activity table */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-bold">Por aluno</p>
        </div>
        {loading ? (
          <Skeleton className="h-48 rounded-xl" />
        ) : studentStats.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum aluno com aula no período.</p>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Aluno</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Professor</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Aulas</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">XP total</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Streak</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Última aula</th>
                  </tr>
                </thead>
                <tbody>
                  {studentStats.map(s => (
                    <tr key={s.studentId} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{s.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.teacherName}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold">{s.sessions}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.xpTotal.toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={s.streak > 0 ? "text-orange-500 font-semibold" : "text-muted-foreground"}>
                          {s.streak > 0 ? `🔥 ${s.streak}d` : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {s.lastSession ? ptDate(s.lastSession) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

    </div>
  );
};

export default AdminStatsTab;
