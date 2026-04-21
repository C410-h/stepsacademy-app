import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { format, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, Clock, RefreshCw, CalendarClock } from "lucide-react";

export interface RescheduleSessionData {
  id: string;
  google_event_id: string;
  /** Horário efetivo para cálculo de duração (pode ser rescheduled_at se já remarcado) */
  scheduled_at: string;
  scheduled_ends_at: string;
  teacher_id: string;
  /** O scheduled_at original do banco — usado para encontrar todas as sessões do mesmo horário (ex: dupla) */
  original_scheduled_at?: string;
  /** 'single' = só esta ocorrência | 'recurring' = esta e todas as seguintes */
  mode?: "single" | "recurring";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: RescheduleSessionData | null;
  onSuccess?: () => void;
}

const RescheduleSheet = ({ open, onOpenChange, session, onSuccess }: Props) => {
  const { toast } = useToast();
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setDate(undefined);
      setSelectedSlot(null);
      setAvailableSlots(null);
      setLoadingSlots(false);
    }
  }, [open]);

  useEffect(() => {
    if (!date || !session) return;

    const fetchSlots = async () => {
      setLoadingSlots(true);
      setSelectedSlot(null);
      setAvailableSlots(null);
      try {
        const dow = date.getDay();
        const dateStr = format(date, "yyyy-MM-dd");

        const { data: avail } = await (supabase as any)
          .from("teacher_availability")
          .select("start_time, end_time")
          .eq("teacher_id", session.teacher_id)
          .eq("day_of_week", dow)
          .eq("active", true);

        if (!avail || avail.length === 0) {
          setAvailableSlots([]);
          return;
        }

        // Booked sessions that day (excluding this one)
        const [bookedRes, rescheduledRes] = await Promise.all([
          (supabase as any)
            .from("class_sessions")
            .select("scheduled_at, ends_at")
            .eq("teacher_id", session.teacher_id)
            .eq("status", "scheduled")
            .gte("scheduled_at", `${dateStr}T00:00:00-03:00`)
            .lte("scheduled_at", `${dateStr}T23:59:59-03:00`)
            .neq("id", session.id),
          (supabase as any)
            .from("class_sessions")
            .select("rescheduled_at, rescheduled_ends_at")
            .eq("teacher_id", session.teacher_id)
            .eq("status", "rescheduled")
            .gte("rescheduled_at", `${dateStr}T00:00:00-03:00`)
            .lte("rescheduled_at", `${dateStr}T23:59:59-03:00`),
        ]);

        type Range = { startM: number; endM: number };
        const toMinutes = (iso: string) => {
          const d = new Date(iso);
          const h = (d.getUTCHours() - 3 + 24) % 24;
          return h * 60 + d.getUTCMinutes();
        };

        const bookedRanges: Range[] = [
          ...((bookedRes.data || []) as any[]).map((s: any) => ({
            startM: toMinutes(s.scheduled_at),
            endM: toMinutes(s.ends_at),
          })),
          ...((rescheduledRes.data || []) as any[])
            .filter((s: any) => s.rescheduled_at)
            .map((s: any) => ({
              startM: toMinutes(s.rescheduled_at),
              endM: toMinutes(s.rescheduled_ends_at),
            })),
        ];

        const origDuration = Math.round(
          (new Date(session.scheduled_ends_at).getTime() - new Date(session.scheduled_at).getTime()) / 60000
        );

        const slots: string[] = [];
        for (const slot of avail) {
          const [sh, sm] = slot.start_time.split(":").map(Number);
          const [eh, em] = slot.end_time.split(":").map(Number);
          const startTotal = sh * 60 + sm;
          const endTotal = eh * 60 + em;

          for (let t = startTotal; t + origDuration <= endTotal; t += 30) {
            const slotEnd = t + origDuration;
            const conflict = bookedRanges.some(r => t < r.endM && slotEnd > r.startM);
            if (!conflict) {
              slots.push(
                `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`
              );
            }
          }
        }

        setAvailableSlots(slots);
      } catch {
        setAvailableSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    };

    fetchSlots();
  }, [date, session]);

  const handleConfirm = async () => {
    if (!session || !date || !selectedSlot) return;
    setSaving(true);
    const isRecurring = session.mode === "recurring";
    try {
      const [slotH, slotM] = selectedSlot.split(":").map(Number);
      const origDuration = Math.round(
        (new Date(session.scheduled_ends_at).getTime() - new Date(session.scheduled_at).getTime()) / 60000
      );
      const dateStr = format(date, "yyyy-MM-dd");
      const pad = (n: number) => String(n).padStart(2, "0");
      const newStartISO = `${dateStr}T${pad(slotH)}:${pad(slotM)}:00-03:00`;
      const endTotal = slotH * 60 + slotM + origDuration;
      const newEndISO = `${dateStr}T${pad(Math.floor(endTotal / 60))}:${pad(endTotal % 60)}:00-03:00`;

      // For a single occurrence: update ALL sessions at this time slot.
      // Matching by teacher_id + scheduled_at covers both individual classes
      // (1 row) and duo classes (2 rows — one per student) automatically.
      if (!isRecurring) {
        const matchAt = session.original_scheduled_at ?? session.scheduled_at;
        const { error: dbErr } = await (supabase as any)
          .from("class_sessions")
          .update({
            status: "rescheduled",
            rescheduled_at: newStartISO,
            rescheduled_ends_at: newEndISO,
          })
          .eq("teacher_id", session.teacher_id)
          .eq("scheduled_at", matchAt);
        if (dbErr) throw dbErr;
      }

      // Always update Google Calendar
      // google_event_id is the instance ID for 'single' or the base event ID for 'recurring'
      let { data: { session: authSess } } = await supabase.auth.getSession();
      if (!authSess?.access_token) {
        const { data: r } = await supabase.auth.refreshSession();
        authSess = r.session;
      }

      await supabase.functions.invoke("google-calendar", {
        headers: { Authorization: `Bearer ${authSess?.access_token}` },
        body: {
          action: "update_event",
          payload: {
            google_event_id: session.google_event_id,
            start_datetime: newStartISO,
            end_datetime: newEndISO,
            teacher_id: session.teacher_id,
          },
        },
      });

      toast({
        title: isRecurring ? "Horário alterado!" : "Aula remarcada!",
        description: isRecurring
          ? `Esta e as próximas aulas passarão a ser ${format(date, "EEEE", { locale: ptBR })} às ${selectedSlot}`
          : `Nova data: ${format(date, "d 'de' MMMM", { locale: ptBR })} às ${selectedSlot}`,
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro ao remarcar", description: err.message ?? "Tente novamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!session) return null;

  const isRecurring = session.mode === "recurring";
  const originalDate = new Date(session.scheduled_at);
  const today = new Date();
  const fromDate = new Date(Math.max(today.setHours(0, 0, 0, 0), Date.now()));
  const toDate = addMonths(new Date(), isRecurring ? 6 : 3);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-2">
            {isRecurring
              ? <CalendarClock className="h-5 w-5 text-primary shrink-0" />
              : <RefreshCw className="h-5 w-5 text-primary shrink-0" />
            }
            <SheetTitle>{isRecurring ? "Alterar horário das aulas" : "Remarcar esta aula"}</SheetTitle>
          </div>
        </SheetHeader>

        <div className="space-y-5">
          {/* Context banner */}
          <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${isRecurring ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300" : "bg-muted text-muted-foreground"}`}>
            <CalendarDays className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              {isRecurring ? (
                <>
                  <p className="font-medium">Esta e todas as próximas aulas serão alteradas.</p>
                  <p className="font-light text-xs opacity-80">
                    Original: {format(originalDate, "EEEE 'às' HH:mm", { locale: ptBR })}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">Apenas esta aula será remarcada.</p>
                  <p className="font-light text-xs opacity-80">
                    Original: {format(originalDate, "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Date picker */}
          <div>
            <p className="text-sm font-bold mb-3">Escolha a nova data</p>
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              locale={ptBR}
              fromDate={fromDate}
              toDate={toDate}
              className="rounded-lg border mx-auto w-fit"
            />
          </div>

          {/* Time slots */}
          {date && (
            <div>
              <p className="text-sm font-bold mb-3 flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                Horário disponível
              </p>
              {loadingSlots && (
                <div className="animate-pulse h-10 bg-muted rounded-lg" />
              )}
              {!loadingSlots && availableSlots !== null && availableSlots.length === 0 && (
                <p className="text-sm text-muted-foreground font-light text-center py-4">
                  Nenhum horário disponível neste dia.
                </p>
              )}
              {!loadingSlots && availableSlots && availableSlots.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {availableSlots.map(slot => (
                    <button
                      key={slot}
                      onClick={() => setSelectedSlot(slot)}
                      className={`py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                        selectedSlot === slot
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border hover:border-primary/40 hover:bg-muted"
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <SheetFooter className="pt-6">
          <Button
            className="w-full"
            disabled={!date || !selectedSlot || saving}
            onClick={handleConfirm}
          >
            {saving
            ? (isRecurring ? "Alterando..." : "Remarcando...")
            : (isRecurring ? "Confirmar alteração de horário" : "Confirmar remarcação")
          }
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default RescheduleSheet;
