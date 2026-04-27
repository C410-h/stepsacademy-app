import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  CalendarCheck, Users, Zap, Flame, GraduationCap, TrendingUp,
  AlertCircle, BookCheck, ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";
import {
  startOfMonth, startOfYear, subMonths, subDays, differenceInDays, format,
} from "date-fns";
import { formatTeacherName } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type Period = "month" | "last_month" | "3months" | "year";
type StudentSort = "name" | "teacher" | "level" | "sessions" | "xp" | "streak" | "lastClass";

export interface AdminStatsTabProps {
  highlightSection?: string;
  onSectionHighlighted?: () => void;
  onStudentClick?: (studentId: string) => void;
  onTeacherClick?: (teacherProfileId: string) => void;
}

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

interface ActiveStudent {
  studentId: string;
  name: string;
  teacherName: string;
  language: string;
  level: string;
  xp: number;
  streak: number;
  lastSessionDate: string | null;
  daysSinceLastClass: number | null;
  sessionsInPeriod: number;
}

interface EngagementRow {
  studentId: string;
  name: string;
  missionsToday: number;
  exercisesWeek: number;
  xpFromExercises: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "month",      label: "Este mês" },
  { value: "last_month", label: "Mês passado" },
  { value: "3months",    label: "Últimos 3 meses" },
  { value: "year",       label: "Este ano" },
];

const PERIOD_LABELS: Record<Period, string> = {
  month: "este mês", last_month: "mês passado", "3months": "3 meses", year: "este ano",
};

function getPeriodRange(period: Period): { start: Date; end: Date } {
  const now = new Date();
  if (period === "month")      return { start: startOfMonth(now), end: now };
  if (period === "last_month") return { start: startOfMonth(subMonths(now, 1)), end: startOfMonth(now) };
  if (period === "3months")    return { start: startOfMonth(subMonths(now, 2)), end: now };
  return { start: startOfYear(now), end: now };
}

const ptDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });

// ── Mini UI helpers ───────────────────────────────────────────────────────────

const Th = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th className={`px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[10px] ${right ? "text-right" : "text-left"}`}>
    {children}
  </th>
);

interface SortableThProps {
  col: StudentSort;
  active: StudentSort;
  dir: "asc" | "desc";
  onClick: (col: StudentSort) => void;
  right?: boolean;
  children: React.ReactNode;
}

