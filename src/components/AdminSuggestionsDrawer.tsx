import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { MessageSquarePlus, Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const db = supabase as any;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Suggestion {
  id: string;
  message: string;
  category: string;
  status: string;
  created_at: string;
  profiles: { name: string } | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  minigame:  "Minigame",
  funcao:    "Função",
  atividade: "Atividade",
  geral:     "Geral",
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:     { label: "Nova",         className: "border-yellow-500 text-yellow-700 bg-yellow-50 dark:bg-yellow-950/30" },
  reviewed:    { label: "Revisada",     className: "border-blue-500 text-blue-700 bg-blue-50 dark:bg-blue-950/30" },
  implemented: { label: "Implementada", className: "border-green-500 text-green-700 bg-green-50 dark:bg-green-950/30" },
};

// ── Component ─────────────────────────────────────────────────────────────────

const AdminSuggestionsDrawer = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "reviewed" | "implemented">("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await db
      .from("suggestions")
      .select("id, message, category, status, created_at, profiles!suggestions_profile_id_fkey(name)")
      .order("created_at", { ascending: false });
    setSuggestions(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const markStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    await db.from("suggestions").update({ status }).eq("id", id);
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    toast({ title: "Status atualizado" });
    setUpdatingId(null);
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const pendingCount = suggestions.filter(s => s.status === "pending").length;
  const visible = statusFilter === "all" ? suggestions : suggestions.filter(s => s.status === statusFilter);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 overflow-hidden">

        {/* Header */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base">
              <MessageSquarePlus className="h-5 w-5 shrink-0" />
              Sugestões dos Alunos
              {pendingCount > 0 && (
                <Badge className="bg-yellow-500 text-white text-[10px] px-1.5 py-0">
                  {pendingCount} nova{pendingCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </SheetTitle>
            <button
              onClick={load}
              disabled={loading}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
              aria-label="Recarregar"
            >
              <RotateCcw className={cn("h-4 w-4", loading && "animate-spin")} />
            </button>
          </div>

          {/* Status filter */}
          <div className="flex gap-1.5 pt-1 flex-wrap">
            {(["all", "pending", "reviewed", "implemented"] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border transition-colors",
                  statusFilter === f
                    ? "border-primary text-primary bg-primary/10 font-semibold"
                    : "border-border text-muted-foreground hover:border-muted-foreground"
                )}
              >
                {f === "all" ? `Todas (${suggestions.length})` : STATUS_CONFIG[f].label}
                {f !== "all" && ` (${suggestions.filter(s => s.status === f).length})`}
              </button>
            ))}
          </div>
        </SheetHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))
          ) : visible.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <MessageSquarePlus className="h-10 w-10 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground font-light">
                {statusFilter === "all" ? "Nenhuma sugestão ainda." : "Nenhuma sugestão nessa categoria."}
              </p>
            </div>
          ) : (
            visible.map(s => {
              const cfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.pending;
              const profile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
              return (
                <div
                  key={s.id}
                  className={cn(
                    "p-4 rounded-xl border space-y-2.5",
                    s.status === "pending" ? "border-yellow-300/60 bg-yellow-50/50 dark:bg-yellow-950/20" : "border-border"
                  )}
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="secondary" className="text-[10px]">
                        {CATEGORY_LABELS[s.category] || s.category}
                      </Badge>
                      <Badge variant="outline" className={cn("text-[10px]", cfg.className)}>
                        {cfg.label}
                      </Badge>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {s.status === "pending" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          disabled={updatingId === s.id}
                          onClick={() => markStatus(s.id, "reviewed")}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Revisar
                        </Button>
                      )}
                      {s.status === "reviewed" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-green-600 hover:text-green-700 hover:bg-green-50"
                          disabled={updatingId === s.id}
                          onClick={() => markStatus(s.id, "implemented")}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Implementado
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Message */}
                  <p className="text-sm leading-relaxed text-foreground">{s.message}</p>

                  {/* Footer */}
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground font-light">
                    <span className="font-medium">{profile?.name || "Aluno desconhecido"}</span>
                    <span>{format(new Date(s.created_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AdminSuggestionsDrawer;
