import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StepRow {
  step_id: string;
  number: number;
  title: string | null;
  completion_status: "complete" | "partial" | "empty";
  material_count: number;
  exercise_count: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SEMAPHORE: Record<string, string> = {
  complete: "bg-lime-500",
  partial: "bg-yellow-400",
  empty: "bg-muted-foreground/30",
};

const STATUS_LABELS: Record<string, string> = {
  complete: "Completo",
  partial: "Parcial",
  empty: "Vazio",
};

// ── Component ─────────────────────────────────────────────────────────────────

const AdminContentByStepTab = () => {
  const [languages, setLanguages] = useState<{ id: string; name: string }[]>([]);
  const [levels, setLevels] = useState<{ id: string; name: string; code: string; language_id: string }[]>([]);
  const [languageId, setLanguageId] = useState<string | null>(null);
  const [levelId, setLevelId] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("languages").select("id, name").order("name"),
      supabase.from("levels").select("id, name, code, language_id").order("code"),
    ]).then(([{ data: langs }, { data: lvls }]) => {
      setLanguages(langs || []);
      setLevels(lvls || []);
    });
  }, []);

  const loadSteps = useCallback(async () => {
    if (!levelId) { setSteps([]); return; }
    setLoading(true);
    const { data } = await (supabase as any)
      .from("step_completion_status")
      .select("step_id, number, title, completion_status, material_count, exercise_count")
      .eq("level_id", levelId)
      .order("number", { ascending: true });
    setSteps(data || []);
    setLoading(false);
  }, [levelId]);

  useEffect(() => { loadSteps(); }, [loadSteps]);

  const filteredLevels = levels.filter(l => !languageId || l.language_id === languageId);
  const completedCount = steps.filter(s => s.completion_status === "complete").length;

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex gap-2">
        <Select
          value={languageId || ""}
          onValueChange={v => { setLanguageId(v || null); setLevelId(null); }}
        >
          <SelectTrigger className="flex-1 h-9 text-xs">
            <SelectValue placeholder="Idioma" />
          </SelectTrigger>
          <SelectContent>
            {languages.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select
          value={levelId || ""}
          onValueChange={v => setLevelId(v || null)}
          disabled={!languageId}
        >
          <SelectTrigger className="flex-1 h-9 text-xs">
            <SelectValue placeholder="Nível" />
          </SelectTrigger>
          <SelectContent>
            {filteredLevels.map(l => (
              <SelectItem key={l.id} value={l.id}>{l.name} ({l.code})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!levelId ? (
        <div className="py-14 text-center text-sm text-muted-foreground">
          Selecione idioma e nível para visualizar o status de conteúdo por passo.
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : (
        <>
          {steps.length > 0 && (
            <p className="text-xs text-muted-foreground font-light">
              {completedCount} de {steps.length} passos completos
            </p>
          )}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 text-xs font-bold text-muted-foreground">Passo</th>
                  <th className="text-center p-3 text-xs font-bold text-muted-foreground">Materiais</th>
                  <th className="text-center p-3 text-xs font-bold text-muted-foreground">Exercícios</th>
                  <th className="text-center p-3 text-xs font-bold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((step, i) => (
                  <tr
                    key={step.step_id}
                    className={cn(
                      "border-t transition-colors hover:bg-muted/30",
                      i % 2 === 0 && "bg-muted/10"
                    )}
                  >
                    <td className="p-3">
                      <p className="text-xs font-bold">Passo {step.number}</p>
                      {step.title && (
                        <p className="text-xs text-muted-foreground font-light truncate max-w-[180px]">
                          {step.title}
                        </p>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className={cn(
                        "text-sm font-bold tabular-nums",
                        step.material_count > 0 ? "text-foreground" : "text-muted-foreground/40"
                      )}>
                        {step.material_count}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className={cn(
                        "text-sm font-bold tabular-nums",
                        step.exercise_count > 0 ? "text-foreground" : "text-muted-foreground/40"
                      )}>
                        {step.exercise_count}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", SEMAPHORE[step.completion_status])} />
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                          {STATUS_LABELS[step.completion_status]}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
                {steps.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-sm text-muted-foreground">
                      Nenhum passo encontrado para este nível.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminContentByStepTab;
