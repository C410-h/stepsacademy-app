import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGamification } from "@/contexts/GamificationContext";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { format, subDays, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Trophy, Zap, Lock } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface RankingEntry {
  student_id: string;
  name: string;
  xp_total: number;
  streak_current: number;
  rank: number;
  isMe: boolean;
  avatar_url: string | null;
}

interface BadgeItem {
  id: string;
  name: string;
  icon: string;
  description: string | null;
  condition_type: string;
  condition_value: number;
  earned_at: string | null;
}

interface XpEvent {
  id: string;
  event_type: string;
  xp: number;
  description: string | null;
  created_at: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const EVENT_ICONS: Record<string, string> = {
  lesson_complete:  "📚",
  exercise_correct: "✏️",
  daily_mission:    "🎯",
  streak_bonus:     "🔥",
  speaking:         "🎤",
};

const CONDITION_LABELS: Record<string, (v: number) => string> = {
  streak:         (v) => `Manter um streak de ${v} dias consecutivos`,
  xp_total:       (v) => `Acumular ${v.toLocaleString("pt-BR")} XP`,
  lesson_count:   (v) => `Completar ${v} aulas`,
  exercise_count: (v) => `Responder ${v} exercícios corretamente`,
  speaking_count: (v) => `Fazer ${v} atividades de fala`,
};

const MEDALS = ["🥇", "🥈", "🥉"];

const abbr = (name: string) =>
  name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

// ── Main component ─────────────────────────────────────────────────────────────

const Ranking = () => {
  const { profile } = useAuth();
  const { gamification, loading: gamiLoading } = useGamification();

  // Student info
  const [studentId, setStudentId]     = useState<string | null>(null);
  const [languageId, setLanguageId]   = useState<string | null>(null);
  const [initLoading, setInitLoading] = useState(true);

  // Ranking
  const [rankFilter, setRankFilter]     = useState<"all" | "month">("all");
  const [ranking, setRanking]           = useState<RankingEntry[]>([]);
  const [myRankEntry, setMyRankEntry]   = useState<RankingEntry | null>(null);
  const [rankLoading, setRankLoading]   = useState(false);

  // Badges
  const [badges, setBadges]               = useState<BadgeItem[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<BadgeItem | null>(null);
  const [badgesLoading, setBadgesLoading] = useState(false);

  // XP history
  const [xpEvents, setXpEvents]           = useState<XpEvent[]>([]);
  const [xpEventsTotal, setXpEventsTotal] = useState(0);
  const [xpPage, setXpPage]               = useState(30);
  const [xpLoading, setXpLoading]         = useState(false);

  // Streak calendar
  const [activeDays, setActiveDays] = useState<Set<string>>(new Set());

  // ── Init: fetch student id + language ─────────────────────────────────────

  useEffect(() => {
    if (!profile) return;
    (async () => {
      setInitLoading(true);
      const { data } = await supabase
        .from("students")
        .select("id, language_id")
        .eq("user_id", profile.id)
        .maybeSingle();
      setStudentId(data?.id ?? null);
      setLanguageId(data?.language_id ?? null);
      setInitLoading(false);
    })();
  }, [profile]);

  // ── Ranking ───────────────────────────────────────────────────────────────

  const loadRanking = useCallback(async () => {
    if (!studentId || !languageId) return;
    setRankLoading(true);

    try {
      if (rankFilter === "all") {
        // Fetch top 50 ordered by xp_total, filter client-side by language
        const { data: gami } = await (supabase as any)
          .from("student_gamification")
          .select(`
            student_id, xp_total, streak_current,
            students!inner(
              user_id, language_id,
              profiles!students_user_id_fkey(name, avatar_url)
            )
          `)
          .order("xp_total", { ascending: false })
          .limit(50);

        if (!gami) { setRanking([]); return; }

        const filtered = (gami as any[]).filter(
          (g) => g.students?.language_id === languageId
        );

        const top10 = filtered.slice(0, 10).map((g, i) => {
          const p    = g.students?.profiles;
          const prof = Array.isArray(p) ? p[0] : p;
          const name = (prof?.name || "Aluno").split(" ")[0];
          return {
            student_id:     g.student_id,
            name,
            xp_total:       g.xp_total,
            streak_current: g.streak_current,
            rank:           i + 1,
            isMe:           g.student_id === studentId,
            avatar_url:     prof?.avatar_url ?? null,
          } as RankingEntry;
        });

        setRanking(top10);

        const iAmInTop = top10.some(e => e.isMe);
        if (!iAmInTop) {
          const myIdx = filtered.findIndex(g => g.student_id === studentId);
          if (myIdx >= 0) {
            const g    = filtered[myIdx];
            const p    = g.students?.profiles;
            const prof = Array.isArray(p) ? p[0] : p;
            setMyRankEntry({
              student_id:     g.student_id,
              name:           (prof?.name || "Aluno").split(" ")[0],
              xp_total:       g.xp_total,
              streak_current: g.streak_current,
              rank:           myIdx + 1,
              isMe:           true,
              avatar_url:     prof?.avatar_url ?? null,
            });
          } else {
            setMyRankEntry(null);
          }
        } else {
          setMyRankEntry(null);
        }

      } else {
        // Month ranking: aggregate xp_events of the current month
        const monthStart = startOfMonth(new Date()).toISOString();

        const { data: students } = await supabase
          .from("students")
          .select("id, profiles!students_user_id_fkey(name, avatar_url)")
          .eq("language_id", languageId);

        const ids = (students || []).map((s: any) => s.id);
        if (!ids.length) { setRanking([]); setMyRankEntry(null); return; }

        const { data: events } = await (supabase as any)
          .from("xp_events")
          .select("student_id, xp")
          .in("student_id", ids)
          .gte("created_at", monthStart);

        const xpMap = new Map<string, number>();
        for (const ev of (events || []) as any[]) {
          xpMap.set(ev.student_id, (xpMap.get(ev.student_id) ?? 0) + ev.xp);
        }

        const sorted: RankingEntry[] = (students || [])
          .map((s: any) => {
            const prof = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
            return {
              student_id:     s.id,
              name:           (prof?.name || "Aluno").split(" ")[0],
              xp_total:       xpMap.get(s.id) ?? 0,
              streak_current: 0,
              rank:           0,
              isMe:           s.id === studentId,
              avatar_url:     prof?.avatar_url ?? null,
            };
          })
          .filter(e => e.xp_total > 0)
          .sort((a, b) => b.xp_total - a.xp_total)
          .map((e, i) => ({ ...e, rank: i + 1 }));

        const top10 = sorted.slice(0, 10);
        setRanking(top10);

        const iAmInTop = top10.some(e => e.isMe);
        setMyRankEntry(!iAmInTop ? (sorted.find(e => e.isMe) ?? null) : null);
      }
    } finally {
      setRankLoading(false);
    }
  }, [studentId, languageId, rankFilter]);

  useEffect(() => {
    if (studentId && languageId) loadRanking();
  }, [loadRanking]);

  // ── Badges ────────────────────────────────────────────────────────────────

  const loadBadges = useCallback(async () => {
    if (!studentId) return;
    setBadgesLoading(true);
    try {
      const [{ data: all }, { data: earned }] = await Promise.all([
        (supabase as any).from("badges").select("*").eq("active", true).order("condition_value"),
        (supabase as any).from("student_badges").select("badge_id, earned_at").eq("student_id", studentId),
      ]);
      const earnedMap = new Map((earned || []).map((e: any) => [e.badge_id, e.earned_at as string]));
      setBadges(
        (all || []).map((b: any): BadgeItem => ({
          id:              b.id,
          name:            b.name,
          icon:            b.icon,
          description:     b.description,
          condition_type:  b.condition_type,
          condition_value: b.condition_value,
          earned_at:       earnedMap.get(b.id) ?? null,
        }))
      );
    } finally {
      setBadgesLoading(false);
    }
  }, [studentId]);

  useEffect(() => { if (studentId) loadBadges(); }, [loadBadges]);

  // ── XP Events + Streak Calendar ───────────────────────────────────────────

  const loadXpData = useCallback(async () => {
    if (!studentId) return;
    setXpLoading(true);
    try {
      const calStart = subDays(new Date(), 13).toISOString();
      const [histRes, calRes] = await Promise.all([
        (supabase as any)
          .from("xp_events")
          .select("id, event_type, xp, description, created_at", { count: "exact" })
          .eq("student_id", studentId)
          .order("created_at", { ascending: false })
          .limit(xpPage),
        (supabase as any)
          .from("xp_events")
          .select("created_at")
          .eq("student_id", studentId)
          .gte("created_at", calStart),
      ]);

      setXpEvents(histRes.data || []);
      setXpEventsTotal(histRes.count ?? 0);

      const days = new Set<string>();
      for (const e of (calRes.data || []) as any[]) {
        // created_at is UTC — extract date in local time for calendar display
        days.add(new Date(e.created_at).toLocaleDateString("sv-SE")); // sv-SE gives YYYY-MM-DD
      }
      setActiveDays(days);
    } finally {
      setXpLoading(false);
    }
  }, [studentId, xpPage]);

  useEffect(() => { if (studentId) loadXpData(); }, [loadXpData]);

  // ── Derived values ────────────────────────────────────────────────────────

  const { streak_current, streak_best } = gamification;
  const streakProgress   = streak_current === 0 ? 0 : ((streak_current % 7) / 7) * 100;
  const daysToBonus      = streak_current === 0 ? 7 : streak_current % 7 === 0 ? 0 : 7 - (streak_current % 7);
  const myRankPos        = ranking.find(e => e.isMe)?.rank ?? myRankEntry?.rank ?? null;
  const earnedCount      = badges.filter(b => b.earned_at !== null).length;

  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = subDays(new Date(), 13 - i);
    return { key: format(d, "yyyy-MM-dd"), label: format(d, "d MMM", { locale: ptBR }) };
  });

