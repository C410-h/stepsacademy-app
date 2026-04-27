import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, Check, X, Loader2, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface AvailRow {
  id: string;
  day_of_week: number;
  start_time: string; // "HH:MM:SS"
  end_time: string;
  language_id: string | null;
  active: boolean;
}

interface EditState {
  start: string;   // "HH:MM"
  end: string;
  saving: boolean;
}

interface NewRow {
  tempId: string;
  start: string;
  end: string;
  saving: boolean;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const DAY_SHORT  = ["Dom.", "Seg.", "Ter.", "Qua.", "Qui.", "Sex.", "Sáb."];
const DAY_LABELS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

let _tempId = 0;
const makeTempId = () => `new_${++_tempId}`;

// "HH:MM:SS" → "HH:MM"
const hhmm = (s: string) => s.slice(0, 5);

// "HH:MM" + minutos → "HH:MM"
const addMinutes = (time: string, mins: number) => {
  const [h, m] = time.split(":").map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

// ── Subcomponente: input de hora ───────────────────────────────────────────────

const TimeInput = ({
  value, onChange, disabled,
}: { value: string; onChange: (v: string) => void; disabled?: boolean }) => (
  <input
    type="time"
    value={value}
    onChange={e => onChange(e.target.value)}
    disabled={disabled}
    className={cn(
      "rounded-md border border-input bg-background px-3 py-1.5 text-sm tabular-nums w-[118px]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50"
    )}
  />
);

// ── Componente principal ───────────────────────────────────────────────────────

const TeacherAvailabilityTab = () => {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [availability, setAvailability] = useState<AvailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [teacherLangId, setTeacherLangId] = useState<string | null>(null);

  // Edições em andamento: rowId → EditState
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  // Novas linhas ainda não salvas: day → NewRow[]
  const [newRows, setNewRows] = useState<Record<number, NewRow[]>>({});
  // Linhas em processo de exclusão
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  // Copiando dia X para outros
  const [copyingDay, setCopyingDay] = useState<number | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAvailability = useCallback(async () => {
    if (!profile) return;
    const { data } = await (supabase as any)
      .from("teacher_availability")
      .select("id, day_of_week, start_time, end_time, language_id, active")
      .eq("teacher_id", profile.id)
      .order("day_of_week")
      .order("start_time");
    setAvailability(data || []);
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      setLoading(true);
      await fetchAvailability();
      // Idioma principal do professor (para novos slots)
      const { data: tl } = await (supabase as any)
        .from("teacher_languages")
        .select("language_id")
        .eq("teacher_id", profile.id)
        .limit(1)
        .maybeSingle();
      setTeacherLangId(tl?.language_id ?? null);
      setLoading(false);
    })();
  }, [profile]);

  // ── Edição de linhas existentes ────────────────────────────────────────────

  const startEdit = (row: AvailRow) => {
    if (edits[row.id]) return;
    setEdits(prev => ({
      ...prev,
      [row.id]: { start: hhmm(row.start_time), end: hhmm(row.end_time), saving: false },
    }));
  };

  const patchEdit = (id: string, patch: Partial<EditState>) =>
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const cancelEdit = (id: string) =>
    setEdits(prev => { const { [id]: _, ...rest } = prev; return rest; });

  const saveEdit = async (row: AvailRow) => {
    const e = edits[row.id];
    if (!e || e.saving) return;
    patchEdit(row.id, { saving: true });
    const { error } = await (supabase as any)
      .from("teacher_availability")
      .update({ start_time: `${e.start}:00`, end_time: `${e.end}:00` })
      .eq("id", row.id);
    if (error) {
      toast({ title: "Erro ao salvar horário.", variant: "destructive" });
      patchEdit(row.id, { saving: false });
    } else {
      toast({ title: "Horário salvo!" });
      cancelEdit(row.id);
      await fetchAvailability();
    }
  };

  // ── Excluir linha ─────────────────────────────────────────────────────────

  const deleteRow = async (row: AvailRow) => {
    setDeleting(prev => new Set(prev).add(row.id));
    const { error } = await (supabase as any)
      .from("teacher_availability")
      .delete()
      .eq("id", row.id);
    if (error) {
      toast({ title: "Erro ao remover.", variant: "destructive" });
    } else {
      setAvailability(prev => prev.filter(r => r.id !== row.id));
      toast({ title: "Horário removido." });
    }
    setDeleting(prev => { const s = new Set(prev); s.delete(row.id); return s; });
  };

