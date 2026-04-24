import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarDays, ExternalLink, RefreshCw, Calendar,
  Loader2, AlertTriangle, ChevronRight, BanIcon, CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import RescheduleSheet, { type RescheduleSessionData } from "@/components/RescheduleSheet";

// ── Swipe-to-action ────────────────────────────────────────────────────────────

type SnapDir = "right" | "left" | null;

function useSwipeAction(onRight?: () => void, onLeft?: () => void, threshold = 80) {
  const [dragX, setDragX] = useState(0);
  const [snapped, setSnapped] = useState<SnapDir>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const lockAxis = useRef<"h" | "v" | null>(null);
  const snappedRef = useRef<SnapDir>(null);
  const SNAP_AT = threshold * 0.5;

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    lockAxis.current = null;
    snappedRef.current = null;
    setSnapped(null);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (snappedRef.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (!lockAxis.current && (Math.abs(dx) > 6 || Math.abs(dy) > 6))
      lockAxis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    if (lockAxis.current !== "h") return;
    e.preventDefault();
    const clamped = dx > 0
      ? Math.min(dx, threshold * 1.5)
      : Math.max(dx, -threshold * 1.5);
    setDragX(clamped);
    if (Math.abs(clamped) >= SNAP_AT) {
      const dir: SnapDir = clamped > 0 ? "right" : "left";
      snappedRef.current = dir;
      setSnapped(dir);
      setDragX(dir === "right" ? 400 : -400);
    }
  };

  const onTouchEnd = () => {
    if (snappedRef.current === "right") onRight?.();
    else if (snappedRef.current === "left") onLeft?.();
    setDragX(0);
    setSnapped(null);
    snappedRef.current = null;
    lockAxis.current = null;
  };

  return { dragX, snapped, onTouchStart, onTouchMove, onTouchEnd };
}