const SortableTh = ({ col, active, dir, onClick, right, children }: SortableThProps) => (
  <th
    className={`px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[10px] cursor-pointer hover:text-foreground select-none ${right ? "text-right" : "text-left"}`}
    onClick={() => onClick(col)}
  >
    <span className={`inline-flex items-center gap-1 ${right ? "justify-end w-full" : ""}`}>
      {children}
      {active === col
        ? (dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
        : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
    </span>
  </th>
);

interface KPICardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}
const KPICard = ({ icon, label, value, sub, highlight }: KPICardProps) => (
  <Card className={highlight ? "border-orange-300" : ""}>
    <CardContent className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
        {icon}
      </div>
      <p className={`text-3xl font-bold ${highlight ? "text-orange-500" : ""}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
    </CardContent>
  </Card>
);

const SectionHeader = ({ icon, title, badge, sub }: {
  icon: React.ReactNode; title: string; badge?: React.ReactNode; sub?: string;
}) => (
  <div className="flex items-center gap-2 mb-3">
    <span className="text-muted-foreground">{icon}</span>
    <p className="text-sm font-bold">{title}</p>
    {badge}
    {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
  </div>
);

// ── Component ─────────────────────────────────────────────────────────────────

const AdminStatsTab = ({ highlightSection, onSectionHighlighted, onStudentClick, onTeacherClick }: AdminStatsTabProps) => {
  const [period, setPeriod]             = useState<Period>("month");
  const [loading, setLoading]           = useState(true);
  const [sessions, setSessions]         = useState<SessionRow[]>([]);
  const [teacherMap, setTeacherMap]     = useState<Map<string, string>>(new Map());
  const [allActive, setAllActive]       = useState<ActiveStudent[]>([]);
  const [engRows, setEngRows]           = useState<EngagementRow[]>([]);
  const [studentSort, setStudentSort]   = useState<StudentSort>("sessions");
  const [sortDir, setSortDir]           = useState<"asc" | "desc">("desc");

  useEffect(() => { loadData(); }, [period]);

  // Scroll + sort hint when parent navigates here
  useEffect(() => {
    if (!highlightSection || loading) return;
    const sectionKey = highlightSection.split("-")[0];
    const el = document.getElementById(`stats-${sectionKey}`);
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      onSectionHighlighted?.();
    }
    if (highlightSection === "students-xp")     { setStudentSort("xp");      setSortDir("desc"); }
    if (highlightSection === "students-streak") { setStudentSort("streak");  setSortDir("desc"); }
  }, [highlightSection, loading]);

  const loadData = async () => {
    setLoading(true);
    const { start, end } = getPeriodRange(period);
    const now = new Date();
    const todayStr = format(now, "yyyy-MM-dd");
    const sevenDaysAgo = subDays(now, 7).toISOString();

    // ── Batch 1: period sessions + global student/engagement data ──────────
    const [sesRes, allStudRes, missionRes, exerciseRes, ses7dRes] = await Promise.all([
      (supabase as any)
        .from("class_sessions")
        .select("id, teacher_id, student_id, status, scheduled_at, is_trial")
        .in("status", ["attended", "completed", "rescheduled"])
        .gte("scheduled_at", start.toISOString())
        .lte("scheduled_at", end.toISOString()),
      (supabase as any)
        .from("students")
        .select("id, user_id, levels!students_level_id_fkey(name, code), languages!students_language_id_fkey(name)")
        .eq("status", "active")
        .eq("is_demo", false),
      (supabase as any)
        .from("daily_missions")
        .select("student_id, completed, exercises_done, xp_earned")
        .eq("date", todayStr)
        .eq("completed", true),
      (supabase as any)
        .from("xp_events")
        .select("student_id, xp")
        .in("event_type", ["lesson_exercise", "stepbystep"])
        .gte("created_at", sevenDaysAgo),
      (supabase as any)
        .from("class_sessions")
        .select("id, student_id, scheduled_at")
        .in("status", ["attended", "completed"])
        .gte("scheduled_at", sevenDaysAgo),
    ]);

    const rows: SessionRow[] = sesRes.data || [];
    setSessions(rows);

    const allStudsRaw: any[] = allStudRes.data || [];
    const missionsRaw: any[] = missionRes.data || [];
    const exercisesRaw: any[] = exerciseRes.data || [];
    const ses7d: any[] = ses7dRes.data || [];

    const allStudentIds = allStudsRaw.map((s: any) => s.id);
    const allUserIds    = allStudsRaw.map((s: any) => s.user_id).filter(Boolean);

    // ── Batch 2: profiles + gamification + teacher mappings + group memberships
    const [profRes, gamiRes, tsRes, tProfRes, groupStudRes] = await Promise.all([
      allUserIds.length
        ? supabase.from("profiles").select("id, name").in("id", allUserIds)
        : Promise.resolve({ data: [] }),
      allStudentIds.length
        ? (supabase as any).from("student_gamification").select("student_id, xp_total, streak_current").in("student_id", allStudentIds)
        : Promise.resolve({ data: [] }),
      allStudentIds.length
        ? supabase.from("teacher_students").select("student_id, teachers!teacher_students_teacher_id_fkey(user_id)").in("student_id", allStudentIds)
        : Promise.resolve({ data: [] }),
      supabase.from("profiles").select("id, name").eq("role", "teacher"),
      allStudentIds.length
        ? (supabase as any).from("group_students").select("student_id, group_id").in("student_id", allStudentIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profNameMap = new Map(((profRes.data || []) as any[]).map((p: any) => [p.id, p.name as string]));
    const gamiMap     = new Map(((gamiRes.data || []) as any[]).map((g: any) => [g.student_id as string, g]));
    const studToTPId  = new Map<string, string>(
      ((tsRes.data || []) as any[])
        .filter((r: any) => r.teachers?.user_id)
        .map((r: any) => [r.student_id as string, r.teachers.user_id as string])
    );
    const tProfMap = new Map(((tProfRes.data || []) as any[]).map((t: any) => [t.id as string, t.name as string]));
    setTeacherMap(tProfMap);

    // student_id → group_id (for group session lookups)
    const studToGroup = new Map<string, string>(
      ((groupStudRes.data || []) as any[]).map((r: any) => [r.student_id as string, r.group_id as string])
    );

    // ── Last session per student (individual sessions in last 7d) ─────────
    const last7dMap = new Map<string, string>();
    for (const s of ses7d) {
      if (!s.student_id) continue;
      const ex = last7dMap.get(s.student_id);
      if (!ex || s.scheduled_at > ex) last7dMap.set(s.student_id, s.scheduled_at);
    }

    // Also check group sessions (via group_id) in last 7d
    const groupIds7d = [...new Set(
      allStudsRaw
        .filter((s: any) => !last7dMap.has(s.id) && studToGroup.has(s.id))
        .map((s: any) => studToGroup.get(s.id) as string)
    )];
    if (groupIds7d.length > 0) {
      const { data: grpSes7d } = await (supabase as any)
        .from("class_sessions")
        .select("group_id, scheduled_at")
        .in("status", ["attended", "completed"])
        .in("group_id", groupIds7d)
        .gte("scheduled_at", sevenDaysAgo);
      const grpLatest7d = new Map<string, string>();
      for (const s of (grpSes7d || [])) {
        const ex = grpLatest7d.get(s.group_id);
        if (!ex || s.scheduled_at > ex) grpLatest7d.set(s.group_id, s.scheduled_at);
      }
      for (const [sid, gid] of studToGroup.entries()) {
        const d = grpLatest7d.get(gid);
        if (d) { const ex = last7dMap.get(sid); if (!ex || d > ex) last7dMap.set(sid, d); }
      }
    }

    // Also check session_attendees for duo/group sessions in last 7d (student_id = null sessions)
    const nullStudentIds7d = ses7d.filter((s: any) => !s.student_id).map((s: any) => s.id as string);
    if (nullStudentIds7d.length > 0 && allStudentIds.length > 0) {
      const { data: att7d } = await (supabase as any)
        .from("session_attendees")
        .select("student_id, session_id")
        .in("session_id", nullStudentIds7d)
        .in("student_id", allStudentIds);
      const ses7dById = new Map<string, string>(
        ses7d.filter((s: any) => s.id).map((s: any) => [s.id as string, s.scheduled_at as string])
      );
      for (const att of (att7d || [])) {
        const date = ses7dById.get(att.session_id);
        if (!date) continue;
        const ex = last7dMap.get(att.student_id);
        if (!ex || date > ex) last7dMap.set(att.student_id, date);
      }
    }

    // For students still not seen in 7d, fetch their last session ever
    const inactiveIds = allStudsRaw.filter((s: any) => !last7dMap.has(s.id)).map((s: any) => s.id as string);
    const lastEverMap = new Map<string, string>();
    if (inactiveIds.length > 0) {
      const inactiveGroupIds = [...new Set(inactiveIds.map(id => studToGroup.get(id)).filter(Boolean) as string[])];
      const [indivSes, grpSesEver, attSesEver] = await Promise.all([
        // Individual sessions
        (supabase as any)
          .from("class_sessions")
          .select("student_id, scheduled_at")
          .in("status", ["attended", "completed"])
          .in("student_id", inactiveIds)
          .order("scheduled_at", { ascending: false }),
        // Group sessions (via group_id)
        inactiveGroupIds.length
          ? (supabase as any)
              .from("class_sessions")
              .select("group_id, scheduled_at")
              .in("status", ["attended", "completed"])
              .in("group_id", inactiveGroupIds)
              .order("scheduled_at", { ascending: false })
          : Promise.resolve({ data: [] }),
        // Duo/group sessions (via session_attendees)
        (supabase as any)
          .from("session_attendees")
          .select("student_id, class_sessions!inner(scheduled_at, status)")
          .in("student_id", inactiveIds),
      ]);
      // Individual last sessions
      const seenIndiv = new Set<string>();
      for (const s of (indivSes.data || [])) {
        if (!seenIndiv.has(s.student_id)) { seenIndiv.add(s.student_id); lastEverMap.set(s.student_id, s.scheduled_at); }
      }
      // Group last sessions (group_id path) — map back to student IDs
      const grpLatestEver = new Map<string, string>();
      const seenGrp = new Set<string>();
      for (const s of (grpSesEver.data || [])) {
        if (!seenGrp.has(s.group_id)) { seenGrp.add(s.group_id); grpLatestEver.set(s.group_id, s.scheduled_at); }
      }
      for (const sid of inactiveIds) {
        const gid = studToGroup.get(sid);
        if (gid) {
          const d = grpLatestEver.get(gid);
          if (d) { const ex = lastEverMap.get(sid); if (!ex || d > ex) lastEverMap.set(sid, d); }
        }
      }
      // Duo/group sessions (session_attendees path)
      for (const row of (attSesEver.data || [])) {
        const cs = row.class_sessions;
        if (!cs || !["attended", "completed"].includes(cs.status)) continue;
        const ex = lastEverMap.get(row.student_id);
        if (!ex || cs.scheduled_at > ex) lastEverMap.set(row.student_id, cs.scheduled_at);
      }
    }

    // ── Period session count per student ──────────────────────────────────
    const periodCount = new Map<string, number>();
    for (const s of rows) {
      if (s.student_id && (s.status === "attended" || s.status === "completed")) {
        periodCount.set(s.student_id, (periodCount.get(s.student_id) ?? 0) + 1);
      }
    }

    // ── Mission + exercise maps ────────────────────────────────────────────
    const missionMap = new Map<string, number>();
    for (const m of missionsRaw) {
      if (m.student_id) missionMap.set(m.student_id, (missionMap.get(m.student_id) ?? 0) + 1);
    }
    const exMap = new Map<string, { count: number; xp: number }>();
    for (const e of exercisesRaw) {
      if (!e.student_id) continue;
      const ex = exMap.get(e.student_id) ?? { count: 0, xp: 0 };
      ex.count++;
      ex.xp += e.xp ?? 0;
      exMap.set(e.student_id, ex);
    }

    // ── Build allActive ────────────────────────────────────────────────────
    const active: ActiveStudent[] = allStudsRaw.map((s: any) => {
      const gami         = gamiMap.get(s.id);
      const teacherPId   = studToTPId.get(s.id);
      const teacherName  = teacherPId ? (tProfMap.get(teacherPId) ?? "—") : "—";
      const lastSes      = last7dMap.get(s.id) ?? lastEverMap.get(s.id) ?? null;
      const daysSince    = lastSes ? differenceInDays(now, new Date(lastSes)) : null;
      return {
        studentId:          s.id,
        name:               profNameMap.get(s.user_id) ?? "—",
        teacherName,
        language:           s.languages?.name ?? "—",
        level:              s.levels?.code ?? "—",
        xp:                 gami?.xp_total ?? 0,
        streak:             gami?.streak_current ?? 0,
        lastSessionDate:    lastSes,
        daysSinceLastClass: daysSince,
        sessionsInPeriod:   periodCount.get(s.id) ?? 0,
      };
    });
    setAllActive(active);

    // ── Engagement rows (students with activity today/this week) ──────────
    const eng: EngagementRow[] = active
      .map(s => ({
        studentId:       s.studentId,
        name:            s.name,
        missionsToday:   missionMap.get(s.studentId) ?? 0,
        exercisesWeek:   exMap.get(s.studentId)?.count ?? 0,
        xpFromExercises: exMap.get(s.studentId)?.xp ?? 0,
      }))
      .filter(r => r.missionsToday > 0 || r.exercisesWeek > 0)
      .sort((a, b) => (b.exercisesWeek + b.missionsToday) - (a.exercisesWeek + a.missionsToday));
    setEngRows(eng);

    setLoading(false);
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const completedSessions = useMemo(
    () => sessions.filter(s => s.status === "attended" || s.status === "completed"),
    [sessions]
  );

  const kpis = useMemo(() => {
    const totalSessions  = completedSessions.reduce((sum, s) => sum + (s.is_trial ? 0.5 : 1), 0);
    const withClassIds   = new Set(completedSessions.map(s => s.student_id).filter(Boolean));
    const xpTotal        = allActive.reduce((sum, s) => sum + s.xp, 0);
    const streaks        = allActive.map(s => s.streak);
    const avgStreak      = streaks.length ? Math.round(streaks.reduce((a, b) => a + b, 0) / streaks.length) : 0;
    const inactiveCount  = allActive.filter(s => s.daysSinceLastClass === null || s.daysSinceLastClass >= 7).length;
    return { totalSessions, withClass: withClassIds.size, xpTotal, avgStreak, inactiveCount };
  }, [completedSessions, allActive]);

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
      const w = s.is_trial ? 0.5 : 1;
      if (s.is_trial)                t.trial      += 1;
      else if (!s.student_id)        t.group      += 1;
      else                           t.individual += 1;
      t.total += w;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [completedSessions, teacherMap]);

  const sortedStudents = useMemo(() => {
    const arr = [...allActive];
    const d = sortDir === "desc" ? -1 : 1;
    arr.sort((a, b) => {
      switch (studentSort) {
        case "name":      return d * a.name.localeCompare(b.name, "pt-BR");
        case "teacher":   return d * a.teacherName.localeCompare(b.teacherName, "pt-BR");
        case "level":     return d * a.level.localeCompare(b.level, "pt-BR");
        case "xp":        return d * (a.xp - b.xp);
        case "streak":    return d * (a.streak - b.streak);
        case "lastClass": return d * ((a.lastSessionDate ?? "").localeCompare(b.lastSessionDate ?? ""));
        default:          return d * (a.sessionsInPeriod - b.sessionsInPeriod);
      }
    });
    return arr;
  }, [allActive, studentSort, sortDir]);

  const inactiveStudents = useMemo(
    () => allActive
      .filter(s => s.daysSinceLastClass === null || s.daysSinceLastClass >= 7)
      .sort((a, b) => (b.daysSinceLastClass ?? 9999) - (a.daysSinceLastClass ?? 9999)),
    [allActive]
  );

  const handleSort = (col: StudentSort) => {
    if (studentSort === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setStudentSort(col); setSortDir("desc"); }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-10">

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

      {/* ── 1. Resumo ──────────────────────────────────────────────────────── */}
      <section id="stats-summary">
        <SectionHeader icon={<TrendingUp className="h-4 w-4" />} title="Resumo geral" />
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {loading ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />) : (
            <>
              <KPICard icon={<CalendarCheck className="h-4 w-4 text-green-600" />}   label="Aulas realizadas"   value={kpis.totalSessions.toLocaleString("pt-BR")} sub={`trial = 0,5 · ${PERIOD_LABELS[period]}`} />
              <KPICard icon={<Users className="h-4 w-4 text-primary" />}             label="Com aula no período" value={kpis.withClass.toString()}  sub="alunos que tiveram aula" />
              <KPICard icon={<Zap className="h-4 w-4 text-yellow-500" />}            label="XP total"            value={kpis.xpTotal.toLocaleString("pt-BR")} sub="acumulado por todos" />
              <KPICard icon={<Flame className="h-4 w-4 text-orange-500" />}          label="Média streak"        value={`${kpis.avgStreak}d`} sub="dias seguidos (média)" />
              <KPICard icon={<AlertCircle className="h-4 w-4 text-orange-500" />}    label="Sem aula (7d)"       value={kpis.inactiveCount.toString()} sub="alunos inativos agora" highlight={kpis.inactiveCount > 0} />
            </>
          )}
        </div>
      </section>

      {/* ── 2. Por professor (payroll) ──────────────────────────────────────── */}
      <section id="stats-sessions">
        <SectionHeader
          icon={<GraduationCap className="h-4 w-4" />}
          title="Por professor"
          badge={<Badge variant="outline" className="text-[9px] py-0 px-1.5">{PERIOD_LABELS[period]}</Badge>}
          sub="base para folha de pagamento"
        />
        {loading ? <Skeleton className="h-32 rounded-xl" /> : teacherStats.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma aula registrada no período.</p>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <Th>Professor</Th>
                    <Th right>Individual</Th>
                    <Th right>Grupo</Th>
                    <Th right>Trial (×0,5)</Th>
                    <Th right>Total pond.</Th>
                  </tr>
                </thead>
                <tbody>
                  {teacherStats.map(t => (
                    <tr key={t.teacherId} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">
                        {onTeacherClick
                          ? <button className="hover:underline text-left text-[var(--theme-brand-on-bg)]" onClick={() => onTeacherClick(t.teacherId)}>{formatTeacherName(t.name)}</button>
                          : formatTeacherName(t.name)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{t.individual}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{t.group}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{t.trial}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold">
                        {t.total.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted/50 font-bold text-xs">
                    <td className="px-4 py-2.5">Total</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{teacherStats.reduce((s, t) => s + t.individual, 0)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{teacherStats.reduce((s, t) => s + t.group, 0)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{teacherStats.reduce((s, t) => s + t.trial, 0)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {teacherStats.reduce((s, t) => s + t.total, 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* ── 3. Todos os alunos ─────────────────────────────────────────────── */}
      <section id="stats-students">
        <SectionHeader
          icon={<Users className="h-4 w-4" />}
          title="Todos os alunos"
          badge={!loading ? <Badge variant="secondary" className="text-[10px] py-0">{allActive.length} ativos</Badge> : undefined}
          sub="clique nas colunas para ordenar"
        />
        {loading ? <Skeleton className="h-48 rounded-xl" /> : sortedStudents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum aluno ativo.</p>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <SortableTh col="name"    active={studentSort} dir={sortDir} onClick={handleSort}>Aluno</SortableTh>
                    <SortableTh col="teacher" active={studentSort} dir={sortDir} onClick={handleSort}>Professor</SortableTh>
                    <SortableTh col="level"   active={studentSort} dir={sortDir} onClick={handleSort}>Nível</SortableTh>
                    <SortableTh col="sessions" active={studentSort} dir={sortDir} onClick={handleSort} right>
                      Aulas <span className="text-[9px] font-normal opacity-60">({PERIOD_LABELS[period]})</span>
                    </SortableTh>
                    <SortableTh col="xp"        active={studentSort} dir={sortDir} onClick={handleSort} right>XP total</SortableTh>
                    <SortableTh col="streak"    active={studentSort} dir={sortDir} onClick={handleSort} right>Streak</SortableTh>
                    <SortableTh col="lastClass" active={studentSort} dir={sortDir} onClick={handleSort} right>Última aula</SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {sortedStudents.map(s => (
                    <tr key={s.studentId} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">
                        {onStudentClick
                          ? <button className="hover:underline text-left text-[var(--theme-brand-on-bg)]" onClick={() => onStudentClick(s.studentId)}>{s.name}</button>
                          : s.name}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{s.teacherName === "—" ? "—" : formatTeacherName(s.teacherName)}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className="text-[10px] py-0">{s.level}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold">
                        {s.sessionsInPeriod > 0 ? s.sessionsInPeriod : <span className="text-muted-foreground font-normal">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{s.xp.toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span className={s.streak > 0 ? "text-orange-500 font-semibold" : "text-muted-foreground"}>
                          {s.streak > 0 ? `🔥 ${s.streak}d` : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {s.lastSessionDate
                          ? <span className={s.daysSinceLastClass !== null && s.daysSinceLastClass >= 7 ? "text-orange-500" : ""}>{ptDate(s.lastSessionDate)}</span>
                          : <span className="text-red-500 font-medium">Nunca</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* ── 4. Sem aula (7d) ───────────────────────────────────────────────── */}
      <section id="stats-inactive">
        <SectionHeader
          icon={<AlertCircle className="h-4 w-4 text-orange-500" />}
          title="Sem aula nos últimos 7 dias"
          badge={!loading ? (
            <Badge variant={inactiveStudents.length > 0 ? "destructive" : "secondary"} className="text-[10px]">
              {inactiveStudents.length}
            </Badge>
          ) : undefined}
        />
        {loading ? <Skeleton className="h-32 rounded-xl" /> : inactiveStudents.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-950/20 rounded-xl px-4 py-3 border border-green-200 dark:border-green-800">
            <span>✓</span>
            <span>Todos os alunos tiveram aula nos últimos 7 dias.</span>
          </div>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <Th>Aluno</Th>
                    <Th>Professor</Th>
                    <Th>Idioma / Nível</Th>
                    <Th right>Última aula</Th>
                    <Th right>Dias sem aula</Th>
                  </tr>
                </thead>
                <tbody>
                  {inactiveStudents.map(s => {
                    const days = s.daysSinceLastClass;
                    const severity = days === null ? "text-red-500" : days >= 14 ? "text-red-500" : "text-orange-500";
                    return (
                      <tr key={s.studentId} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-medium">
                          {onStudentClick
                            ? <button className="hover:underline text-left text-[var(--theme-brand-on-bg)]" onClick={() => onStudentClick(s.studentId)}>{s.name}</button>
                            : s.name}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{s.teacherName === "—" ? "—" : formatTeacherName(s.teacherName)}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {s.language} · <Badge variant="outline" className="text-[10px] py-0">{s.level}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">
                          {s.lastSessionDate ? ptDate(s.lastSessionDate) : <span className="text-red-500 font-semibold">Nunca</span>}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${severity}`}>
                          {days !== null ? `${days}d` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* ── 5. Engajamento ─────────────────────────────────────────────────── */}
      <section id="stats-missions">
        <SectionHeader
          icon={<BookCheck className="h-4 w-4" />}
          title="Engajamento"
          sub="missões concluídas hoje · exercícios nos últimos 7 dias"
        />
        {loading ? <Skeleton className="h-32 rounded-xl" /> : engRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma missão ou exercício concluído hoje / esta semana.</p>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <Th>Aluno</Th>
                    <Th right>Missão hoje</Th>
                    <Th right>Exercícios (7d)</Th>
                    <Th right>XP de exercícios</Th>
                  </tr>
                </thead>
                <tbody>
                  {engRows.map(r => (
                    <tr key={r.studentId} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">
                        {onStudentClick
                          ? <button className="hover:underline text-left text-[var(--theme-brand-on-bg)]" onClick={() => onStudentClick(r.studentId)}>{r.name}</button>
                          : r.name}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {r.missionsToday > 0
                          ? <span className="font-semibold text-green-600">✓ concluída</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold">
                        {r.exercisesWeek > 0 ? r.exercisesWeek : <span className="text-muted-foreground font-normal">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-yellow-600 font-medium">
                        {r.xpFromExercises > 0 ? `+${r.xpFromExercises.toLocaleString("pt-BR")} XP` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

    </div>
  );
};

export default AdminStatsTab;
