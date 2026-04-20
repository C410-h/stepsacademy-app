import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, ExternalLink, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import RescheduleSheet, { type RescheduleSessionData } from "@/components/RescheduleSheet";

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface ClassEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  meet_link: string | null;
  description: string | null;
  class_type: "individual" | "duo" | "group";
  is_rescheduled: boolean;
}

interface ClassSession {
  id: string;
  google_event_id: string;
  scheduled_at: string;
  scheduled_ends_at: string;
  teacher_id: string;
  status: string;
  reschedule_count: number;
}

// ── Utilitários ────────────────────────────────────────────────────────────────

const formatClassDate = (isoStr: string): string => {
  const d = new Date(isoStr);
  const raw = format(d, "EEEE, d 'de' MMMM", { locale: ptBR });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const formatTime = (isoStr: string): string =>
  new Date(isoStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const isStartingSoon = (startIso: string): boolean => {
  const diff = new Date(startIso).getTime() - Date.now();
  return diff >= 0 && diff <= 30 * 60 * 1000;
};

/** Extrai o identificador do grupo do título (ex: "Español | Squad" → "Squad") */
const groupLabel = (title: string): string =>
  title.split(" | ")[1]?.trim() ?? "Turma";

// ── Componente ─────────────────────────────────────────────────────────────────

const UpcomingClasses = () => {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<ClassEvent[]>([]);
  const [teacherName, setTeacherName] = useState<string>("");
  const [sessionByEventId, setSessionByEventId] = useState<Map<string, ClassSession>>(new Map());
  const [rescheduleSession, setRescheduleSession] = useState<RescheduleSessionData | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const isMounted = useRef(true);

  const load = useCallback(async () => {
    if (!user || !profile) return;

    setLoading(true);
    try {
      // 1. Buscar professor e student_db_id em paralelo
      const [{ data: teacherInfo }, { data: studentData }] = await Promise.all([
        supabase.rpc("get_my_teacher_info", { p_uid: profile.id }).maybeSingle(),
        supabase.from("students").select("id").eq("user_id", profile.id).maybeSingle(),
      ]);

      if (!isMounted.current) return;
      if (!teacherInfo) return;

      if (isMounted.current) setTeacherName(teacherInfo.teacher_name || "Professor");

      // 2. Garante token fresco
      let { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        session = refreshed.session;
      }
      const accessToken = session?.access_token;
      if (!accessToken) return;

      const studentDbId = studentData?.id ?? null;

      // 3. Eventos do Google Calendar + class_sessions em paralelo
      const [calRes, sessionsRes] = await Promise.all([
        supabase.functions.invoke("google-calendar", {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: {
            action: "list_student_events",
            payload: {
              student_email: user.email,
              student_profile_id: profile.id,
              student_db_id: studentDbId,
              teacher_id: teacherInfo.teacher_user_id,
            },
          },
        }),
        studentDbId
          ? (supabase as any)
              .from("class_sessions")
              .select("id, google_event_id, scheduled_at, scheduled_ends_at, teacher_id, status, reschedule_count")
              .eq("student_id", studentDbId)
              .eq("status", "scheduled")
          : Promise.resolve({ data: [] }),
      ]);

      if (!isMounted.current) return;

      const calEvents: ClassEvent[] = (calRes.data?.events || []).slice(0, 1);
      if (isMounted.current) setEvents(calEvents);

      if (isMounted.current && sessionsRes.data) {
        const map = new Map<string, ClassSession>(
          sessionsRes.data.map((s: ClassSession) => [s.google_event_id, s])
        );
        setSessionByEventId(map);
      }
    } catch {
      if (isMounted.current) setEvents([]);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [user, profile]);

  useEffect(() => {
    isMounted.current = true;
    load();
    return () => { isMounted.current = false; };
  }, [load]);

  useEffect(() => {
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const openReschedule = (session: ClassSession) => {
    setRescheduleSession({
      id: session.id,
      google_event_id: session.google_event_id,
      scheduled_at: session.scheduled_at,
      scheduled_ends_at: session.scheduled_ends_at,
      teacher_id: session.teacher_id,
    });
    setRescheduleOpen(true);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-bold">Próximas aulas</p>
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-bold">Próximas aulas</p>
        <Card>
          <CardContent className="py-6 flex flex-col items-center gap-2 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground font-light">
              Nenhuma aula agendada nos próximos 30 dias.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <p className="text-sm font-bold">Próximas aulas</p>
        {events.map((ev) => {
          const soon = isStartingSoon(ev.start);
          const matchedSession = sessionByEventId.get(ev.id);

          // Badge de tipo ou remarcada (remarcada tem prioridade)
          const typeBadge = ev.is_rescheduled ? (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-yellow-400 text-yellow-600 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-400"
            >
              Remarcada
            </Badge>
          ) : ev.class_type === "duo" ? (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              Aula em dupla
            </Badge>
          ) : ev.class_type === "group" ? (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {groupLabel(ev.title)}
            </Badge>
          ) : null;

          return (
            <Card
              key={ev.id}
              className={soon ? "border-primary/40 bg-primary/5" : undefined}
            >
              <CardContent className="py-4 flex items-center justify-between gap-3">
                {/* Info */}
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-bold truncate">
                    {formatClassDate(ev.start)}
                  </p>
                  <p className="text-xs text-muted-foreground font-light">
                    {formatTime(ev.start)} – {formatTime(ev.end)}
                  </p>
                  <p className="text-xs text-muted-foreground font-light">
                    {teacherName}
                  </p>
                  {typeBadge && <div className="pt-0.5">{typeBadge}</div>}
                  {soon && (
                    <span className="inline-block text-[10px] font-bold text-primary uppercase tracking-wide">
                      Começando em breve
                    </span>
                  )}
                </div>

                {/* Botões */}
                <div className="flex flex-col gap-2 shrink-0 items-end">
                  {ev.meet_link ? (
                    <Button
                      size="sm"
                      className="gap-1.5 font-bold"
                      style={
                        soon
                          ? { background: "var(--theme-accent)", color: "var(--theme-text-on-accent)" }
                          : undefined
                      }
                      variant={soon ? "default" : "outline"}
                      onClick={() => window.open(ev.meet_link!, "_blank")}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Entrar
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground font-light">
                      Link indisponível
                    </span>
                  )}
                  {matchedSession && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-muted-foreground hover:text-foreground text-xs h-7 px-2"
                      onClick={() => openReschedule(matchedSession)}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Remarcar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <RescheduleSheet
        open={rescheduleOpen}
        onOpenChange={(open) => {
          setRescheduleOpen(open);
          if (!open) setRescheduleSession(null);
        }}
        session={rescheduleSession}
        onSuccess={load}
      />
    </>
  );
};

export default UpcomingClasses;
