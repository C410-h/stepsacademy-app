import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, ExternalLink } from "lucide-react";
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
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const isMounted = useRef(true);

  const load = useCallback(async () => {
    if (!user || !profile) return;

    setLoading(true);
    try {
      // 1. Buscar student.id
      const { data: student } = await supabase
        .from("students")
        .select("id")
        .eq("user_id", profile.id)
        .maybeSingle();

      if (!student || !isMounted.current) return;

      // 2. Buscar teacher via teacher_students
      const { data: ts } = await (supabase as any)
        .from("teacher_students")
        .select("teacher_id")
        .eq("student_id", student.id)
        .limit(1)
        .maybeSingle();

      if (!ts || !isMounted.current) return;

      // 3. Resolver user_id do professor (= profiles.id onde ficam os tokens)
      const { data: teacher } = await (supabase as any)
        .from("teachers")
        .select("user_id")
        .eq("id", ts.teacher_id)
        .maybeSingle();

      if (!teacher || !isMounted.current) return;

      // 4. Nome do professor para exibir nos cards
      const { data: teacherProfile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", teacher.user_id)
        .maybeSingle();

      if (isMounted.current) setTeacherName(teacherProfile?.name || "Professor");

      // 5. Chamar Edge Function usando o Calendar do professor
      // Garante token fresco para evitar 401 por JWT expirado
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
          action: "list_student_events",
          payload: {
            student_email: user.email,
            teacher_id: teacher.user_id, // profiles.id do professor
          },
        },
      });

      if (isMounted.current) {
        setEvents(data?.events || []);
        setDebugInfo({ student_email_used: data?.student_email_used, attendees: data?.debug_attendees });
      }
    } catch {
      // Erros silenciosos — exibe estado vazio
      if (isMounted.current) setEvents([]);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [user, profile]);

  // Carga inicial
  useEffect(() => {
    isMounted.current = true;
    load();
    return () => { isMounted.current = false; };
  }, [load]);

  // Revalida ao retornar ao dashboard (troca de aba / app background)
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

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
            {/* DEBUG TEMPORÁRIO — remover após diagnóstico */}
            {debugInfo && (
              <div className="mt-2 text-left text-[10px] bg-muted rounded p-2 w-full break-all">
                <p><b>email usado:</b> {debugInfo.student_email_used}</p>
                {debugInfo.attendees?.map((ev: any, i: number) => (
                  <p key={i}><b>{ev.title}</b>: {ev.attendees?.join(", ") || "sem attendees"}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold">Próximas aulas</p>
      {events.map((ev) => {
        const soon = isStartingSoon(ev.start);
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

              {/* Botão */}
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

export default UpcomingClasses;
