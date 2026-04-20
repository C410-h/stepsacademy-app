import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Copy } from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface AvailRow {
  id: string;
  teacher_id: string;
  day_of_week: number;
  start_time: string; // "HH:MM:SS"
  end_time: string;
  language_id: string | null;
  active: boolean;
}

interface Language {
  id: string;
  name: string;
}

interface ModalState {
  open: boolean;
  day: number;
  startTime: string; // "HH:MM"
  existing: AvailRow | null;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const GRID_SLOTS: string[] = [];
for (let h = 6; h <= 22; h++) {
  GRID_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  if (h < 22) GRID_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

const END_OFFSETS = [
  { label: "30 min", value: "30" },
  { label: "1 hora", value: "60" },
  { label: "1h30", value: "90" },
  { label: "2 horas", value: "120" },
];

// ── Utilitários ───────────────────────────────────────────────────────────────

const addMinutes = (time: string, minutes: number): string => {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

// ── Componente ────────────────────────────────────────────────────────────────

const TeacherAvailabilityTab = () => {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [availability, setAvailability] = useState<AvailRow[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(() => new Date().getDay());

  const [modal, setModal] = useState<ModalState>({
    open: false, day: 0, startTime: "08:00", existing: null,
  });
  const [modalLangId, setModalLangId] = useState<string>("__any__");
  const [modalEndOffset, setModalEndOffset] = useState("60");
  const [saving, setSaving] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAvailability = async () => {
    if (!profile) return;
    const { data } = await (supabase as any)
      .from("teacher_availability")
      .select("*")
      .eq("teacher_id", profile.id)
      .order("day_of_week")
      .order("start_time");
    setAvailability(data || []);
  };

  useEffect(() => {
    if (!profile) return;
    (async () => {
      setLoading(true);
      await fetchAvailability();

      // Carregar apenas idiomas que a professora ensina
      const { data: teacherLangRows } = await (supabase as any)
        .from("teacher_languages")
        .select("language_id")
        .eq("teacher_id", profile.id);
      const langIds = (teacherLangRows || []).map((r: any) => r.language_id);
      if (langIds.length > 0) {
        const { data: langs } = await (supabase as any)
          .from("languages")
          .select("id, name")
          .in("id", langIds)
          .order("name");
        setLanguages((langs as Language[]) || []);
      }

      setLoading(false);
    })();
  }, [profile]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const findSlot = (day: number, time: string): AvailRow | undefined =>
    availability.find((a) => a.day_of_week === day && a.start_time.startsWith(time));

  const openModal = (day: number, startTime: string) => {
    const existing = findSlot(day, startTime) || null;
    setModal({ open: true, day, startTime, existing });

    // Idioma: usa o do slot existente → ou auto-seleciona se teacher só tem 1
    if (existing?.language_id) {
      setModalLangId(existing.language_id);
    } else if (languages.length === 1) {
      setModalLangId(languages[0].id);
    } else {
      setModalLangId("__any__");
    }

    // Duração: pre-preenche a partir do slot existente
    if (existing) {
      const [sh, sm] = existing.start_time.split(":").map(Number);
      const [eh, em] = existing.end_time.split(":").map(Number);
      const duration = (eh * 60 + em) - (sh * 60 + sm);
      const match = END_OFFSETS.find(o => parseInt(o.value) === duration);
      setModalEndOffset(match ? match.value : "60");
    } else {
      setModalEndOffset("60");
    }
  };

  const closeModal = () => setModal((m) => ({ ...m, open: false }));

  // ── Salvar ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    const endTime = addMinutes(modal.startTime, parseInt(modalEndOffset));
    const { error } = await (supabase as any)
      .from("teacher_availability")
      .upsert(
        {
          ...(modal.existing ? { id: modal.existing.id } : {}),
          teacher_id: profile.id,
          day_of_week: modal.day,
          start_time: `${modal.startTime}:00`,
          end_time: `${endTime}:00`,
          language_id: modalLangId === "__any__" ? null : modalLangId,
          active: true,
        },
        { onConflict: "teacher_id,day_of_week,start_time" }
      );
    if (error) {
      toast({ title: "Erro ao salvar horário.", variant: "destructive" });
    } else {
      toast({ title: "Horário salvo!" });
      await fetchAvailability();
      closeModal();
    }
    setSaving(false);
  };

  // ── Remover ────────────────────────────────────────────────────────────────

  const handleRemove = async () => {
    if (!profile || !modal.existing) return;
    setSaving(true);
    await (supabase as any)
      .from("teacher_availability")
      .delete()
      .eq("id", modal.existing.id);
    toast({ title: "Horário removido!" });
    setAvailability((prev) => prev.filter((a) => a.id !== modal.existing!.id));
    closeModal();
    setSaving(false);
  };

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        {/* Mobile skeleton */}
        <div className="lg:hidden space-y-2">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-5 w-10 shrink-0" />
              <Skeleton className="h-9 flex-1" />
            </div>
          ))}
        </div>
        {/* Desktop skeleton */}
        <div className="hidden lg:block space-y-0.5">
          <div className="grid grid-cols-[56px,repeat(7,1fr)] gap-1 mb-1">
            <div />
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-5" />
            ))}
          </div>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[56px,repeat(7,1fr)] gap-1">
              <Skeleton className="h-7" />
              {Array.from({ length: 7 }).map((_, j) => (
                <Skeleton key={j} className="h-7" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Disponibilidade</h2>
        <p className="text-sm text-muted-foreground font-light mt-1">
          Configure os horários em que você está disponível para aulas.
        </p>
      </div>

      {/* ── Mobile: select de dia + coluna única ── */}
      <div className="lg:hidden space-y-3">
        <Select
          value={String(selectedDay)}
          onValueChange={(v) => setSelectedDay(Number(v))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAY_LABELS.map((label, i) => (
              <SelectItem key={i} value={String(i)}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="space-y-0.5">
          {GRID_SLOTS.map((time) => {
            const slot = findSlot(selectedDay, time);
            const lang = slot?.language_id
              ? languages.find((l) => l.id === slot.language_id)
              : null;
            const isHour = time.endsWith(":00");

            return (
              <div key={time} className="flex items-center gap-2">
                <span
                  className={`w-12 text-right text-xs shrink-0 ${
                    isHour
                      ? "font-medium text-foreground"
                      : "text-muted-foreground/40"
                  }`}
                >
                  {isHour ? time : ""}
                </span>
                <div className="flex-1">
                  {slot && slot.active ? (
                    <button
                      onClick={() => openModal(selectedDay, time)}
                      className="w-full h-9 rounded border text-sm font-medium px-3 text-left transition-opacity hover:opacity-70"
                      style={{
                        backgroundColor:
                          "color-mix(in srgb, var(--theme-accent) 25%, transparent)",
                        borderColor: "var(--theme-accent)",
                      }}
                    >
                      {time} — {lang?.name || "Qualquer idioma"}
                    </button>
                  ) : slot && !slot.active ? (
                    <button
                      onClick={() => openModal(selectedDay, time)}
                      className="w-full h-9 rounded border border-border bg-muted text-sm text-muted-foreground line-through px-3 text-left"
                    >
                      {time}
                    </button>
                  ) : (
                    <button
                      onClick={() => openModal(selectedDay, time)}
                      className="w-full h-9 rounded border border-dashed border-border/50 hover:border-primary/40 hover:bg-muted/50 transition-colors"
                      aria-label={`Adicionar ${DAY_LABELS[selectedDay]} ${time}`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Desktop: grade completa 7 colunas ── */}
      <div className="hidden lg:block overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Cabeçalho dos dias */}
          <div className="grid grid-cols-[56px,repeat(7,1fr)] gap-1 mb-1">
            <div />
            {DAY_LABELS.map((label) => (
              <div
                key={label}
                className="text-center text-xs font-bold uppercase tracking-wide text-muted-foreground py-1 border-b"
              >
                {label}
              </div>
            ))}
          </div>

          {/* Linhas de slots */}
          <div className="space-y-0.5">
            {GRID_SLOTS.map((time) => {
              const isHour = time.endsWith(":00");
              return (
                <div
                  key={time}
                  className="grid grid-cols-[56px,repeat(7,1fr)] gap-1 items-center"
                >
                  {/* Etiqueta de hora */}
                  <span
                    className={`text-right pr-2 text-[10px] leading-none select-none ${
                      isHour
                        ? "font-medium text-foreground"
                        : "text-muted-foreground/30"
                    }`}
                  >
                    {isHour ? time : "·"}
                  </span>

                  {/* 7 slots (um por dia) */}
                  {Array.from({ length: 7 }).map((_, day) => {
                    const slot = findSlot(day, time);
                    const lang = slot?.language_id
                      ? languages.find((l) => l.id === slot.language_id)
                      : null;

                    if (slot && slot.active) {
                      return (
                        <button
                          key={day}
                          onClick={() => openModal(day, time)}
                          className="w-full h-7 rounded border text-[9px] font-medium truncate px-1 transition-opacity hover:opacity-70"
                          style={{
                            backgroundColor:
                              "color-mix(in srgb, var(--theme-accent) 25%, transparent)",
                            borderColor: "var(--theme-accent)",
                          }}
                          title={lang?.name || "Qualquer idioma"}
                        >
                          {lang?.name?.slice(0, 7) || "✓"}
                        </button>
                      );
                    }

                    if (slot && !slot.active) {
                      return (
                        <button
                          key={day}
                          onClick={() => openModal(day, time)}
                          className="w-full h-7 rounded border border-border bg-muted text-[9px] text-muted-foreground line-through px-1"
                        >
                          off
                        </button>
                      );
                    }

                    return (
                      <button
                        key={day}
                        onClick={() => openModal(day, time)}
                        className="w-full h-7 rounded border border-dashed border-border/40 hover:border-primary/40 hover:bg-muted/50 transition-colors"
                        aria-label={`Adicionar ${DAY_LABELS[day]} ${time}`}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Botão copiar semana */}
      <div className="pt-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-2 w-full sm:w-auto"
          onClick={() =>
            toast({
              title: "Em breve!",
              description: "Funcionalidade em desenvolvimento.",
            })
          }
        >
          <Copy className="h-4 w-4" />
          Copiar configuração para próximas semanas
        </Button>
      </div>

      {/* ── Modal adicionar/editar ── */}
      <Dialog open={modal.open} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {modal.existing ? "Editar horário" : "Adicionar horário"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dia</Label>
                <Input value={DAY_LABELS[modal.day]} disabled className="bg-muted" />
              </div>
              <div className="space-y-1.5">
                <Label>Início</Label>
                <Input value={modal.startTime} disabled className="bg-muted" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Duração</Label>
                <Select value={modalEndOffset} onValueChange={setModalEndOffset}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {END_OFFSETS.map(({ label, value }) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fim</Label>
                <Input
                  value={addMinutes(modal.startTime, parseInt(modalEndOffset))}
                  disabled
                  className="bg-muted"
                />
              </div>
            </div>

            {languages.length === 1 ? (
              <div className="space-y-1.5">
                <Label>Idioma</Label>
                <Input value={languages[0].name} disabled className="bg-muted" />
                <p className="text-[11px] text-muted-foreground font-light">
                  Detectado automaticamente
                </p>
              </div>
            ) : languages.length > 1 ? (
              <div className="space-y-1.5">
                <Label>Idioma</Label>
                <Select value={modalLangId} onValueChange={setModalLangId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Qualquer idioma</SelectItem>
                    {languages.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? "Salvando..." : "Confirmar horário"}
            </Button>
            {modal.existing && (
              <Button
                variant="destructive"
                onClick={handleRemove}
                disabled={saving}
                className="w-full"
              >
                Remover horário
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeacherAvailabilityTab;
