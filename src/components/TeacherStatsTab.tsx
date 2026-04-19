import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { startOfMonth, startOfYear, subMonths } from "date-fns";

// ── Types ──────────────────────────────────────────────────────────────────────

type Period = "month" | "3months" | "year" | "all";

interface SessionRow {
  id: string;
  student_id: string;
  status: string;
  scheduled_at: string;
}

interface StudentInfo {
  studentId: string;
  name: string;
  avatarUrl: string | null;
  levelName: string;
  stepNumber: number;
  xpTotal: number;
  streakCurrent: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { value: "month",   label: "Este mês" },
  { value: "3months", label: "Últimos 3 meses" },
  { value: "year",    label: "Este ano" },
  { value: "all",     label: "Tudo" },
] as const;

const MONTH_BR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function getPeriodStart(period: Period): Date | null {
  const now = new Date();
  if (period === "month")   return startOfMonth(now);
  if (period === "3months") return startOfMonth(subMonths(now, 2));
  if (period === "year")    return startOfYear(now);
  return null;
}

function getPrevSessions(period: Period, all: SessionRow[]): SessionRow[] | null {
  const now = new Date();
  let start: Date, end: Date;
  if (period === "month") {
    end   = startOfMonth(now);
    start = startOfMonth(subMonths(now, 1));
  } else if (period === "3months") {
    end   = startOfMonth(subMonths(now, 2));
    start = startOfMonth(subMonths(now, 5));
  } else if (period === "year") {
    end   = startOfYear(now);
    start = new Date(now.getFullYear() - 1, 0, 1);
  } else {
    return null;
  }
  return all.filter(s => { const d = new Date(s.scheduled_at); return d >= start && d < end; });
}

const isMissed = (s: SessionRow) => s.status === "missed" || s.status === "missed_pending";
const abbr = (name: string) => name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

// ── Sub-components ─────────────────────────────────────────────────────────────

