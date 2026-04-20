import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, ExternalLink, Users } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface ClassEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  meet_link: string | null;
  description: string | null;
  attendees: { email: string; name?: string }[];
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

const extractStudentName = (title: string): string | null =>
  title?.split(" | ")[1]?.trim() ?? null;

const extractLanguage = (title: string): string | null =>
  title?.split(" | ")[0]?.trim() ?? null;

// ── Componente ─────────────────────────────────────────────────────────────────

const TeacherUpcomingClasses = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<ClassEvent[]>([]);
  const isMounted = useRef(true);

  const load = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Garante token fresco
      let { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        session = refreshed.session;
      }
      const accessToken = session?.access_token;
      if (!accessToken) return;

      const { data } = await supabase.functions.invoke("google-calendar", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          action: "list_teacher_events",
          payload: {},
        },
      });

      const today = new Date().toDateString();
      const todayEvents = (data?.events || []).filter(
        (ev: ClassEvent) => new Date(ev.start).toDateString() === today
      );
      if (isMounted.current) setEvents(todayEvents);
    } catch {
      if (isMounted.current) setEvents([]);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    isMounted.current = true;
    load();
    return () => { isMounted.current = false; };
  }, [load]);

  // Revalida ao retornar à aba
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 flex flex-col items-center gap-2 text-center">
          <CalendarDays className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground font-light">
            Nenhuma aula agendada para hoje.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((ev) => {
        const soon = isStartingSoon(ev.start);
        const studentName = extractStudentName(ev.title);
        const language = extractLanguage(ev.title);

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

                {/* Aluno + idioma */}
                {(studentName || language) && (
                  <p className="text-xs text-muted-foreground font-light flex items-center gap-1">
                    <Users className="h-3 w-3 shrink-0" />
                    {studentName && <span className="font-medium text-foreground">{studentName}</span>}
                    {studentName && language && <span>·</span>}
                    {language && <span>{language}</span>}
                  </p>
                )}

                {soon && (
                  <span className="inline-block text-[10px] font-bold text-primary uppercase tracking-wide">
                    Começando em breve
                  </span>
                )}
              </div>

              {/* Botão Meet */}
              {ev.meet_link ? (
                <Button
                  size="sm"
                  className="shrink-0 gap-1.5 font-bold"
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
                <span className="text-xs text-muted-foreground font-light shrink-0">
                  Link indisponível
                </span>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default TeacherUpcomingClasses;
