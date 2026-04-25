import React, { useState } from "react";
import { Lock, Star, Flame, Mic, BookOpen, GraduationCap, Trophy, Target, Zap, Medal, CalendarCheck } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BadgeItem {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  condition_type: string;
  condition_value: number;
  earned_at: string | null;
}

// ── Icon map (text key → Lucide icon) ─────────────────────────────────────────

const BADGE_ICON_MAP: Record<string, React.ElementType> = {
  star:        Star,
  footprints:  Star,
  mic:         Mic,
  flame:       Flame,
  book:        BookOpen,
  graduation:  GraduationCap,
  trophy:      Trophy,
  target:      Target,
  zap:         Zap,
  medal:       Medal,
  calendar:    CalendarCheck,
};

// ── Condition descriptions ─────────────────────────────────────────────────────

const CONDITION_LABELS: Record<string, (v: number) => string> = {
  streak:         v => `Manter um streak de ${v} dias consecutivos`,
  xp_total:       v => `Acumular ${v.toLocaleString("pt-BR")} XP`,
  lesson_count:   v => `Completar ${v} aulas`,
  exercise_count: v => `Responder ${v} exercícios corretamente`,
  speaking_count: v => `Fazer ${v} atividades de fala`,
};

// ── Badge icon renderer ────────────────────────────────────────────────────────

const BadgeIcon = ({ icon, size = "sm", className }: { icon: string; size?: "sm" | "lg"; className?: string }) => {
  const Icon = BADGE_ICON_MAP[icon];
  const sizeClass = size === "lg" ? "h-12 w-12" : "h-6 w-6";
  if (Icon) return <Icon className={cn(sizeClass, className)} />;
  return <span className={cn("leading-none", size === "lg" ? "text-5xl" : "text-2xl")}>{icon}</span>;
};

// ── Main component ─────────────────────────────────────────────────────────────

interface BadgeGridProps {
  badges: BadgeItem[];
  loading?: boolean;
  columns?: 4 | 6;
}

const BadgeGrid = ({ badges, loading = false, columns = 4 }: BadgeGridProps) => {
  const [selected, setSelected] = useState<BadgeItem | null>(null);

  if (loading) {
    return (
      <div className={cn("grid gap-3", columns === 6 ? "grid-cols-4 lg:grid-cols-6" : "grid-cols-4")}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className={cn("grid gap-3", columns === 6 ? "grid-cols-4 lg:grid-cols-6" : "grid-cols-4")}>
        {badges.map(badge => {
          const earned = badge.earned_at !== null;
          return (
            <button
              key={badge.id}
              onClick={() => setSelected(badge)}
              className={cn(
                "flex flex-col items-center gap-1 p-2 rounded-xl border transition-all",
                earned
                  ? "border-[var(--theme-button-bg)] bg-[var(--theme-button-bg)] cursor-pointer"
                  : "border-border bg-muted/20 opacity-50 cursor-default"
              )}
            >
              <span className="flex items-center justify-center h-7 w-7">
                {earned
                  ? <BadgeIcon icon={badge.icon} size="sm" className="text-[var(--theme-button-text)]" />
                  : <Lock className="h-5 w-5 text-muted-foreground" />
                }
              </span>
              <span className={cn(
                "text-[10px] text-center leading-tight font-light line-clamp-2",
                earned ? "text-[var(--theme-button-text)]" : "text-muted-foreground"
              )}>
                {badge.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        {selected && (() => {
          const earned = selected.earned_at !== null;
          return (
            <DialogContent className="max-w-[320px] mx-auto rounded-2xl">
              <DialogHeader className="items-center text-center space-y-3 pt-2">
                <div className={cn("flex justify-center", !earned && "opacity-40 grayscale")}>
                  {earned
                    ? <BadgeIcon icon={selected.icon} size="lg" className="text-theme-brand" />
                    : <Lock className="h-12 w-12 text-muted-foreground" />
                  }
                </div>
                <DialogTitle className="text-base">{selected.name}</DialogTitle>
                {selected.description && (
                  <DialogDescription className="text-sm font-light text-center">
                    {selected.description}
                  </DialogDescription>
                )}
              </DialogHeader>
              <div className="space-y-3 pb-2">
                <div className="rounded-xl bg-muted/50 p-3 text-sm font-light text-center text-muted-foreground">
                  {CONDITION_LABELS[selected.condition_type]?.(selected.condition_value)
                    ?? `${selected.condition_type}: ${selected.condition_value}`}
                </div>
                {earned ? (
                  <p className="text-center text-xs text-theme-brand font-bold">
                    ✓ Conquistado em{" "}
                    {format(new Date(selected.earned_at!), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </p>
                ) : (
                  <p className="text-center text-xs text-muted-foreground font-light">
                    Continue praticando para desbloquear esta conquista!
                  </p>
                )}
              </div>
            </DialogContent>
          );
        })()}
      </Dialog>
    </>
  );
};

export default BadgeGrid;
