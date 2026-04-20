import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { signInWithGoogle } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  CalendarIcon, Search, X, Loader2, Copy, Check,
  ExternalLink, CalendarDays,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface ScheduleStudent {
  studentId: string;
  userId: string;
  name: string;
  languageName: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: ScheduleStudent[];
  teacherProfileId?: string;
  preSelectedStudent?: ScheduleStudent;
}

// ── Constantes ─────────────────────────────────────────────────────────────────

const TIME_SLOTS: string[] = [];
for (let h = 6; h <= 22; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  if (h < 22) TIME_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

const DURATIONS = [
  { label: "30 min", minutes: 30 },
  { label: "1 hora", minutes: 60 },
  { label: "1h30", minutes: 90 },
  { label: "2 horas", minutes: 120 },
];

// ── Utilitários ────────────────────────────────────────────────────────────────

const initials = (name: string) =>
  name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

const addMinutes = (time: string, minutes: number): string => {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const toISOBR = (date: Date, time: string): string => {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}T${time}:00-03:00`;
};

// ── Componente ─────────────────────────────────────────────────────────────────

const ScheduleClassSheet = ({ open, onOpenChange, students, teacherProfileId, preSelectedStudent }: Props) => {
  // Busca
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredStudents, setFilteredStudents] = useState<ScheduleStudent[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<ScheduleStudent | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Campos do formulário
  const [idioma, setIdioma] = useState("");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState<number | null>(null);

  // Estado de envio
  const [submitting, setSubmitting] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);

  // Horários disponíveis filtrados pela grade do professor
  const [availableSlots, setAvailableSlots] = useState<string[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Feriados nacionais (desabilitados no calendário)
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set());

  // Resultado de sucesso
  const [meetLink, setMeetLink] = useState<string | null>(null);
  const [meetCopied, setMeetCopied] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pré-selecionar aluno ao abrir (quando chamado com aluno específico)
  useEffect(() => {
    if (open && preSelectedStudent) {
      setSelectedStudent(preSelectedStudent);
    }
  }, [open, preSelectedStudent]);

  // Carregar feriados ao abrir (próximos 3 meses)
  useEffect(() => {
    if (!open) return;
    const start = format(new Date(), "yyyy-MM-dd");
    const end = format(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
    (supabase as any)
      .from("national_holidays")
      .select("date")
      .gte("date", start)
      .lte("date", end)
      .then(({ data }: { data: any[] | null }) => {
        setHolidayDates(new Set((data || []).map((h: any) => h.date)));
      });
  }, [open]);

  // Limpar ao fechar
  useEffect(() => {
    if (!open) {
      setSearchTerm("");
      setFilteredStudents([]);
      setDropdownOpen(false);
      setSelectedStudent(null);
      setIdioma("");
      setDate(undefined);
      setStartTime("");
      setDuration(null);
      setSubmitting(false);
      setShowConnect(false);
      setMeetLink(null);
      setMeetCopied(false);
      setAvailableSlots(null);
      setLoadingSlots(false);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    }
  }, [open]);

  // Busca horários disponíveis ao selecionar data (quando grade do professor está configurada)
  useEffect(() => {
    if (!date || !teacherProfileId) {
      setAvailableSlots(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoadingSlots(true);
      setStartTime("");

      const dayOfWeek = date.getDay();
      const dateStr = format(date, "yyyy-MM-dd");

      const [{ data: avail }, { data: sessions }] = await Promise.all([
        (supabase as any)
          .from("teacher_availability")
          .select("start_time")
          .eq("teacher_id", teacherProfileId)
          .eq("day_of_week", dayOfWeek)
          .eq("active", true),
        (supabase as any)
          .from("class_sessions")
          .select("scheduled_at")
          .eq("teacher_id", teacherProfileId)
          .eq("status", "scheduled")
          .gte("scheduled_at", `${dateStr}T00:00:00-03:00`)
          .lte("scheduled_at", `${dateStr}T23:59:59-03:00`),
      ]);

      if (cancelled) return;

      // Converter timestamps UTC de class_sessions para horário BR (UTC-3)
      const bookedTimes = new Set<string>(
        (sessions || []).map((s: any) => {
          const d = new Date(s.scheduled_at);
          const brH = (d.getUTCHours() - 3 + 24) % 24;
          const brM = d.getUTCMinutes();
          return `${String(brH).padStart(2, "0")}:${String(brM).padStart(2, "0")}`;
        })
      );

      const freeSlots: string[] = (avail || [])
        .map((a: any) => a.start_time.substring(0, 5))
        .filter((t: string) => !bookedTimes.has(t))
        .sort();

      setAvailableSlots(freeSlots);
      setLoadingSlots(false);
    })();

    return () => { cancelled = true; };
  }, [date, teacherProfileId]);

  // Debounce de busca (300ms) — filtragem local sobre alunos já carregados
  useEffect(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      setFilteredStudents([]);
      setDropdownOpen(false);
      return;
    }
    const timer = setTimeout(() => {
      const results = students.filter((s) =>
        s.name.toLowerCase().includes(term)
      );
      setFilteredStudents(results);
      setDropdownOpen(results.length > 0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, students]);

  // Auto-preencher idioma ao selecionar aluno
  useEffect(() => {
    if (selectedStudent) {
      setIdioma(selectedStudent.languageName || "");
    }
  }, [selectedStudent]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectStudent = (student: ScheduleStudent) => {
    setSelectedStudent(student);
    setSearchTerm("");
    setDropdownOpen(false);
  };

  const clearStudent = () => {
    setSelectedStudent(null);
    setIdioma("");
  };

  const copyMeetLink = () => {
    if (!meetLink) return;
    navigator.clipboard.writeText(meetLink).then(() => {
      setMeetCopied(true);
      setTimeout(() => setMeetCopied(false), 2500);
    });
  };

  const handleConnectGoogle = async () => {
    setConnectingGoogle(true);
    try {
      await signInWithGoogle();
    } catch {
      toast({
        title: "Erro ao iniciar conexão com Google",
        variant: "destructive",
      });
      setConnectingGoogle(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedStudent || !date || !startTime || !duration) {
      toast({
        title: "Preencha todos os campos antes de agendar.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    setShowConnect(false);

    try {
      const endTime = addMinutes(startTime, duration);

      // Garante token fresco antes de chamar a Edge Function.
      // Se o access_token estiver expirado, refreshSession() o renova.
      // Passamos o token explicitamente para evitar que o cliente use
      // um token vencido em memória após redirecionamentos OAuth.
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      let accessToken = session?.access_token;

      if (!accessToken || sessionError) {
        // Tenta renovar
        const { data: refreshed } = await supabase.auth.refreshSession();
        accessToken = refreshed.session?.access_token;
      }

      if (!accessToken) {
        toast({
          title: "Sessão expirada",
          description: "Faça login novamente para continuar.",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke("google-calendar", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          action: "create_class_event",
          payload: {
            student_user_id: selectedStudent.userId,
            student_name: selectedStudent.name,
            start_datetime: toISOBR(date, startTime),
            end_datetime: toISOBR(date, endTime),
            language: idioma || selectedStudent.languageName,
          },
        },
      });

      const errMsg: string = data?.error ?? error?.message ?? "";

      if (errMsg) {
        if (errMsg.includes("Google Calendar não conectado")) {
          toast({
            title: "Faça login com Google para agendar aulas",
            variant: "destructive",
          });
          setShowConnect(true);
        } else {
          toast({
            title: "Erro ao agendar aula",
            description: errMsg,
            variant: "destructive",
          });
        }
        return;
      }

      // Persiste a sessão no banco para métricas e agenda
      if (teacherProfileId && selectedStudent) {
        await (supabase as any).from("class_sessions").insert({
          teacher_id: teacherProfileId,
          student_id: selectedStudent.studentId,
          scheduled_at: toISOBR(date, startTime),
          ends_at: toISOBR(date, addMinutes(startTime, duration)),
          google_event_id: data?.event_id ?? null,
          meet_link: data?.meet_link ?? null,
          status: "scheduled",
        });
      }

      toast({ title: "Aula agendada! Link do Meet criado." });
      setMeetLink(data?.meet_link ?? null);

      closeTimerRef.current = setTimeout(() => {
        onOpenChange(false);
      }, 3000);
    } catch (err: any) {
      toast({
        title: "Erro ao agendar aula",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-y-auto flex flex-col"
        style={{ fontFamily: "'Libre Franklin', sans-serif" }}
      >
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Agendar aula
          </SheetTitle>
        </SheetHeader>

        {/* ── Sucesso ─────────────────────────────────────────────────── */}
        {meetLink ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 py-8 text-center px-2">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="font-bold text-lg">Aula agendada!</p>
              <p className="text-sm text-muted-foreground font-light">
                O aluno receberá o convite por e-mail.
              </p>
            </div>

            <div className="w-full space-y-2 rounded-xl border bg-muted/30 p-4">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                Link do Google Meet
              </p>
              <a
                href={meetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-primary hover:underline font-medium break-all"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                {meetLink}
              </a>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={copyMeetLink}
              >
                {meetCopied ? (
                  <><Check className="h-4 w-4 text-green-600" /> Copiado!</>
                ) : (
                  <><Copy className="h-4 w-4" /> Copiar link</>
                )}
              </Button>
            </div>

            <Button
              variant="ghost"
              className="w-full text-sm text-muted-foreground"
              onClick={() => onOpenChange(false)}
            >
              Fechar
            </Button>
            <p className="text-xs text-muted-foreground font-light">
              Fechando automaticamente…
            </p>
          </div>
        ) : (

        /* ── Formulário ─────────────────────────────────────────────── */
        <div className="flex-1 flex flex-col gap-5 py-2">

          {/* Busca de aluno */}
          <div className="space-y-2">
            <Label>Aluno</Label>

            {selectedStudent ? (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-muted/30">
                <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">
                    {initials(selectedStudent.name)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{selectedStudent.name}</p>
                  <p className="text-xs text-muted-foreground font-light">
                    {selectedStudent.languageName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearStudent}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Remover aluno"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div ref={searchRef} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Buscar aluno pelo nome…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                  autoComplete="off"
                />
                {dropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-md overflow-hidden">
                    {filteredStudents.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-muted-foreground font-light">
                        Nenhum aluno encontrado.
                      </p>
                    ) : (
                      <ul className="max-h-52 overflow-y-auto">
                        {filteredStudents.map((s) => (
                          <li key={s.studentId}>
                            <button
                              type="button"
                              onClick={() => selectStudent(s)}
                              className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-accent transition-colors text-left"
                            >
                              <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                                <span className="text-[10px] font-bold text-primary">
                                  {initials(s.name)}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{s.name}</p>
                                <p className="text-xs text-muted-foreground font-light">
                                  {s.languageName}
                                </p>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Idioma */}
          <div className="space-y-2">
            <Label>Idioma</Label>
            <Input
              value={idioma}
              onChange={(e) => setIdioma(e.target.value)}
              placeholder="Ex: Inglês"
            />
          </div>

          {/* Data */}
          <div className="space-y-2">
            <Label>Data</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal gap-2",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="h-4 w-4" />
                  {date
                    ? format(date, "PPP", { locale: ptBR })
                    : "Selecione uma data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => {
                    setDate(d);
                    setCalendarOpen(false);
                  }}
                  disabled={(d) =>
                    d < today ||
                    holidayDates.has(format(d, "yyyy-MM-dd"))
                  }
                  initialFocus
                  locale={ptBR}
                />
                {holidayDates.size > 0 && (
                  <p className="text-[11px] text-muted-foreground font-light px-3 pb-2">
                    Datas em cinza são feriados nacionais.
                  </p>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {/* Horário de início */}
          <div className="space-y-2">
            <Label>Horário de início</Label>
            {loadingSlots ? (
              <div className="h-10 rounded-md border bg-muted animate-pulse" />
            ) : teacherProfileId && date && availableSlots?.length === 0 ? (
              <p className="text-sm text-muted-foreground font-light py-2 px-3 rounded-md border border-dashed">
                Nenhum horário disponível neste dia.
              </p>
            ) : (
              <Select value={startTime} onValueChange={setStartTime}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o horário" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {(teacherProfileId && availableSlots ? availableSlots : TIME_SLOTS).map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Duração */}
          <div className="space-y-2">
            <Label>Duração</Label>
            <Select
              value={duration !== null ? String(duration) : ""}
              onValueChange={(v) => setDuration(Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a duração" />
              </SelectTrigger>
              <SelectContent>
                {DURATIONS.map((d) => (
                  <SelectItem key={d.minutes} value={String(d.minutes)}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Horário de fim calculado */}
            {startTime && duration !== null && (
              <p className="text-xs text-muted-foreground font-light">
                Término previsto: <span className="font-bold text-foreground">
                  {addMinutes(startTime, duration)}
                </span>
              </p>
            )}
          </div>

          {/* Conectar Google — exibido apenas em caso de erro de auth */}
          {showConnect && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
              <p className="text-sm font-bold text-destructive">
                Google Calendar não conectado
              </p>
              <p className="text-xs text-muted-foreground font-light">
                Faça login com sua conta Google para criar eventos e links do Meet.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={handleConnectGoogle}
                disabled={connectingGoogle}
              >
                {connectingGoogle
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : (
                    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
                      <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                      <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
                      <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18z"/>
                      <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.31z"/>
                    </svg>
                  )
                }
                {connectingGoogle ? "Redirecionando…" : "Conectar Google Calendar"}
              </Button>
            </div>
          )}

          {/* Botão confirmar */}
          <div className="mt-auto pt-2">
            <Button
              className="w-full font-bold gap-2"
              onClick={handleSubmit}
              disabled={submitting || !selectedStudent || !date || !startTime || !duration}
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Agendando…</>
                : <><CalendarDays className="h-4 w-4" /> Agendar e criar Meet</>
              }
            </Button>
          </div>
        </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default ScheduleClassSheet;
