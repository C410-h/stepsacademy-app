import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, ChevronRight, CalendarPlus, ExternalLink,
  AlertTriangle, CheckCircle2, Calendar, CalendarClock, UserX, WifiOff,
} from "lucide-react";
import RescheduleSheet, { type RescheduleSessionData } from "./RescheduleSheet";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface GCalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  meet_link: string | null;
}

interface SessionWithStudent {
  id: string;
  student_id: string;
  scheduled_at: string;
  ends_at: string | null;
  rescheduled_at: string | null;
  rescheduled_ends_at: string | null;
  status: string;
  meet_link: string | null;
  google_event_id: string | null;
  notes: string | null;
  missed_confirmed_at: string | null;
  missed_confirmed_by: string | null;
  student_cancel_requested_at: string | null;
  student_name: string;
  student_avatar: string | null;
  language_name: string;
}

interface Props {
  profileId: string;
  onSchedule: () => void;
  scheduleDisabled?: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DAY_ABBR = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  scheduled:        { label: "Agendada",       badge: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" },
  completed:        { label: "Realizada",       badge: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300" },
  rescheduled:      { label: "Remarcada",       badge: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300" },
  missed_pending:   { label: "Falta pendente",  badge: "bg-[#FEF3C7] text-[#92400E] dark:bg-amber-950/50 dark:text-amber-200" },
  missed:           { label: "Falta",           badge: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
  missed_recovered: { label: "Recuperada",      badge: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekRange(weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  if (weekStart.getMonth() !== weekEnd.getMonth()) {
    return `${weekStart.getDate()} ${format(weekStart, "MMM", { locale: ptBR })} – ${weekEnd.getDate()} ${format(weekEnd, "MMM yyyy", { locale: ptBR })}`;
  }
  return `${weekStart.getDate()} – ${weekEnd.getDate()} ${format(weekEnd, "MMM yyyy", { locale: ptBR })}`;
}

const formatTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";

function getEffectiveTimes(s: SessionWithStudent) {
  if (s.status === "rescheduled" && s.rescheduled_at) {
    return { start: s.rescheduled_at, end: s.rescheduled_ends_at };
  }
  return { start: s.scheduled_at, end: s.ends_at };
}

const isStartingSoon = (startISO: string) => {
  const diff = new Date(startISO).getTime() - Date.now();
  return diff >= 0 && diff <= 30 * 60 * 1000;
};

const hasPassed = (startISO: string) => new Date(startISO).getTime() < Date.now();

const abbr = (name: string) =>
  name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

// ── Component ──────────────────────────────────────────────────────────────────

const TeacherAgendaTab = ({ profileId, onSchedule, scheduleDisabled }: Props) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const today = new Date();

  const [weekStart, setWeekStart] = useState(() => getWeekStart(today));
  const [loading, setLoading]     = useState(true);
  const [sessions, setSessions]   = useState<SessionWithStudent[]>([]);
  const [calEvents, setCalEvents] = useState<GCalEvent[]>([]);
  const [holidays, setHolidays]   = useState<Map<string, string>>(new Map());

  // Drawer
  const [calError, setCalError]                   = useState<string | null>(null);

  // Drawer
  const [drawerOpen, setDrawerOpen]               = useState(false);
  const [selected, setSelected]                   = useState<SessionWithStudent | null>(null);
  const [drawerNotes, setDrawerNotes]             = useState("");
  const [savingNotes, setSavingNotes]             = useState(false);
  const [confirmingMissed, setConfirmingMissed]   = useState(false);
  const [markingCompleted, setMarkingCompleted]   = useState(false);

  // Reagendar
  const [rescheduleOpen, setRescheduleOpen]       = useState(false);
  const [rescheduleSession, setRescheduleSession] = useState<RescheduleSessionData | null>(null);

  const todayColRef    = useRef<HTMLDivElement>(null);
  const scrollContRef  = useRef<HTMLDivElement>(null);

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadSessions = useCallback(async () => {
    setLoading(true);
    const ws = new Date(weekStart);
    const we = new Date(weekStart);
    we.setDate(we.getDate() + 7);

    const [primaryRes, rescheduledRes] = await Promise.all([
      (supabase as any)
        .from("class_sessions")
        .select("id, student_id, scheduled_at, ends_at, rescheduled_at, rescheduled_ends_at, status, meet_link, google_event_id, notes, missed_confirmed_at, missed_confirmed_by, student_cancel_requested_at")
        .eq("teacher_id", profileId)
        .gte("scheduled_at", ws.toISOString())
        .lt("scheduled_at", we.toISOString()),
      (supabase as any)
        .from("class_sessions")
        .select("id, student_id, scheduled_at, ends_at, rescheduled_at, rescheduled_ends_at, status, meet_link, google_event_id, notes, missed_confirmed_at, missed_confirmed_by, student_cancel_requested_at")
        .eq("teacher_id", profileId)
        .eq("status", "rescheduled")
        .gte("rescheduled_at", ws.toISOString())
        .lt("rescheduled_at", we.toISOString()),
    ]);

    // Merge and dedup
    const seen = new Set<string>();
    const raw: any[] = [
      ...(primaryRes.data || []),
      ...(rescheduledRes.data || []),
    ].filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });

    if (!raw.length) {
      setSessions([]);
      setLoading(false);
      return;
    }

    // Enrich with student info
    const studentIds = [...new Set(raw.map(s => s.student_id))] as string[];
    const { data: studentRows } = await supabase
      .from("students")
      .select("id, user_id, languages!students_language_id_fkey(name)")
      .in("id", studentIds);

    const studentMap = new Map((studentRows || []).map((s: any) => [s.id, s]));
    const userIds    = (studentRows || []).map((s: any) => s.user_id);

    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, name, avatar_url")
      .in("id", userIds);

    const profileMap = new Map((profileRows || []).map((p: any) => [p.id, p]));

    const enriched: SessionWithStudent[] = raw.map(s => {
      const st   = studentMap.get(s.student_id) as any;
      const prof = st ? profileMap.get(st.user_id) as any : null;
      return {
        ...s,
        student_name:   prof?.name       || "Aluno",
        student_avatar: prof?.avatar_url || null,
        language_name:  (st as any)?.languages?.name || "",
      };
    });

    setSessions(enriched);

    // Load holidays for this week
    const weekDateStrings = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ws);
      d.setDate(d.getDate() + i);
      return format(d, "yyyy-MM-dd");
    });
    const { data: holidayRows } = await (supabase as any)
      .from("national_holidays")
      .select("date, name")
      .in("date", weekDateStrings);
    setHolidays(new Map((holidayRows || []).map((h: any) => [h.date, h.name])));

    setLoading(false);
  }, [weekStart, profileId]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Fetch GCal events once on mount — covers next 30 days, filtered per week in render
  useEffect(() => {
    (async () => {
      // Força refresh do token antes de invocar, para garantir JWT válido
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke("google-calendar", {
        body: { action: "list_teacher_events", payload: {} },
        // Não passamos Authorization manualmente — o SDK injeta o token
        // atualizado automaticamente, evitando 401 por JWT expirado em cache
      });
      if (error || data?.error) {
        const msg: string = data?.error ?? error?.message ?? "Erro ao carregar Google Calendar";
        const isAuthError = msg.toLowerCase().includes("token") ||
          msg.toLowerCase().includes("conectado") ||
          msg.toLowerCase().includes("autoriza");
        setCalError(isAuthError
          ? "Google Calendar desconectado"
          : "Não foi possível carregar eventos do Google Calendar");
        setCalEvents([]);
      } else {
        setCalError(null);
        setCalEvents(data?.events || []);
      }
    })();
  }, []);

  // Scroll today column into view after load (mobile)
  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => {
        todayColRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }, 80);
      return () => clearTimeout(t);
    }
  }, [loading]);

  // ── Week navigation ───────────────────────────────────────────────────────

  const navigateWeek = (dir: -1 | 1) => {
    setWeekStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + dir * 7);
      return d;
    });
  };

  const currentWeekStart = getWeekStart(today);
  const isCurrentWeek    = weekStart.getTime() === currentWeekStart.getTime();
  const weekDays         = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  // ── Drawer helpers ────────────────────────────────────────────────────────

  const openDrawer = (s: SessionWithStudent) => {
    setSelected(s);
    setDrawerNotes(s.notes || "");
    setDrawerOpen(true);
  };

  const patchSession = (id: string, updates: Partial<SessionWithStudent>) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    setSelected(prev => prev?.id === id ? { ...prev, ...updates } : prev);
  };

  const handleSaveNotes = async () => {
    if (!selected) return;
    setSavingNotes(true);
    const { error } = await (supabase as any)
      .from("class_sessions").update({ notes: drawerNotes }).eq("id", selected.id);
    if (!error) {
      patchSession(selected.id, { notes: drawerNotes });
      toast({ title: "Observações salvas!" });
    } else {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
    setSavingNotes(false);
  };

  const handleConfirmMissed = async () => {
    if (!selected) return;
    setConfirmingMissed(true);
    const now = new Date().toISOString();
    const { error } = await (supabase as any)
      .from("class_sessions")
      .update({ status: "missed", missed_confirmed_at: now, missed_confirmed_by: profileId })
      .eq("id", selected.id);
    if (!error) {
      patchSession(selected.id, { status: "missed", missed_confirmed_at: now, missed_confirmed_by: profileId });
      // Best-effort push notification
      try {
        const { data: { session: authSess } } = await supabase.auth.getSession();
        if (authSess?.access_token) {
          await supabase.functions.invoke("send-push-notification", {
            headers: { Authorization: `Bearer ${authSess.access_token}` },
            body: {
              student_id: selected.student_id,
              title: "Falta confirmada",
              body: "Sua aula foi marcada como falta. Entre em contato com seu professor.",
            },
          });
        }
      } catch {}
      toast({ title: "Falta confirmada!" });
    } else {
      toast({ title: "Erro ao confirmar falta", variant: "destructive" });
    }
    setConfirmingMissed(false);
  };

  const handleMarkCompleted = async () => {
    if (!selected) return;
    setMarkingCompleted(true);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("complete-class-session", {
        body: { session_id: selected.id },
        headers: { Authorization: `Bearer ${authSession?.access_token}` },
      });
      if (error) throw error;

      // Atualiza UI: marca todas as sessões afetadas como concluídas
      const completedCount: number = data?.sessions_completed ?? 1;
      patchSession(selected.id, { status: "completed" });
      toast({
        title: "Aula marcada como realizada!",
        description: completedCount > 1
          ? `${completedCount} alunos da turma tiveram o progresso avançado.`
          : "Progresso do aluno avançado para o próximo step.",
      });
    } catch {
      toast({ title: "Erro ao marcar aula", variant: "destructive" });
    }
    setMarkingCompleted(false);
  };

  const handleReschedule = (s: SessionWithStudent) => {
    if (!s.google_event_id) return;
    const { start, end } = getEffectiveTimes(s);
    setRescheduleSession({
      id: s.id,
      google_event_id: s.google_event_id,
      scheduled_at: start,
      scheduled_ends_at: end || start,
      teacher_id: profileId,
      original_scheduled_at: s.scheduled_at,
    });
    setDrawerOpen(false);
    setRescheduleOpen(true);
  };

  // ── Render: Google Calendar card (read-only) ─────────────────────────────

  const GCalCard = ({ e, holidayName }: { e: GCalEvent; holidayName?: string }) => {
    const language = e.title.split(" | ")[0]?.trim();
    const name     = e.title.split(" | ")[1]?.trim();
    const soon     = !holidayName && isStartingSoon(e.start);
    return (
      <Card className={cn(
        "border-dashed",
        holidayName ? "opacity-60" : soon && "border-primary/40"
      )}>
        <CardContent className="p-2.5 space-y-1">
          <p className="text-xs font-bold tabular-nums">
            {formatTime(e.start)}{e.end ? ` – ${formatTime(e.end)}` : ""}
          </p>
          {name && <p className="text-xs font-medium truncate">{name.split(" ")[0]}</p>}
          {language && <p className="text-[10px] text-muted-foreground font-light">{language}</p>}
          {holidayName ? (
            <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              Feriado Nacional
            </span>
          ) : (
            <>
              {e.meet_link && (
                <button
                  className="text-[10px] text-primary font-semibold flex items-center gap-1 hover:underline"
                  onClick={() => window.open(e.meet_link!, "_blank")}
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                  Entrar
                </button>
              )}
              {soon && (
                <span className="inline-block text-[10px] font-bold text-primary animate-pulse">
                  Em breve
                </span>
              )}
            </>
          )}
        </CardContent>
      </Card>
    );
  };

  // ── Render: session card ──────────────────────────────────────────────────

  const SessionCard = ({ s, holidayName }: { s: SessionWithStudent; holidayName?: string }) => {
    const { start, end } = getEffectiveTimes(s);
    const cfg            = STATUS_CONFIG[s.status] ?? { label: s.status, badge: "bg-muted text-muted-foreground" };
    const soon           = !holidayName && s.status === "scheduled" && isStartingSoon(start);
    return (
      <button className="w-full text-left" onClick={() => openDrawer(s)}>
        <Card className={cn(
          "hover:shadow-sm transition-all cursor-pointer",
          holidayName ? "opacity-60" : s.status === "missed_pending" && "border-amber-300/60",
          soon && "border-primary/40"
        )}>
          <CardContent className="p-2.5 space-y-1.5">
            {/* Time */}
            <p className="text-xs font-bold tabular-nums text-foreground">
              {formatTime(start)}
              {end ? ` – ${formatTime(end)}` : ""}
            </p>
            {/* Student */}
            <div className="flex items-center gap-1.5 min-w-0">
              <Avatar className="h-5 w-5 shrink-0">
                <AvatarImage src={s.student_avatar || undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground text-[8px]">
                  {abbr(s.student_name)}
                </AvatarFallback>
              </Avatar>
              <p className="text-xs font-medium truncate">{s.student_name.split(" ")[0]}</p>
            </div>
            {/* Status / Holiday badge */}
            {holidayName ? (
              <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                Feriado Nacional
              </span>
            ) : (
              <div className="flex items-center gap-1 flex-wrap">
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", cfg.badge)}>
                  {cfg.label}
                </span>
                {s.status === "missed_pending" && (
                  <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                )}
                {s.student_cancel_requested_at && (
                  <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                    <UserX className="h-3 w-3 shrink-0" />
                    Aluno avisou
                  </span>
                )}
              </div>
            )}
            {/* Language */}
            {s.language_name && (
              <p className="text-[10px] text-muted-foreground font-light">{s.language_name}</p>
            )}
            {/* Em breve pulse */}
            {soon && (
              <span className="inline-block text-[10px] font-bold text-primary animate-pulse">
                Em breve
              </span>
            )}
          </CardContent>
        </Card>
      </button>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Agenda</h2>
        <Button size="sm" className="gap-2 shrink-0" onClick={onSchedule} disabled={scheduleDisabled}>
          <CalendarPlus className="h-4 w-4" />
          <span className="hidden sm:inline">Agendar aula</span>
          <span className="sm:hidden">Agendar</span>
        </Button>
      </div>

      {/* ── Week navigation ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs shrink-0"
          onClick={() => setWeekStart(getWeekStart(today))}
          disabled={isCurrentWeek}
        >
          Hoje
        </Button>
        <div className="flex items-center gap-1 flex-1 justify-center min-w-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigateWeek(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="text-sm font-medium text-center min-w-0 truncate px-1">
            {formatWeekRange(weekStart)}
          </p>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigateWeek(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Google Calendar error banner ─────────────────────────────────── */}
      {calError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/50 bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <WifiOff className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {calError}
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/80 font-light">
                As aulas do Google Calendar não aparecem na agenda. Reconecte para restaurar.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40 text-xs"
            onClick={() => navigate("/teacher?tab=profile")}
          >
            Reconectar
          </Button>
        </div>
      )}

      {/* ── Kanban ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="w-[200px] md:w-auto md:flex-1 shrink-0">
              <Skeleton className="h-8 w-full rounded-lg mb-2" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : (
        <div ref={scrollContRef} className="overflow-x-auto pb-4 md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex gap-2 md:grid md:grid-cols-7">
            {weekDays.map((day, colIdx) => {
              const isToday    = isSameDay(day, today);
              const dateStr    = format(day, "yyyy-MM-dd");
              const holidayName = holidays.get(dateStr);
              const colSess   = sessions
                .filter(s => {
                  const { start } = getEffectiveTimes(s);
                  return isSameDay(new Date(start), day);
                })
                .sort((a, b) => {
                  const { start: as } = getEffectiveTimes(a);
                  const { start: bs } = getEffectiveTimes(b);
                  return new Date(as).getTime() - new Date(bs).getTime();
                });
              const colCal = calEvents
                .filter(e => isSameDay(new Date(e.start), day))
                .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

              return (
                <div
                  key={colIdx}
                  ref={isToday ? todayColRef : undefined}
                  className="w-[200px] shrink-0 md:w-auto md:shrink flex flex-col rounded-xl border min-h-[300px] p-2 gap-2"
                  style={isToday ? {
                    borderColor: "color-mix(in srgb, var(--theme-accent) 50%, transparent)",
                    backgroundColor: "color-mix(in srgb, var(--theme-accent) 6%, transparent)",
                    borderWidth: "2px",
                  } : undefined}
                >
                  {/* Column header */}
                  <div className={cn(
                    "text-center pb-1.5 border-b",
                    isToday ? "border-current" : "border-border"
                  )}>
                    <p className={cn(
                      "text-[10px] font-bold uppercase tracking-widest",
                      isToday ? "text-primary" : "text-muted-foreground"
                    )}>
                      {DAY_ABBR[colIdx]}
                    </p>
                    <div className="flex items-center justify-center gap-1.5">
                      <p className={cn(
                        "text-sm font-bold",
                        isToday ? "text-primary" : "text-foreground"
                      )}>
                        {`${String(day.getDate()).padStart(2, "0")}/${String(day.getMonth() + 1).padStart(2, "0")}`}
                      </p>
                      {(colSess.length + colCal.length) > 0 && (
                        <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary/15 text-primary text-[9px] font-bold px-1">
                          {colSess.length + colCal.length}
                        </span>
                      )}
                    </div>
                    {holidayName && (
                      <p className="text-[9px] text-muted-foreground font-medium truncate mt-0.5 leading-tight">
                        {holidayName}
                      </p>
                    )}
                  </div>

                  {/* Cards */}
                  {colSess.length === 0 && colCal.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-[11px] text-muted-foreground/50 font-light text-center">
                        Nenhuma aula
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {colSess.map(s => <SessionCard key={s.id} s={s} holidayName={holidayName} />)}
                      {colCal.map(e => <GCalCard key={e.id} e={e} holidayName={holidayName} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Reagendar sheet ──────────────────────────────────────────────── */}
      <RescheduleSheet
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        session={rescheduleSession}
        onSuccess={loadSessions}
      />

      {/* ── Session drawer ───────────────────────────────────────────────── */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto flex flex-col">
          {selected && (() => {
            const { start, end } = getEffectiveTimes(selected);
            const cfg = STATUS_CONFIG[selected.status] ?? { label: selected.status, badge: "bg-muted text-muted-foreground" };
            const sessionDateStr     = start.substring(0, 10);
            const sessionHoliday     = holidays.get(sessionDateStr);
            const canConfirmMissed   = !sessionHoliday && selected.status === "missed_pending";
            const canMarkCompleted   = !sessionHoliday && selected.status === "scheduled" && hasPassed(selected.scheduled_at);
            return (
              <>
                <SheetHeader className="pb-4">
                  <SheetTitle>Detalhes da aula</SheetTitle>
                </SheetHeader>

                <div className="flex-1 space-y-5">
                  {/* Student */}
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 shrink-0">
                      <AvatarImage src={selected.student_avatar || undefined} />
                      <AvatarFallback className="bg-primary text-primary-foreground font-bold">
                        {abbr(selected.student_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-bold">{selected.student_name}</p>
                      {selected.language_name && (
                        <p className="text-xs text-muted-foreground font-light">{selected.language_name}</p>
                      )}
                    </div>
                  </div>

                  {/* Date & time */}
                  <div className="space-y-1.5 text-sm">
                    {selected.status === "rescheduled" && selected.rescheduled_at ? (
                      <>
                        <div className="flex items-center gap-2 text-muted-foreground line-through">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          <span className="font-light">
                            {format(new Date(selected.scheduled_at), "EEEE, d MMM 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 font-medium">
                          <Calendar className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <span>
                            {format(new Date(selected.rescheduled_at), "EEEE, d MMM 'às' HH:mm", { locale: ptBR })}
                            <span className="ml-1.5 text-[10px] font-bold text-yellow-700 bg-yellow-50 px-1.5 py-0.5 rounded-full">
                              Novo horário
                            </span>
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span>
                          {format(new Date(selected.scheduled_at), "EEEE, d 'de' MMMM", { locale: ptBR })}
                        </span>
                      </div>
                    )}
                    <p className="text-muted-foreground font-light pl-5">
                      {formatTime(start)}{end ? ` – ${formatTime(end)}` : ""}
                    </p>
                  </div>

                  {/* Status */}
                  <span className={cn("inline-block text-xs px-2.5 py-1 rounded-full font-medium", cfg.badge)}>
                    {cfg.label}
                  </span>

                  {/* Student absence warning */}
                  {selected.student_cancel_requested_at && (
                    <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 px-3.5 py-3">
                      <UserX className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                          Aluno avisou que não poderá comparecer
                        </p>
                        <p className="text-xs text-amber-700/80 dark:text-amber-400/80 font-light">
                          Avisado em {format(new Date(selected.student_cancel_requested_at), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Meet link */}
                  {selected.meet_link && (
                    <Button
                      className="w-full gap-2"
                      onClick={() => window.open(selected.meet_link!, "_blank")}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Entrar na aula
                    </Button>
                  )}

                  {/* Reagendar */}
                  {(selected.status === "scheduled" || selected.status === "rescheduled") &&
                    selected.google_event_id && (
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => handleReschedule(selected)}
                    >
                      <CalendarClock className="h-4 w-4" />
                      Reagendar aula
                    </Button>
                  )}

                  {/* Actions */}
                  <div className="space-y-2">
                    {canConfirmMissed && (
                      <Button
                        variant="destructive"
                        className="w-full gap-2"
                        onClick={handleConfirmMissed}
                        disabled={confirmingMissed}
                      >
                        <AlertTriangle className="h-4 w-4" />
                        {confirmingMissed ? "Confirmando..." : "Confirmar falta"}
                      </Button>
                    )}
                    {canMarkCompleted && (
                      <Button
                        variant="outline"
                        className="w-full gap-2 border-green-400/60 text-green-700 hover:bg-green-50 dark:text-green-300 dark:hover:bg-green-950/20"
                        onClick={handleMarkCompleted}
                        disabled={markingCompleted}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {markingCompleted ? "Salvando..." : "Marcar como realizada"}
                      </Button>
                    )}
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Observações</p>
                    <Textarea
                      value={drawerNotes}
                      onChange={e => setDrawerNotes(e.target.value)}
                      placeholder="Anotações sobre esta aula..."
                      rows={4}
                      className="resize-none text-sm font-light"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={handleSaveNotes}
                      disabled={savingNotes || drawerNotes === (selected.notes ?? "")}
                    >
                      {savingNotes ? "Salvando..." : "Salvar observações"}
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default TeacherAgendaTab;