  const todayKey   = format(new Date(), "yyyy-MM-dd");
  const isLoading  = initLoading || gamiLoading;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <StudentLayout>
      <div className="space-y-6 pb-10">

        {/* ── Title ──────────────────────────────────────────────────────── */}
        <h1 className="text-2xl font-bold">Conquistas</h1>

        {/* ── Summary stat cards (horizontal scroll) ─────────────────────── */}
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-28 shrink-0 rounded-xl" />
            ))
          ) : (
            <>
              <StatCard icon="⚡" label="XP Total"  value={gamification.xp_total.toLocaleString("pt-BR")} accent />
              <StatCard icon="🪙" label="Coins"     value={gamification.coins.toLocaleString("pt-BR")} />
              <StatCard icon="🔥" label="Streak"    value={`${streak_current} dias`} />
              <StatCard icon="🏆" label="Posição"   value={myRankPos ? `${myRankPos}°` : "—"} />
            </>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 1 — STREAK
        ════════════════════════════════════════════════════════════════════ */}
        <section className="space-y-3">
          <h2 className="text-base font-bold">Sequência</h2>

          <Card>
            <CardContent className="pt-5 space-y-4">
              {isLoading ? (
                <Skeleton className="h-36 w-full rounded-lg" />
              ) : streak_current === 0 ? (
                /* No active streak */
                <div className="py-5 text-center space-y-2">
                  <span className="text-4xl">🔥</span>
                  <p className="text-sm font-medium">Pratique hoje para começar sua sequência!</p>
                  {streak_best > 0 && (
                    <p className="text-xs text-muted-foreground font-light">
                      Seu recorde: <span className="font-bold text-foreground">{streak_best} dias</span>
                    </p>
                  )}
                </div>
              ) : (
                <>
                  {/* Big number + flame */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl font-bold" style={{ color: "var(--theme-accent)" }}>
                        {streak_current}
                      </span>
                      <span className="text-base text-muted-foreground font-light">dias</span>
                    </div>
                    <span className="text-4xl select-none">🔥</span>
                  </div>

                  {/* Progress bar to next 7-day bonus */}
                  <div className="space-y-1.5">
                    <Progress value={daysToBonus === 0 ? 100 : streakProgress} className="h-2" />
                    <p className="text-xs text-muted-foreground font-light">
                      {daysToBonus === 0
                        ? "🎉 Você atingiu um bônus hoje!"
                        : `${daysToBonus} dia${daysToBonus !== 1 ? "s" : ""} para o próximo bônus`}
                    </p>
                  </div>

                  <p className="text-xs text-muted-foreground font-light">
                    Seu recorde:{" "}
                    <span className="font-bold text-foreground">{streak_best} dias</span>
                  </p>
                </>
              )}

              {/* 14-day activity calendar */}
              <div>
                <p className="text-[11px] text-muted-foreground font-light mb-2">Últimos 14 dias</p>
                <div className="flex gap-1.5">
                  {last14.map(({ key, label }) => {
                    const active  = activeDays.has(key);
                    const isToday = key === todayKey;
                    return (
                      <div
                        key={key}
                        title={label}
                        className={cn(
                          "flex-1 aspect-square rounded-md transition-all",
                          active ? "" : "bg-muted/60",
                          isToday && "ring-2 ring-offset-1 ring-primary/40"
                        )}
                        style={active
                          ? { background: "var(--theme-accent)", opacity: isToday ? 1 : 0.8 }
                          : undefined}
                      />
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 2 — RANKING
        ════════════════════════════════════════════════════════════════════ */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Ranking</h2>
            {myRankPos && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {myRankPos}° lugar
              </span>
            )}
          </div>

          {/* Time filter */}
          <div className="flex gap-2">
            {(["all", "month"] as const).map(f => (
              <button
                key={f}
                onClick={() => setRankFilter(f)}
                className={cn(
                  "text-xs px-3 py-1 rounded-full border transition-colors",
                  rankFilter === f
                    ? "border-primary text-primary bg-primary/10 font-semibold"
                    : "border-border text-muted-foreground hover:border-muted-foreground"
                )}
              >
                {f === "all" ? "Tudo" : "Este mês"}
              </button>
            ))}
          </div>

          <Card>
            <CardContent className="pt-4 pb-3">
              {rankLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                  ))}
                </div>
              ) : ranking.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <Trophy className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                  <p className="text-sm text-muted-foreground font-light">
                    {rankFilter === "month"
                      ? "Nenhuma atividade registrada este mês."
                      : "Nenhum aluno no ranking ainda."}
                  </p>
                </div>
              ) : (
                <div>
                  {/* Podium — top 3 */}
                  {ranking.length >= 1 && (
                    <div className="flex items-end justify-center gap-2 pt-2 pb-5">
                      {/* 2nd place (left) */}
                      {ranking[1] && (
                        <PodiumItem entry={ranking[1]} podiumHeight="h-20" medal="🥈" />
                      )}
                      {/* 1st place (centre, tallest) */}
                      <PodiumItem entry={ranking[0]} podiumHeight="h-28" medal="🥇" crown />
                      {/* 3rd place (right) */}
                      {ranking[2] && (
                        <PodiumItem entry={ranking[2]} podiumHeight="h-14" medal="🥉" />
                      )}
                    </div>
                  )}

                  {/* Positions 4–10 */}
                  {ranking.length > 3 && (
                    <>
                      <div className="border-t mb-2" />
                      <div className="space-y-0.5">
                        {ranking.slice(3).map(entry => (
                          <RankRow key={entry.student_id} entry={entry} />
                        ))}
                      </div>
                    </>
                  )}

                  {/* My entry if outside top 10 */}
                  {myRankEntry && (
                    <>
                      <p className="text-center text-xs text-muted-foreground py-2">• • •</p>
                      <RankRow entry={myRankEntry} />
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 3 — BADGES
        ════════════════════════════════════════════════════════════════════ */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Conquistas</h2>
            {!badgesLoading && badges.length > 0 && (
              <span className="text-xs text-muted-foreground font-light">
                {earnedCount}/{badges.length} desbloqueadas
              </span>
            )}
          </div>

          {badgesLoading ? (
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : badges.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground font-light">
                Nenhuma conquista cadastrada ainda.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {badges.map(badge => {
                const earned = badge.earned_at !== null;
                return (
                  <button
                    key={badge.id}
                    onClick={() => setSelectedBadge(badge)}
                    className="flex flex-col items-center gap-1 p-2.5 rounded-xl border border-border/60 hover:border-primary/40 hover:bg-muted/30 transition-colors"
                  >
                    <div className="relative">
                      <span className={cn("text-2xl leading-none block", !earned && "grayscale opacity-35")}>
                        {badge.icon}
                      </span>
                      {!earned && (
                        <Lock className="absolute -bottom-0.5 -right-1 h-3 w-3 text-muted-foreground/60" />
                      )}
                    </div>
                    <span className={cn(
                      "text-[9px] leading-tight font-medium text-center line-clamp-2",
                      earned ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {badge.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 4 — XP HISTORY
        ════════════════════════════════════════════════════════════════════ */}
        <section className="space-y-3">
          <h2 className="text-base font-bold">Histórico de XP</h2>

          <Card>
            <CardContent className="pt-4 pb-3">
              {xpLoading && xpEvents.length === 0 ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-lg" />
                  ))}
                </div>
              ) : xpEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground font-light text-center py-8">
                  Nenhum evento de XP registrado ainda.
                </p>
              ) : (
                <div className="divide-y">
                  {xpEvents.map(ev => (
                    <div key={ev.id} className="flex items-center gap-3 py-3">
                      <span className="text-lg shrink-0 w-6 text-center">
                        {EVENT_ICONS[ev.event_type] ?? "⚡"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">
                          {ev.description || ev.event_type.replace(/_/g, " ")}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-light">
                          {format(new Date(ev.created_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-green-600 dark:text-green-400 shrink-0">
                        +{ev.xp} XP
                      </span>
                    </div>
                  ))}

                  {xpEventsTotal > xpPage && (
                    <div className="pt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => setXpPage(p => p + 30)}
                        disabled={xpLoading}
                      >
                        {xpLoading ? "Carregando..." : "Ver mais"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      {/* ── Badge detail modal ─────────────────────────────────────────────── */}
      <Dialog open={!!selectedBadge} onOpenChange={o => !o && setSelectedBadge(null)}>
        {selectedBadge && (
          <DialogContent className="max-w-[320px] mx-auto rounded-2xl">
            <DialogHeader className="items-center text-center space-y-3 pt-2">
              <span className={cn("text-5xl", !selectedBadge.earned_at && "grayscale opacity-40")}>
                {selectedBadge.icon}
              </span>
              <DialogTitle className="text-base">{selectedBadge.name}</DialogTitle>
              {selectedBadge.description && (
                <DialogDescription className="text-sm font-light text-center">
                  {selectedBadge.description}
                </DialogDescription>
              )}
            </DialogHeader>

            <div className="space-y-3 pb-2">
              <div className="rounded-xl bg-muted/50 p-3 text-sm font-light text-center text-muted-foreground">
                {CONDITION_LABELS[selectedBadge.condition_type]?.(selectedBadge.condition_value)
                  ?? `${selectedBadge.condition_type}: ${selectedBadge.condition_value}`}
              </div>

              {selectedBadge.earned_at ? (
                <p className="text-center text-xs text-green-600 dark:text-green-400 font-medium">
                  ✅ Desbloqueada em{" "}
                  {format(new Date(selectedBadge.earned_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              ) : (
                <p className="text-center text-xs text-muted-foreground font-light">
                  🔒 Ainda não desbloqueada
                </p>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </StudentLayout>
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────────

const StatCard = ({
  icon, label, value, accent,
}: {
  icon: string; label: string; value: string; accent?: boolean;
}) => (
  <div className={cn(
    "shrink-0 w-28 rounded-xl border p-3 flex flex-col gap-1",
    accent ? "border-primary/30 bg-primary/5" : "bg-card border-border"
  )}>
    <span className="text-xl">{icon}</span>
    <p className="text-[11px] text-muted-foreground font-light leading-tight">{label}</p>
    <p className={cn("text-lg font-bold leading-tight tabular-nums", accent && "text-primary")}>
      {value}
    </p>
  </div>
);

const PodiumItem = ({
  entry, podiumHeight, medal, crown,
}: {
  entry: RankingEntry; podiumHeight: string; medal: string; crown?: boolean;
}) => (
  <div className="flex flex-col items-center gap-1 flex-1 max-w-[90px]">
    {crown && <span className="text-xl -mb-1">👑</span>}
    <Avatar className={cn(
      "ring-2 ring-offset-1 ring-border",
      crown ? "h-12 w-12" : "h-9 w-9"
    )}>
      <AvatarImage src={entry.avatar_url || undefined} />
      <AvatarFallback
        className="font-bold"
        style={{
          fontSize: crown ? 12 : 10,
          background: "var(--theme-primary)",
          color: "var(--theme-text-on-primary)",
        }}
      >
        {abbr(entry.name)}
      </AvatarFallback>
    </Avatar>
    <p className={cn(
      "text-[10px] font-semibold truncate max-w-full text-center leading-tight",
      entry.isMe && "text-primary"
    )}>
      {entry.name}{entry.isMe && " (eu)"}
    </p>
    {/* Podium block */}
    <div className={cn(
      "w-full rounded-t-lg flex flex-col items-center justify-end pb-2 pt-1 gap-0.5",
      podiumHeight,
      crown ? "bg-yellow-50 dark:bg-yellow-950/30" : "bg-muted/50"
    )}>
      <span className="text-lg">{medal}</span>
      <span className="text-[9px] font-bold text-muted-foreground tabular-nums">
        {entry.xp_total.toLocaleString("pt-BR")} XP
      </span>
    </div>
  </div>
);

const RankRow = ({ entry }: { entry: RankingEntry }) => (
  <div className={cn(
    "flex items-center gap-3 px-2 py-2.5 rounded-xl transition-colors",
    entry.isMe ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/40"
  )}>
    <span className="w-6 text-center text-xs font-bold text-muted-foreground shrink-0">
      {entry.rank}°
    </span>
    <Avatar className="h-8 w-8 shrink-0">
      <AvatarImage src={entry.avatar_url || undefined} />
      <AvatarFallback
        className="text-[10px] font-bold"
        style={{ background: "var(--theme-primary)", color: "var(--theme-text-on-primary)" }}
      >
        {abbr(entry.name)}
      </AvatarFallback>
    </Avatar>
    <p className={cn("flex-1 text-sm font-medium truncate", entry.isMe && "text-primary")}>
      {entry.name}
      {entry.isMe && <span className="ml-1 text-xs font-normal opacity-70">(você)</span>}
    </p>
    <div className="flex items-center gap-1 shrink-0">
      <Zap
        className="h-3 w-3"
        style={{ fill: "var(--theme-accent)", color: "var(--theme-accent)" }}
      />
      <span className="text-xs font-bold tabular-nums">
        {entry.xp_total.toLocaleString("pt-BR")}
      </span>
    </div>
  </div>
);

export default Ranking;