interface SwipeableActionProps {
  onPrimary?: () => void;
  primaryIcon: React.ReactNode;
  primaryLabel: string;
  primaryColor: string;
  onSecondary?: () => void;
  secondaryIcon?: React.ReactNode;
  secondaryLabel?: string;
  secondaryColor?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

function SwipeableAction({
  onPrimary, primaryIcon, primaryLabel, primaryColor,
  onSecondary, secondaryIcon, secondaryLabel, secondaryColor,
  disabled, children,
}: SwipeableActionProps) {
  const THRESHOLD = 80;
  const { dragX, snapped: touchSnapped, onTouchStart, onTouchMove, onTouchEnd } = useSwipeAction(
    onPrimary ? () => onPrimary() : undefined,
    onSecondary ? () => onSecondary() : undefined,
    THRESHOLD,
  );
  const [mousedrag, setMousedrag] = useState(0);
  const [mouseSnapped, setMouseSnapped] = useState<SnapDir>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startMouseX = useRef(0);
  const mouseSnappedRef = useRef<SnapDir>(null);
  const didMoveRef = useRef(false);
  const onPrimaryRef = useRef(onPrimary);
  const onSecondaryRef = useRef(onSecondary);
  onPrimaryRef.current = onPrimary;
  onSecondaryRef.current = onSecondary;

  const snapDir: SnapDir = touchSnapped ?? mouseSnapped;

  const translateX = disabled ? 0
    : snapDir === "right" ? 400
    : snapDir === "left"  ? -400
    : dragX !== 0 ? dragX
    : mousedrag !== 0 ? mousedrag
    : 0;

  const absTX = Math.abs(translateX);
  const progress = Math.min((snapDir ? THRESHOLD : absTX) / THRESHOLD, 1);
  const isActiveDrag = dragX !== 0 || mousedrag !== 0;
  const dragDir: SnapDir = translateX > 0 ? "right" : translateX < 0 ? "left" : null;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    startMouseX.current = e.clientX;
    mouseSnappedRef.current = null;
    didMoveRef.current = false;
    setIsDragging(true);
    setMousedrag(0);

    const onMove = (ev: MouseEvent) => {
      if (mouseSnappedRef.current) return;
      const dx = ev.clientX - startMouseX.current;
      const clamped = dx > 0
        ? Math.min(dx, THRESHOLD * 1.5)
        : Math.max(dx, -THRESHOLD * 1.5);
      if (Math.abs(clamped) > 5) didMoveRef.current = true;
      setMousedrag(clamped);
      if (Math.abs(clamped) >= THRESHOLD * 0.5) {
        const dir: SnapDir = clamped > 0 ? "right" : "left";
        mouseSnappedRef.current = dir;
        setMouseSnapped(dir);
        setMousedrag(dir === "right" ? 400 : -400);
      }
    };

    const onUp = () => {
      const snapped = mouseSnappedRef.current;
      if (didMoveRef.current) {
        const blockClick = (ev: MouseEvent) => {
          ev.stopPropagation();
          document.removeEventListener("click", blockClick, true);
        };
        document.addEventListener("click", blockClick, true);
      }
      if (snapped === "right") onPrimaryRef.current?.();
      else if (snapped === "left") onSecondaryRef.current?.();
      mouseSnappedRef.current = null;
      didMoveRef.current = false;
      setMousedrag(0);
      setMouseSnapped(null);
      setIsDragging(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div
      className="relative overflow-hidden rounded-lg border-l-4 border-l-primary"
    >
      {/* Right-swipe background (left side) */}
      <div
        className="absolute inset-0 flex items-center gap-2 pl-5"
        style={{ background: primaryColor, opacity: dragDir === "right" || snapDir === "right" ? 1 : 0 }}
      >
        <div style={{ color: "var(--theme-accent)", transform: `scale(${0.8 + progress * 0.2})`, transition: "transform 0.1s" }}>
          {primaryIcon}
        </div>
        <span
          className="text-sm font-bold text-white"
          style={{ opacity: progress > 0.3 ? 1 : 0, transition: "opacity 0.12s" }}
        >
          {primaryLabel}
        </span>
      </div>

      {/* Left-swipe background (right side) */}
      <div
        className="absolute inset-0 flex items-center justify-end gap-2 pr-5"
        style={{ background: secondaryColor, opacity: dragDir === "left" || snapDir === "left" ? 1 : 0 }}
      >
        <span
          className="text-sm font-bold text-white"
          style={{ opacity: progress > 0.3 ? 1 : 0, transition: "opacity 0.12s" }}
        >
          {secondaryLabel}
        </span>
        <div style={{ color: "white", transform: `scale(${0.8 + progress * 0.2})`, transition: "transform 0.1s" }}>
          {secondaryIcon}
        </div>
      </div>

      {/* Sliding card */}
      <div
        style={{
          transform: `translateX(${translateX}px)`,
          transition: snapDir ? "transform 0.25s ease-out" : isActiveDrag ? "none" : "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
          cursor: isDragging ? "grabbing" : "grab",
          userSelect: "none",
        }}
        onMouseDown={handleMouseDown}
        {...(!disabled && { onTouchStart, onTouchMove: onTouchMove as any, onTouchEnd })}
      >
        {children}
      </div>
    </div>
  );
}

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
  is_holiday: boolean;
  holiday_name: string | null;
}

interface ClassSession {
  id: string;
  google_event_id: string | null;
  scheduled_at: string;
  ends_at: string | null;
  rescheduled_at: string | null;
  rescheduled_ends_at: string | null;
  teacher_id: string;
  status: string;
  student_cancel_requested_at: string | null;
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

const hasPassed = (startIso: string) => new Date(startIso).getTime() < Date.now();

const groupLabel = (title: string): string =>
  title.split(" | ")[1]?.trim() ?? "Turma";

// ── Componente ─────────────────────────────────────────────────────────────────

const UpcomingClasses = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading]       = useState(false);
  const [events, setEvents]         = useState<ClassEvent[]>(
    import.meta.env.DEV ? [
      { id: "dev-1", title: "Aula individual", start: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), end: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 55 * 60 * 1000).toISOString(), meet_link: null, description: null, class_type: "individual", is_rescheduled: false, is_holiday: false, holiday_name: null },
      { id: "dev-2", title: "Aula individual | Turma A", start: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 55 * 60 * 1000).toISOString(), meet_link: "https://meet.google.com", description: null, class_type: "group", is_rescheduled: false, is_holiday: false, holiday_name: null },
    ] : []
  );
  const [teacherName, setTeacherName] = useState<string>("");
  const [sessionByTime, setSessionByTime] = useState<Map<string, ClassSession>>(new Map());

  // Sheet de detalhes da sessão
  const [sheetOpen, setSheetOpen]     = useState(false);
  const [sheetEvent, setSheetEvent]   = useState<ClassEvent | null>(null);
  const [confirming, setConfirming]   = useState(false); // etapa "tem certeza?"
  const [cancelling, setCancelling]   = useState(false); // enviando aviso de ausência

  // Reagendar
  const [rescheduleSession, setRescheduleSession] = useState<RescheduleSessionData | null>(null);
  const [rescheduleOpen, setRescheduleOpen]       = useState(false);

  const isMounted = useRef(true);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!user || !profile) return;
    setLoading(true);
    try {
      const [{ data: teacherInfo }, { data: studentData }] = await Promise.all([
        supabase.rpc("get_my_teacher_info", { p_uid: profile.id }).maybeSingle(),
        supabase.from("students").select("id").eq("user_id", profile.id).maybeSingle(),
      ]);
      if (!isMounted.current) return;
      if (!teacherInfo) return;
      if (isMounted.current) setTeacherName(teacherInfo.teacher_name || "Professor");

      let { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        session = refreshed.session;
      }
      const accessToken = session?.access_token;
      if (!accessToken) return;

      const studentDbId = studentData?.id ?? null;

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
              .select("id, google_event_id, scheduled_at, ends_at, rescheduled_at, rescheduled_ends_at, teacher_id, status, student_cancel_requested_at")
              .eq("student_id", studentDbId)
              .in("status", ["scheduled", "rescheduled"])
          : Promise.resolve({ data: [] }),
      ]);

      if (!isMounted.current) return;

      // Mostra até 5 aulas futuras
      const calEvents: ClassEvent[] = (calRes.data?.events || []).slice(0, 5);
      if (isMounted.current) setEvents(calEvents);

      if (isMounted.current && sessionsRes.data) {
        // Index by first 16 chars of scheduled_at ("YYYY-MM-DDTHH:MM") so we can
        // match against ev.start regardless of Google Calendar instance-ID format.
        const map = new Map<string, ClassSession>();
        // Normalise to UTC ISO "YYYY-MM-DDTHH:MM" so local-timezone event
        // start strings from Google Calendar match DB timestamps correctly.
        const utcKey = (iso: string) => new Date(iso).toISOString().substring(0, 16);
        for (const s of sessionsRes.data as ClassSession[]) {
          map.set(utcKey(s.scheduled_at), s);
          if (s.rescheduled_at) map.set(utcKey(s.rescheduled_at), s);
        }
        setSessionByTime(map);
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

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openSheet = (ev: ClassEvent) => {
    setSheetEvent(ev);
    setConfirming(false);
    setSheetOpen(true);
  };

  // eventId = instance ID (single) or base event ID (recurring)
  const openReschedule = (
    eventId: string,
    mode: "single" | "recurring",
    session: ClassSession,
    evStart: string
  ) => {
    setSheetOpen(false);
    setSheetEvent(null);
    setTimeout(() => {
      setRescheduleSession({
        id: session.id,
        google_event_id: eventId,
        scheduled_at: session.rescheduled_at ?? session.scheduled_at,
        scheduled_ends_at: session.rescheduled_ends_at ?? session.ends_at ?? evStart,
        teacher_id: session.teacher_id,
        original_scheduled_at: session.scheduled_at,
        mode,
      });
      setRescheduleOpen(true);
    }, 150);
  };

  // Detects whether a Google Calendar event is a recurring instance
  const getRecurringInfo = (evId: string) => {
    const match = evId.match(/^(.+)_(\d{8}T\d{6}Z)$/);
    return { isRecurring: !!match, baseEventId: match ? match[1] : evId };
  };

  const handleReportAbsence = async () => {
    const session = sheetEvent
      ? sessionByTime.get(new Date(sheetEvent.start).toISOString().substring(0, 16))
      : null;
    if (!session) return;
    setCancelling(true);
    try {
      const { error } = await (supabase as any)
        .from("class_sessions")
        .update({ student_cancel_requested_at: new Date().toISOString() })
        .eq("id", session.id);
      if (error) throw error;

      // Notificação push para o professor (best-effort)
      try {
        const { data: { session: authSess } } = await supabase.auth.getSession();
        if (authSess?.access_token) {
          await supabase.functions.invoke("send-push-notification", {
            headers: { Authorization: `Bearer ${authSess.access_token}` },
            body: {
              profile_id: session.teacher_id,
              title: "Aluno não poderá comparecer",
              body: `${profile?.name || "Seu aluno"} informou que não poderá comparecer à próxima aula.`,
            },
          });
        }
      } catch { /* push notification é não-bloqueante */ }

      toast({
        title: "Professor avisado!",
        description: "Você pode remarcar a aula se quiser.",
      });
      setSheetOpen(false);
      setConfirming(false);
      load();
    } catch (e: any) {
      toast({ title: "Erro ao enviar aviso", description: e.message, variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  // ── Render: loading ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-bold">Próximas aulas</p>
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
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

  // ── Render: lista de aulas ─────────────────────────────────────────────────

  const visibleEvents = events.slice(0, 2);
  const hasMore = events.length > 2;

  return (
    <>
      <div className="space-y-3">
        <p className="text-sm font-bold">Próximas aulas</p>

        {visibleEvents.map((ev) => {
          const soon           = isStartingSoon(ev.start);
          const passed         = hasPassed(ev.start);
          const matchedSession = sessionByTime.get(new Date(ev.start).toISOString().substring(0, 16));
          const studentCancelled = !!matchedSession?.student_cancel_requested_at;

          const typeBadge = ev.is_rescheduled ? (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-yellow-400 text-yellow-600 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-400">
              Remarcada
            </Badge>
          ) : ev.class_type === "duo" ? (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">Dupla</Badge>
          ) : ev.class_type === "group" ? (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{groupLabel(ev.title)}</Badge>
          ) : null;

          const isIndividual = ev.class_type !== "group";
          const hasSession = !!matchedSession || import.meta.env.DEV;
          const canReschedule = hasSession && !hasPassed(ev.start) && isIndividual;
          const canAbsence = hasSession && !hasPassed(ev.start) && !studentCancelled;

          return (
            <SwipeableAction
              key={ev.id}
              disabled={ev.is_holiday}
              onPrimary={canReschedule ? () => {
                const { isRecurring } = getRecurringInfo(ev.id);
                openReschedule(ev.id, isRecurring ? "recurring" : "single", matchedSession!, ev.start);
              } : undefined}
              primaryIcon={<CalendarClock className="h-5 w-5" />}
              primaryLabel="Remarcar"
              primaryColor="var(--theme-primary)"
              onSecondary={canAbsence ? () => { setSheetEvent(ev); setConfirming(true); setSheetOpen(true); } : undefined}
              secondaryIcon={<BanIcon className="h-5 w-5" />}
              secondaryLabel="Informar ausência"
              secondaryColor="#f59e0b"
            >
            <Card
              className={cn(
                "transition-shadow rounded-none border-l-0",
                ev.is_holiday    ? "opacity-60 bg-muted/40" :
                studentCancelled ? "border-amber-300/60 bg-amber-50/30 dark:bg-amber-950/10" :
                soon             ? "bg-primary/5" : undefined
              )}
            >
              <CardContent className="py-0">
                {/* Área principal clicável → abre drawer */}
                <button
                  className="w-full text-left py-4 pr-2 flex items-center gap-3"
                  onClick={() => !ev.is_holiday && openSheet(ev)}
                  disabled={ev.is_holiday}
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm font-bold truncate">{formatClassDate(ev.start)}</p>
                    <p className="text-xs text-muted-foreground font-light">
                      {formatTime(ev.start)} – {formatTime(ev.end)}
                    </p>
                    <p className="text-xs text-muted-foreground font-light">{teacherName}</p>

                    {ev.is_holiday ? (
                      <div className="pt-0.5 space-y-0.5">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-gray-400 text-gray-600 bg-gray-50 dark:bg-gray-900 dark:text-gray-400">
                          Feriado Nacional
                        </Badge>
                        {ev.holiday_name && (
                          <p className="text-[10px] text-muted-foreground font-light">{ev.holiday_name}</p>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {typeBadge}
                        {studentCancelled && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3" />
                            Ausência informada
                          </span>
                        )}
                        {soon && !studentCancelled && (
                          <span className="text-[10px] font-bold text-primary uppercase tracking-wide">
                            Começando em breve
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Chevron → indica que o card é clicável */}
                  {!ev.is_holiday && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                  )}
                </button>

                {/* Botão "Entrar" — separado para não propagar o click do card */}
                {!ev.is_holiday && ev.meet_link && (
                  <div className="pb-3">
                    <Button
                      size="sm"
                      className={cn("gap-1.5 font-bold w-full", !soon && "variant-outline")}
                      style={soon ? { background: "var(--theme-primary)", color: "var(--theme-text-on-primary)" } : undefined}
                      variant={soon ? "default" : "outline"}
                      onClick={(e) => { e.stopPropagation(); window.open(ev.meet_link!, "_blank"); }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Entrar na aula
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
            </SwipeableAction>
          );
        })}

        {hasMore && (
          <button
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5 font-medium"
            onClick={() => toast({ title: "Em breve!", description: "A visualização de todas as aulas estará disponível em breve." })}
          >
            Ver todas as aulas →
          </button>
        )}
      </div>

      {/* ── Sheet de detalhes / ações ───────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={(o) => { setSheetOpen(o); if (!o) setConfirming(false); }}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
          {sheetEvent && (() => {
            const ev      = sheetEvent;
            const session = sessionByTime.get(new Date(ev.start).toISOString().substring(0, 16));
            const soon    = isStartingSoon(ev.start);
            const isFuture = !hasPassed(ev.start);
            const alreadyCancelled = !!session?.student_cancel_requested_at;
            const { isRecurring, baseEventId } = getRecurringInfo(ev.id);

            return (
              <>
                <SheetHeader className="pb-4">
                  <SheetTitle>Detalhes da aula</SheetTitle>
                </SheetHeader>

                <div className="space-y-5 pb-6">
                  {/* Info da aula */}
                  <div className="p-4 rounded-xl bg-muted/40 space-y-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-bold">{formatClassDate(ev.start)}</p>
                        <p className="text-xs text-muted-foreground font-light">
                          {formatTime(ev.start)} – {formatTime(ev.end)}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground font-light pl-6">{teacherName}</p>
                    <div className="flex flex-wrap gap-1.5 pl-6 pt-0.5">
                      {ev.is_rescheduled && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-yellow-400 text-yellow-600 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-400">
                          Remarcada
                        </Badge>
                      )}
                      {ev.class_type === "duo" && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">Dupla</Badge>
                      )}
                      {ev.class_type === "group" && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{groupLabel(ev.title)}</Badge>
                      )}
                      {soon && (
                        <span className="text-[10px] font-bold text-primary uppercase tracking-wide">
                          Começando em breve
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ausência já informada */}
                  {alreadyCancelled && (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                          Ausência informada ao professor
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-400 font-light mt-0.5">
                          Avisado em {format(new Date(session!.student_cancel_requested_at!), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Ações */}
                  <div className="space-y-2">
                    {/* Entrar */}
                    {ev.meet_link && (
                      <Button
                        className="w-full gap-2"
                        style={soon ? { background: "var(--theme-primary)", color: "var(--theme-text-on-primary)" } : undefined}
                        onClick={() => window.open(ev.meet_link!, "_blank")}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Entrar na aula
                      </Button>
                    )}

                    {/* Remarcar / Alterar horário — indisponível para aulas em turma */}
                    {session && isFuture && ev.class_type !== "group" && (
                      <>
                        <Button
                          variant="outline"
                          className="w-full gap-2"
                          onClick={() => openReschedule(ev.id, "single", session, ev.start)}
                        >
                          <RefreshCw className="h-4 w-4" />
                          Remarcar esta aula
                        </Button>

                        {isRecurring && (
                          <Button
                            variant="outline"
                            className="w-full gap-2 text-blue-700 border-blue-300 hover:bg-blue-50 dark:text-blue-300 dark:border-blue-700 dark:hover:bg-blue-950/20"
                            onClick={() => openReschedule(baseEventId, "recurring", session, ev.start)}
                          >
                            <CalendarClock className="h-4 w-4" />
                            Alterar horário das aulas
                          </Button>
                        )}
                      </>
                    )}

                    {/* Não posso comparecer */}
                    {session && isFuture && !alreadyCancelled && (
                      <>
                        {confirming ? (
                          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-3">
                            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                              Tem certeza? Seu professor será notificado.
                            </p>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="destructive"
                                className="flex-1"
                                onClick={handleReportAbsence}
                                disabled={cancelling}
                              >
                                {cancelling
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : "Confirmar ausência"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="flex-1"
                                onClick={() => setConfirming(false)}
                                disabled={cancelling}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            className="w-full gap-2 text-muted-foreground hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                            onClick={() => setConfirming(true)}
                          >
                            <BanIcon className="h-4 w-4" />
                            Não poderei comparecer
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ── Reagendar ──────────────────────────────────────────────────────── */}
      <RescheduleSheet
        open={rescheduleOpen}
        onOpenChange={(open) => { setRescheduleOpen(open); if (!open) setRescheduleSession(null); }}
        session={rescheduleSession}
        onSuccess={load}
      />
    </>
  );
};

export default UpcomingClasses;