const HighlightCard = ({ title, info, value, label }: {
  title: string; info: StudentInfo | null; value: number; label: string;
}) => (
  <Card className="shrink-0 w-44">
    <CardContent className="p-4 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
      {info ? (
        <>
          <div className="flex items-center gap-2">
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarImage src={info.avatarUrl || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">{abbr(info.name)}</AvatarFallback>
            </Avatar>
            <p className="text-xs font-medium truncate">{info.name.split(" ")[0]}</p>
          </div>
          <div>
            <p className="text-xl font-bold">{value.toLocaleString("pt-BR")}</p>
            <p className="text-[10px] text-muted-foreground font-light">{label}</p>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground font-light py-2">—</p>
      )}
    </CardContent>
  </Card>
);

const TrendIcon = ({ trend }: { trend: "up" | "down" | "flat" | "none" }) => {
  if (trend === "up")   return <TrendingUp className="h-3.5 w-3.5 text-green-500" />;
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
  if (trend === "flat") return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  return null;
};

// ── Main component ─────────────────────────────────────────────────────────────

const TeacherStatsTab = ({ profileId, teacherId }: { profileId: string; teacherId: string }) => {
  const [period, setPeriod]               = useState<Period>("month");
  const [loading, setLoading]             = useState(true);
  const [allSessions, setAllSessions]     = useState<SessionRow[]>([]);
  const [studentInfoMap, setStudentInfoMap] = useState<Map<string, StudentInfo>>(new Map());

  useEffect(() => { loadData(); }, [profileId, teacherId]);

  const loadData = async () => {
    setLoading(true);
    const [sessRes, tsRes] = await Promise.all([
      (supabase as any)
        .from("class_sessions")
        .select("id, student_id, status, scheduled_at")
        .eq("teacher_id", profileId)
        .in("status", ["completed","rescheduled","missed","missed_pending","missed_recovered"]),
      supabase
        .from("teacher_students")
        .select("students!inner(id, user_id, levels!students_level_id_fkey(name), steps!students_current_step_id_fkey(number))")
        .eq("teacher_id", teacherId),
    ]);

    const tsRows = (tsRes.data || []) as any[];
    const userIds    = tsRows.map(r => r.students.user_id);
    const studentIds = tsRows.map(r => r.students.id);

    const [profsRes, gamiRes] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("id, name, avatar_url").in("id", userIds)
        : Promise.resolve({ data: [] }),
      studentIds.length
        ? (supabase as any).from("student_gamification").select("student_id, xp_total, streak_current").in("student_id", studentIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profMap = new Map(((profsRes.data || []) as any[]).map(p => [p.id, p]));
    const gamiMap = new Map(((gamiRes.data || []) as any[]).map(g => [g.student_id, g]));

    const infoMap = new Map<string, StudentInfo>();
    for (const row of tsRows) {
      const s    = row.students;
      const prof = profMap.get(s.user_id);
      const gami = gamiMap.get(s.id);
      infoMap.set(s.id, {
        studentId:     s.id,
        name:          prof?.name        || "Aluno",
        avatarUrl:     prof?.avatar_url  || null,
        levelName:     s.levels?.name   || "—",
        stepNumber:    s.steps?.number  || 0,
        xpTotal:       gami?.xp_total        || 0,
        streakCurrent: gami?.streak_current  || 0,
      });
    }

    setAllSessions((sessRes.data as SessionRow[]) || []);
    setStudentInfoMap(infoMap);
    setLoading(false);
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const start = getPeriodStart(period);
    if (!start) return allSessions;
    return allSessions.filter(s => new Date(s.scheduled_at) >= start);
  }, [allSessions, period]);

  const metrics = useMemo(() => {
    const completed   = filtered.filter(s => s.status === "completed").length;
    const rescheduled = filtered.filter(s => s.status === "rescheduled").length;
    const missed      = filtered.filter(isMissed).length;
    const presenceDen = completed + missed;
    const commitDen   = completed + rescheduled + missed;
    return {
      completed,
      rescheduled,
      attendanceRate:  presenceDen > 0 ? Math.round(completed / presenceDen * 100) : 0,
      commitmentRate:  commitDen   > 0 ? Math.round((completed + rescheduled) / commitDen * 100) : 0,
    };
  }, [filtered]);

  const highlights = useMemo(() => {
    const completedCount: Record<string, number> = {};
    filtered.filter(s => s.status === "completed").forEach(s => {
      completedCount[s.student_id] = (completedCount[s.student_id] || 0) + 1;
    });
    const topAulasEntry = Object.entries(completedCount).sort((a, b) => b[1] - a[1])[0];

    const students = Array.from(studentInfoMap.values());
    const topStep   = [...students].sort((a, b) => b.stepNumber    - a.stepNumber)[0]    ?? null;
    const topXp     = [...students].sort((a, b) => b.xpTotal        - a.xpTotal)[0]        ?? null;
    const topStreak = [...students].sort((a, b) => b.streakCurrent  - a.streakCurrent)[0]  ?? null;

    return {
      topAulas:  topAulasEntry ? { info: studentInfoMap.get(topAulasEntry[0]) ?? null, value: topAulasEntry[1] } : null,
      topStep:   topStep   ? { info: topStep,   value: topStep.stepNumber }    : null,
      topXp:     topXp     ? { info: topXp,     value: topXp.xpTotal }         : null,
      topStreak: topStreak ? { info: topStreak, value: topStreak.streakCurrent } : null,
    };
  }, [filtered, studentInfoMap]);

  const chartData = useMemo(() => {
    const now = new Date();
    let start: Date;
    if (period === "month")        start = startOfMonth(now);
    else if (period === "3months") start = startOfMonth(subMonths(now, 2));
    else if (period === "year")    start = startOfYear(now);
    else {
      if (!allSessions.length) return [];
      const earliest = allSessions.reduce((min, s) => {
        const d = new Date(s.scheduled_at); return d < min ? d : min;
      }, now);
      start = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
    }

    type Entry = { month: string; completed: number; rescheduled: number; missed: number };
    const map = new Map<string, Entry>();
    let cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= now) {
      const key    = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
      const suffix = (period === "all") ? ` '${String(cur.getFullYear()).slice(2)}` : "";
      map.set(key, { month: MONTH_BR[cur.getMonth()] + suffix, completed: 0, rescheduled: 0, missed: 0 });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }

    allSessions.forEach(s => {
      const d = new Date(s.scheduled_at);
      if (d < start) return;
      const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const entry = map.get(key);
      if (!entry) return;
      if (s.status === "completed")   entry.completed++;
      else if (s.status === "rescheduled") entry.rescheduled++;
      else if (isMissed(s))           entry.missed++;
    });

    return Array.from(map.values());
  }, [allSessions, period]);

  const tableData = useMemo(() => {
    const prevSess = getPrevSessions(period, allSessions);

    return Array.from(studentInfoMap.values())
      .map(info => {
        const curr      = filtered.filter(s => s.student_id === info.studentId);
        const completed = curr.filter(s => s.status === "completed").length;
        const rescheduled = curr.filter(s => s.status === "rescheduled").length;
        const missed    = curr.filter(isMissed).length;
        const denom     = completed + missed;
        const rate      = denom > 0 ? Math.round(completed / denom * 100) : null;

        let trend: "up" | "down" | "flat" | "none" = "none";
        if (prevSess && rate !== null) {
          const prev        = prevSess.filter(s => s.student_id === info.studentId);
          const prevComp    = prev.filter(s => s.status === "completed").length;
          const prevMissed  = prev.filter(isMissed).length;
          const prevDen     = prevComp + prevMissed;
          if (prevDen > 0) {
            const prevRate = Math.round(prevComp / prevDen * 100);
            trend = rate > prevRate ? "up" : rate < prevRate ? "down" : "flat";
          }
        }
        return { info, completed, rescheduled, missed, rate, trend };
      })
      .filter(r => r.completed + r.rescheduled + r.missed > 0)
      .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));
  }, [filtered, studentInfoMap, allSessions, period]);

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-9 w-44" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0,1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header + period filter */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Estatísticas</h2>
        <Select value={period} onValueChange={v => setPeriod(v as Period)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total de aulas",    value: metrics.completed,      suffix: "" },
          { label: "Taxa de presença",  value: metrics.attendanceRate,  suffix: "%" },
          { label: "Comprometimento",   value: metrics.commitmentRate,  suffix: "%" },
          { label: "Remarcações",       value: metrics.rescheduled,     suffix: "" },
        ].map(c => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-light mb-1">{c.label}</p>
              <p className="text-3xl font-bold">{c.value}{c.suffix}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Student highlights */}
      <div>
        <p className="text-sm font-bold mb-3">Destaques dos alunos</p>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none -mx-1 px-1">
          <HighlightCard title="Mais aulas"     info={highlights.topAulas?.info  ?? null} value={highlights.topAulas?.value  ?? 0} label="aulas realizadas" />
          <HighlightCard title="Mais avançado"  info={highlights.topStep?.info   ?? null} value={highlights.topStep?.value   ?? 0} label="passos" />
          <HighlightCard title="Mais XP"        info={highlights.topXp?.info     ?? null} value={highlights.topXp?.value     ?? 0} label="XP total" />
          <HighlightCard title="Maior streak"   info={highlights.topStreak?.info ?? null} value={highlights.topStreak?.value ?? 0} label="dias seguidos" />
        </div>
      </div>

      {/* Bar chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold">Aulas por mês</CardTitle>
        </CardHeader>
        <CardContent className="pr-2">
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground font-light text-center py-8">
              Nenhuma aula registrada no período.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="completed"   name="Realizadas"  stackId="a" fill="#22c55e" />
                <Bar dataKey="rescheduled" name="Remarcadas"  stackId="a" fill="#f59e0b" />
                <Bar dataKey="missed"      name="Faltas"       stackId="a" fill="#ef4444" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Attendance table */}
      <div>
        <p className="text-sm font-bold mb-3">Presença por aluno</p>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Aluno</th>
                  <th className="px-3 py-3 text-center">Realizadas</th>
                  <th className="px-3 py-3 text-center">Remarc.</th>
                  <th className="px-3 py-3 text-center">Faltas</th>
                  <th className="px-3 py-3 text-center">Presença</th>
                  <th className="px-3 py-3 text-center">Trend</th>
                </tr>
              </thead>
              <tbody>
                {tableData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground font-light">
                      Nenhuma aula no período selecionado.
                    </td>
                  </tr>
                ) : tableData.map(row => (
                  <tr key={row.info.studentId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarImage src={row.info.avatarUrl || undefined} />
                          <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">{abbr(row.info.name)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium truncate max-w-[120px]">{row.info.name.split(" ")[0]}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center font-medium">{row.completed}</td>
                    <td className="px-3 py-3 text-center text-amber-600 font-medium">{row.rescheduled}</td>
                    <td className="px-3 py-3 text-center text-red-500 font-medium">{row.missed}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={
                        row.rate === null ? "text-muted-foreground" :
                        row.rate >= 80    ? "text-green-600 font-bold" :
                        row.rate >= 60    ? "text-amber-600 font-bold" :
                                            "text-red-500 font-bold"
                      }>
                        {row.rate !== null ? `${row.rate}%` : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-center">
                        <TrendIcon trend={row.trend} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default TeacherStatsTab;