  // ── Novas linhas — insert imediato no DB para evitar perda de dados ──────

  const addNewRow = async (day: number) => {
    if (!profile) return;
    const existing = availability.filter(r => r.day_of_week === day);
    // Sugerir início após o último intervalo do dia
    const lastEnd = [...existing.map(r => hhmm(r.end_time))].sort().at(-1) ?? "09:00";
    const start = lastEnd;
    const end   = addMinutes(start, 60);

    const { error } = await (supabase as any)
      .from("teacher_availability")
      .insert({
        teacher_id: profile.id,
        day_of_week: day,
        start_time: `${start}:00`,
        end_time: `${end}:00`,
        language_id: teacherLangId,
        active: true,
      });
    if (error) {
      toast({ title: "Erro ao adicionar horário.", description: error.message, variant: "destructive" });
      return;
    }
    await fetchAvailability();
  };

  const patchNewRow = (day: number, tempId: string, patch: Partial<NewRow>) =>
    setNewRows(prev => ({
      ...prev,
      [day]: (prev[day] ?? []).map(r => r.tempId === tempId ? { ...r, ...patch } : r),
    }));

  const removeNewRow = (day: number, tempId: string) =>
    setNewRows(prev => ({
      ...prev,
      [day]: (prev[day] ?? []).filter(r => r.tempId !== tempId),
    }));

  const saveNewRow = async (day: number, nr: NewRow) => {
    if (!profile || nr.saving) return;
    patchNewRow(day, nr.tempId, { saving: true });
    const { error } = await (supabase as any)
      .from("teacher_availability")
      .insert({
        teacher_id: profile.id,
        day_of_week: day,
        start_time: `${nr.start}:00`,
        end_time: `${nr.end}:00`,
        language_id: teacherLangId,
        active: true,
      });
    if (error) {
      toast({ title: "Erro ao adicionar horário.", variant: "destructive" });
      patchNewRow(day, nr.tempId, { saving: false });
    } else {
      toast({ title: "Horário adicionado!" });
      removeNewRow(day, nr.tempId);
      await fetchAvailability();
    }
  };

  // ── Copiar dia para outros dias ────────────────────────────────────────────

