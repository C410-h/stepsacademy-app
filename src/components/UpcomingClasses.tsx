import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
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

/** Verdadeiro se a aula começa em até 30 min a partir de agora */
const isStartingSoon = (startIso: string): boolean => {
  const diff = new Date(startIso).getTime() - Date.now();
  return diff >= 0 && diff <= 30 * 60 * 1000;
};

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
      // 1. Resolver professor via função SECURITY DEFINER (sem tocar em RLS das tabelas)
      const { data: teacherInfo, error: tiErr } = await supabase
        .rpc("get_my_teacher_info", { p_uid: profile.id })
        .maybeSingle();

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

      // 3. Eventos do Google Calendar + class_sessions em paralelo
      const [calRes, studentRes] = await Promise.all([
        supabase.functions.invoke("google-calendar", {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: {
            action: "list_student_events",
            payload: {
              student_email: user.email,
              teacher_id: teacherInfo.teacher_user_id,
            },
          },
        }),
        supabase.from("students").select("id").eq("user_id", profile.id).maybeSingle(),
      ]);

      if (!isMounted.current) return;

      const calEvents: ClassEvent[] = calRes.data?.events || [];
      if (isMounted.current) setEvents(calEvents);

      // 4. Buscar class_sessions e indexar por google_event_id
      if (studentRes.data?.id) {
        const { data: sessions } = await (supabase as any)
          .from("class_sessions")
          .select("id, google_event_id, scheduled_at, scheduled_ends_at, teacher_id, status, reschedule_count")
          .eq("student_id", studentRes.data.id)
          .eq("status", "scheduled");

        if (isMounted.current && sessions) {
          const map = new Map<string, ClassSession>(
            sessions.map((s: ClassSession) => [s.google_event_id, s])
          );
          setSessionByEventId(map);
        }
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