  const copyDayToAll = async (sourceDay: number) => {
    if (!profile) return;
    const source = availability.filter(r => r.day_of_week === sourceDay);
    if (source.length === 0) return;
    setCopyingDay(sourceDay);
    // Aplica para todos os outros dias da semana (1-6, seg-sáb)
    const targets = [0, 1, 2, 3, 4, 5, 6].filter(d => d !== sourceDay);
    for (const day of targets) {
      // Remove horários existentes do dia alvo
      const existing = availability.filter(r => r.day_of_week === day);
      if (existing.length > 0) {
        await (supabase as any)
          .from("teacher_availability")
          .delete()
          .in("id", existing.map(r => r.id));
      }
      // Insere cópias dos horários do dia fonte
      await (supabase as any)
        .from("teacher_availability")
        .insert(
          source.map(r => ({
            teacher_id: profile.id,
            day_of_week: day,
            start_time: r.start_time,
            end_time: r.end_time,
            language_id: r.language_id,
            active: true,
          }))
        );
    }
    await fetchAvailability();
    setCopyingDay(null);
    toast({ title: "Horários copiados para toda a semana!" });
  };

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-7 w-48 mb-4" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3 border-b">
            <Skeleton className="h-4 w-10 shrink-0" />
            <Skeleton className="h-9 w-48" />
          </div>
        ))}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-0">
      <div className="mb-5">
        <h2 className="text-2xl font-bold">Disponibilidade</h2>
        <p className="text-sm text-muted-foreground font-light mt-1">
          Defina os intervalos de horário disponíveis para cada dia da semana.
        </p>
      </div>

      {Array.from({ length: 7 }, (_, day) => {
        const dayRows  = availability.filter(r => r.day_of_week === day);
        const dayNew   = newRows[day] ?? [];
        const hasAny   = dayRows.length > 0 || dayNew.length > 0;
        const isCopying = copyingDay === day;

        return (
          <div
            key={day}
            className="flex gap-3 py-3.5 border-b last:border-0 items-start"
          >
            {/* Rótulo do dia */}
            <span
              className="text-sm font-semibold text-muted-foreground w-11 shrink-0 pt-2"
              title={DAY_LABELS[day]}
            >
              {DAY_SHORT[day]}
            </span>

            {/* Conteúdo do dia */}
            <div className="flex-1 min-w-0 space-y-2">

              {/* Estado vazio */}
              {!hasAny && (
                <span className="text-sm text-muted-foreground font-light block pt-1.5">
                  Indisponível
                </span>
              )}

              {/* Linhas existentes */}
              {dayRows.map(row => {
                const e          = edits[row.id];
                const isDirty    = !!e;
                const start      = e?.start ?? hhmm(row.start_time);
                const end        = e?.end   ?? hhmm(row.end_time);
                const isSaving   = e?.saving ?? false;
                const isDeleting = deleting.has(row.id);
                const busy       = isSaving || isDeleting;

                return (
                  <div
                    key={row.id}
                    className="flex items-center gap-2 flex-wrap"
                    onBlur={(ev) => {
                      // Auto-save when focus leaves the row entirely AND there are unsaved edits
                      if (!ev.currentTarget.contains(ev.relatedTarget as Node) && edits[row.id] && !edits[row.id].saving) {
                        saveEdit(row);
                      }
                    }}
                  >
                    <TimeInput
                      value={start}
                      onChange={v => { startEdit(row); patchEdit(row.id, { start: v }); }}
                      disabled={busy}
                    />
                    <span className="text-muted-foreground text-sm select-none">—</span>
                    <TimeInput
                      value={end}
                      onChange={v => { startEdit(row); patchEdit(row.id, { end: v }); }}
                      disabled={busy}
                    />

                    {/* Confirmar/cancelar edição */}
                    {isDirty && (
                      <>
                        <Button
                          size="icon" variant="ghost"
                          className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20"
                          onClick={() => saveEdit(row)}
                          disabled={isSaving}
                          title="Salvar"
                        >
                          {isSaving
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Check className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          size="icon" variant="ghost"
                          className="h-8 w-8 text-muted-foreground"
                          onClick={() => cancelEdit(row.id)}
                          disabled={isSaving}
                          title="Cancelar"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}

                    {/* Excluir */}
                    {!isDirty && (
                      <Button
                        size="icon" variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteRow(row)}
                        disabled={busy}
                        title="Remover intervalo"
                      >
                        {isDeleting
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                  </div>
                );
              })}

              {/* Novas linhas pendentes */}
              {dayNew.map(nr => (
                <div key={nr.tempId} className="flex items-center gap-2 flex-wrap">
                  <TimeInput
                    value={nr.start}
                    onChange={v => patchNewRow(day, nr.tempId, { start: v })}
                    disabled={nr.saving}
                  />
                  <span className="text-muted-foreground text-sm select-none">—</span>
                  <TimeInput
                    value={nr.end}
                    onChange={v => patchNewRow(day, nr.tempId, { end: v })}
                    disabled={nr.saving}
                  />
                  <Button
                    size="icon" variant="ghost"
                    className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20"
                    onClick={() => saveNewRow(day, nr)}
                    disabled={nr.saving}
                    title="Confirmar"
                  >
                    {nr.saving
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Check className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="icon" variant="ghost"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => removeNewRow(day, nr.tempId)}
                    disabled={nr.saving}
                    title="Cancelar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}

              {/* Ações do dia */}
              <div className="flex items-center gap-3 pt-0.5">
                {/* Adicionar intervalo */}
                <button
                  onClick={() => addNewRow(day)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar horário
                </button>

                {/* Copiar para todos os dias */}
                {dayRows.length > 0 && (
                  <button
                    onClick={() => copyDayToAll(day)}
                    disabled={isCopying || copyingDay !== null}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                    title={`Copiar horários de ${DAY_LABELS[day]} para todos os dias`}
                  >
                    {isCopying
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Copy className="h-3.5 w-3.5" />}
                    Copiar para toda a semana
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TeacherAvailabilityTab;
