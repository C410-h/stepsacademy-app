import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useGamification } from "@/contexts/GamificationContext";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "@/hooks/use-toast";
import { ShoppingBag, Clock, CheckCircle2, Lock, Trophy, Zap, Flame, Coins, Tag, CalendarDays, Gift, BookOpen, PenLine, Target, Mic, Star, CalendarCheck, GraduationCap, Medal, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

const db = supabase as any;

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "loja" | "ranking" | "conquistas";

interface StoreItem {
  id: string;
  title: string;
  description: string | null;
  coins_cost: number;
  category: string;
  stock: number | null;
  image_url: string | null;
}

interface Redemption {
  id: string;
  item_id: string;
  coins_spent: number;
  status: string;
  redeemed_at: string;
  store_items: { title: string } | null;
}

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

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  desconto:  "Desconto",
  aula_extra: "Aula Extra",
  brinde:    "Brinde",
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  desconto:   Tag,
  aula_extra: CalendarDays,
  brinde:     Gift,
};

const STATUS_LABELS: Record<string, string> = {
  pending:   "Aguardando",
  approved:  "Aprovado",
  delivered: "Entregue",
};

const EVENT_ICONS: Record<string, React.ElementType> = {
  lesson_complete:  BookOpen,
  exercise_correct: PenLine,
  daily_mission:    Target,
  streak_bonus:     Flame,
  speaking:         Mic,
};

const BADGE_ICON_MAP: Record<string, React.ElementType> = {
  star: Star, footprints: Star, mic: Mic, flame: Flame, zap: Zap,
  trophy: Trophy, book: BookOpen, calendar: CalendarCheck,
  graduation: GraduationCap, medal: Medal, target: Target,
};

const CONDITION_LABELS: Record<string, (v: number) => string> = {
  streak:         (v) => `Manter um streak de ${v} dias consecutivos`,
  xp_total:       (v) => `Acumular ${v.toLocaleString("pt-BR")} XP`,
  lesson_count:   (v) => `Completar ${v} aulas`,
  exercise_count: (v) => `Responder ${v} exercícios corretamente`,
  speaking_count: (v) => `Fazer ${v} atividades de fala`,
};

const abbr = (name: string) =>
  name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

// ── Main component ────────────────────────────────────────────────────────────

const Recompensas = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab") as Tab | null;
  const [activeTab, setActiveTab] = useState<Tab>(
    rawTab === "ranking" || rawTab === "conquistas" ? rawTab : "loja"
  );

  const { profile } = useAuth();
  const { gamification, refresh: refreshGamification, loading: gamiLoading } = useGamification();

  // ── Shared ────────────────────────────────────────────────────────────────
  const [studentId, setStudentId]   = useState<string | null>(null);
  const [languageId, setLanguageId] = useState<string | null>(null);
  const [initLoading, setInitLoading] = useState(true);

  // ── Loja ──────────────────────────────────────────────────────────────────
  const [items, setItems]             = useState<StoreItem[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [lojaLoading, setLojaLoading] = useState(false);
  const [lojaLoaded, setLojaLoaded]   = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [confirmItem, setConfirmItem] = useState<StoreItem | null>(null);
  const [redeeming, setRedeeming]     = useState(false);

  // ── Ranking ───────────────────────────────────────────────────────────────
  const [rankFilter, setRankFilter]   = useState<"all" | "month">("all");
  const [ranking, setRanking]         = useState<RankingEntry[]>([]);
  const [myRankEntry, setMyRankEntry] = useState<RankingEntry | null>(null);
  const [rankLoading, setRankLoading] = useState(false);

  // ── Conquistas ────────────────────────────────────────────────────────────
  const [badges, setBadges]               = useState<BadgeItem[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<BadgeItem | null>(null);
  const [badgesLoading, setBadgesLoading] = useState(false);
  const [badgesLoaded, setBadgesLoaded]   = useState(false);
  const [xpEvents, setXpEvents]           = useState<XpEvent[]>([]);
  const [xpEventsTotal, setXpEventsTotal] = useState(0);
  const [xpPage, setXpPage]               = useState(30);
  const [xpLoading, setXpLoading]         = useState(false);

  // ── Streak calendar ───────────────────────────────────────────────────────
  const [activeDays, setActiveDays] = useState<Set<string>>(new Set());

  // ── Init ──────────────────────────────────────────────────────────────────
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

  // ── Streak calendar (always, above tabs) ──────────────────────────────────
  useEffect(() => {
    if (!studentId) return;
    const calStart = subDays(new Date(), 13).toISOString();
    db.from("xp_events")
      .select("created_at")
      .eq("student_id", studentId)
      .gte("created_at", calStart)
      .then(({ data }: any) => {
        const days = new Set<string>();
        for (const e of (data || []) as any[]) {
          days.add(new Date(e.created_at).toLocaleDateString("sv-SE"));
        }
        setActiveDays(days);
      });
  }, [studentId]);

  // ── Loja (lazy) ───────────────────────────────────────────────────────────
  const loadLoja = useCallback(async () => {
    if (!studentId) return;
    setLojaLoading(true);
    try {
      const [{ data: storeItems }, { data: myRedemptions }] = await Promise.all([
        db.from("store_items")
          .select("id, title, description, coins_cost, category, stock, image_url")
          .eq("active", true)
          .order("coins_cost"),
        db.from("store_redemptions")
          .select("id, item_id, coins_spent, status, redeemed_at, store_items(title)")
          .eq("student_id", studentId)
          .order("redeemed_at", { ascending: false }),
      ]);
      setItems(storeItems || []);
      setRedemptions(myRedemptions || []);
      setLojaLoaded(true);
    } finally {
      setLojaLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    if (activeTab === "loja" && studentId && !lojaLoaded) loadLoja();
  }, [activeTab, studentId, lojaLoaded, loadLoja]);

  // ── Ranking (eager + reloads on filter change) ────────────────────────────
  const loadRanking = useCallback(async () => {
    if (!studentId || !languageId) return;
    setRankLoading(true);
    try {
      if (rankFilter === "all") {
        const { data: gami } = await db
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
          return {
            student_id:     g.student_id,
            name:           (prof?.name || "Aluno").split(" ")[0],
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
        const monthStart = startOfMonth(new Date()).toISOString();
        const { data: students } = await supabase
          .from("students")
          .select("id, profiles!students_user_id_fkey(name, avatar_url)")
          .eq("language_id", languageId);

        const ids = (students || []).map((s: any) => s.id);
        if (!ids.length) { setRanking([]); setMyRankEntry(null); return; }

        const { data: events } = await db
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
        setMyRankEntry(!top10.some(e => e.isMe) ? (sorted.find(e => e.isMe) ?? null) : null);
      }
    } finally {
      setRankLoading(false);
    }
  }, [studentId, languageId, rankFilter]);

  // Eager load ranking (also needed for position stat in Conquistas)
  useEffect(() => {
    if (studentId && languageId) loadRanking();
  }, [loadRanking]);

  // ── Badges (lazy) ─────────────────────────────────────────────────────────
  const loadBadges = useCallback(async () => {
    if (!studentId) return;
    setBadgesLoading(true);
    try {
      const [{ data: all }, { data: earned }] = await Promise.all([
        db.from("badges").select("*").eq("active", true).order("condition_value"),
        db.from("student_badges").select("badge_id, earned_at").eq("student_id", studentId),
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
      setBadgesLoaded(true);
    } finally {
      setBadgesLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    if (activeTab === "conquistas" && studentId && !badgesLoaded) loadBadges();
  }, [activeTab, studentId, badgesLoaded, loadBadges]);

  // ── XP Events (lazy + reloads on page change) ─────────────────────────────
  const loadXpEvents = useCallback(async () => {
    if (!studentId) return;
    setXpLoading(true);
    try {
      const { data, count } = await db
        .from("xp_events")
        .select("id, event_type, xp, description, created_at", { count: "exact" })
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(xpPage);
      setXpEvents(data || []);
      setXpEventsTotal(count ?? 0);
    } finally {
      setXpLoading(false);
    }
  }, [studentId, xpPage]);

  useEffect(() => {
    if (activeTab === "conquistas" && studentId) loadXpEvents();
  }, [loadXpEvents, activeTab]);

  // ── Redeem ────────────────────────────────────────────────────────────────
  const handleRedeem = async () => {
    if (!confirmItem || !studentId) return;
    if (gami.coins < confirmItem.coins_cost) {
      toast({ title: "Coins insuficientes", description: "Ganhe mais coins completando exercícios!", variant: "destructive" });
      setConfirmItem(null);
      return;
    }
    setRedeeming(true);
    try {
      await db.from("student_gamification").update({
        coins: gami.coins - confirmItem.coins_cost,
        updated_at: new Date().toISOString(),
      }).eq("student_id", studentId);

      await db.from("store_redemptions").insert({
        student_id: studentId,
        item_id:    confirmItem.id,
        coins_spent: confirmItem.coins_cost,
        status:     "pending",
      });

      await refreshGamification();
      await loadLoja();
      toast({ title: "🎉 Resgate feito!", description: `Você resgatou "${confirmItem.title}". Aguarde a confirmação.` });
      setConfirmItem(null);
    } catch {
      toast({ title: "Erro ao resgatar", description: "Tente novamente.", variant: "destructive" });
    } finally {
      setRedeeming(false);
    }
  };

  // ── Tab change ────────────────────────────────────────────────────────────
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setSearchParams(tab === "loja" ? {} : { tab });
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const gami = gamification;
  const { streak_current, streak_best } = gami;
  const streakProgress = streak_current === 0 ? 0 : ((streak_current % 7) / 7) * 100;
  const daysToBonus    = streak_current === 0 ? 7 : streak_current % 7 === 0 ? 0 : 7 - (streak_current % 7);
  const myRankPos      = ranking.find(e => e.isMe)?.rank ?? myRankEntry?.rank ?? null;
  const earnedCount    = badges.filter(b => b.earned_at !== null).length;
  const categories     = ["all", ...Array.from(new Set(items.map(i => i.category)))];
  const filtered       = categoryFilter === "all" ? items : items.filter(i => i.category === categoryFilter);
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = subDays(new Date(), 13 - i);
    return { key: format(d, "yyyy-MM-dd"), label: format(d, "d MMM", { locale: ptBR }) };
  });
  const todayKey  = format(new Date(), "yyyy-MM-dd");
  const isLoading = initLoading || gamiLoading;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <StudentLayout>
      <div className="space-y-4 pb-10">

        {/* ── Page Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Recompensas</h1>
          <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-full px-3 py-1.5">
            <Coins className="h-4 w-4 text-theme-brand" />
            <span className="text-sm font-bold text-theme-brand">
              {gami.coins.toLocaleString("pt-BR")}
            </span>
            <span className="text-xs text-theme-brand/70 font-light">coins</span>
          </div>
        </div>

        {/* ── Streak (above tabs, always visible) ──────────────────────────── */}
        <section className="space-y-2">
          <h2 className="text-base font-bold">Sequência</h2>
          <Card style={{ background: "var(--theme-primary)" }}>
            <CardContent className="pt-5 space-y-4">
              {isLoading ? (
                <Skeleton className="h-36 w-full rounded-lg opacity-30" />
              ) : streak_current === 0 ? (
                <div className="py-5 text-center space-y-2">
                  <Flame className="h-10 w-10 mx-auto" style={{ color: "var(--theme-accent)" }} />
                  <p className="text-sm font-medium text-primary-foreground">Pratique hoje para começar sua sequência!</p>
                  {streak_best > 0 && (
                    <p className="text-xs font-light" style={{ color: "var(--theme-accent)" }}>
                      Seu recorde: <span className="font-bold">{streak_best} dias</span>
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl font-bold" style={{ color: "var(--theme-accent)" }}>
                        {streak_current}
                      </span>
                      <span className="text-base font-light text-primary-foreground/70">dias</span>
                    </div>
                    <Flame className="h-10 w-10" style={{ color: "var(--theme-accent)" }} />
                  </div>
                  <div className="space-y-1.5">
                    <Progress value={daysToBonus === 0 ? 100 : streakProgress} className="h-2 bg-primary-foreground/20 [&>div]:bg-accent" />
                    <p className="text-xs font-light text-primary-foreground/70">
                      {daysToBonus === 0
                        ? "Você atingiu um bônus hoje!"
                        : `${daysToBonus} dia${daysToBonus !== 1 ? "s" : ""} para o próximo bônus`}
                    </p>
                  </div>
                  <p className="text-xs font-light text-primary-foreground/70">
                    Seu recorde:{" "}
                    <span className="font-bold text-primary-foreground">{streak_best} dias</span>
                  </p>
                </>
              )}

              {/* 14-day activity calendar */}
              <div>
                <p className="text-[11px] font-light mb-2 text-primary-foreground/60">Últimos 14 dias</p>
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
                          active ? "" : "bg-white/15",
                          isToday && "ring-2 ring-offset-1 ring-white/40"
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

        {/* ── Tab Selector ─────────────────────────────────────────────────── */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {(["loja", "ranking", "conquistas"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={cn(
                "flex-1 py-2 rounded-md text-sm font-medium transition-colors",
                activeTab === tab
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === "loja" ? "Loja" : tab === "ranking" ? "Ranking" : "Conquistas"}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            ABA LOJA
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "loja" && (
          <div className="space-y-4">
            {/* Category filter */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {categories.map(cat => (
                <Button
                  key={cat}
                  variant={categoryFilter === cat ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCategoryFilter(cat)}
                  className={cn("shrink-0 text-xs", categoryFilter === cat && "bg-primary text-primary-foreground")}
                >
                  {cat === "all" ? "Todos" : (() => { const Icon = CATEGORY_ICONS[cat]; return <>{Icon && <Icon className="h-3 w-3 mr-1 inline" />}{CATEGORY_LABELS[cat] || cat}</>; })()}
                </Button>
              ))}
            </div>

            {/* Items grid */}
            {lojaLoading ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-44 rounded-xl" />)}
              </div>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
                  <ShoppingBag className="h-12 w-12 text-muted-foreground/40" />
                  <p className="font-bold text-sm">Nenhum item disponível</p>
                  <p className="text-xs text-muted-foreground">Novidades chegando em breve!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map(item => {
                  const canAfford = gami.coins >= item.coins_cost;
                  return (
                    <Card
                      key={item.id}
                      className={cn(
                        "flex flex-col cursor-pointer transition-all hover:shadow-md",
                        !canAfford && "opacity-60"
                      )}
                      onClick={() => setConfirmItem(item)}
                    >
                      <CardContent className="p-4 flex flex-col gap-2 flex-1">
                        <div className="flex justify-center py-2">
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.title} className="h-12 w-12 object-contain" />
                          ) : (
                            (() => { const Icon = CATEGORY_ICONS[item.category] ?? Gift; return <Icon className="h-10 w-10 text-theme-brand" />; })()
                          )}
                        </div>
                        <Badge className="text-[10px] w-fit bg-primary/10 text-theme-brand border-primary/20 hover:bg-primary/10">
                          {CATEGORY_LABELS[item.category] || item.category}
                        </Badge>
                        <p className="text-sm font-bold leading-tight">{item.title}</p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground font-light line-clamp-2">{item.description}</p>
                        )}
                        <div className="mt-auto pt-2 flex items-center gap-1">
                          <Coins className="h-3.5 w-3.5 text-theme-brand/60 shrink-0" />
                          <span className={cn("text-sm font-bold", canAfford ? "text-theme-brand" : "text-muted-foreground")}>
                            {item.coins_cost.toLocaleString("pt-BR")}
                          </span>
                        </div>
                        {item.stock !== null && (
                          <p className="text-[10px] text-muted-foreground">{item.stock} disponíveis</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Redemption history */}
            {!lojaLoading && redemptions.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Meus resgates
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pb-4">
                  {redemptions.map(r => (
                    <div key={r.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{(r.store_items as any)?.title || "—"}</p>
                        <p className="text-xs text-muted-foreground font-light">
                          <Coins className="inline h-3 w-3 mr-0.5 text-theme-brand/60" />{r.coins_spent} · {new Date(r.redeemed_at).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] shrink-0 ml-2",
                          r.status === "delivered" && "border-green-500 text-green-600",
                          r.status === "approved"  && "border-blue-500 text-blue-600",
                          r.status === "pending"   && "border-yellow-500 text-yellow-600"
                        )}
                      >
                        {r.status === "delivered" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                        {STATUS_LABELS[r.status] || r.status}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            ABA RANKING
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "ranking" && (
          <div className="space-y-4">
            {/* Filter + my position */}
            <div className="flex items-center gap-2">
              {(["all", "month"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setRankFilter(f)}
                  className={cn(
                    "text-xs px-3 py-1 rounded-full border transition-colors",
                    rankFilter === f
                      ? "border-primary text-theme-brand bg-primary/10 font-semibold"
                      : "border-border text-muted-foreground hover:border-muted-foreground"
                  )}
                >
                  {f === "all" ? "Tudo" : "Este mês"}
                </button>
              ))}
              {myRankPos && (
                <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-theme-brand">
                  {myRankPos}° lugar
                </span>
              )}
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
                    {/* Podium top 3 */}
                    {ranking.length >= 1 && (
                      <div className="flex items-end justify-center gap-2 pt-2 pb-5">
                        {ranking[1] && <PodiumItem entry={ranking[1]} podiumHeight="h-20" medalColor="#9CA3AF" medalSize="h-6 w-6" crown={false} />}
                        <PodiumItem entry={ranking[0]} podiumHeight="h-28" medalColor="#FFD700" medalSize="h-7 w-7" crown />
                        {ranking[2] && <PodiumItem entry={ranking[2]} podiumHeight="h-14" medalColor="#CD7C2F" medalSize="h-5 w-5" crown={false} />}
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
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            ABA CONQUISTAS
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "conquistas" && (
          <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-28 shrink-0 rounded-xl" />
                ))
              ) : (
                <>
                  <StatCard icon={Zap}    label="XP Total" value={gami.xp_total.toLocaleString("pt-BR")} accent />
                  <StatCard icon={Coins}  label="Coins"    value={gami.coins.toLocaleString("pt-BR")} />
                  <StatCard icon={Flame}  label="Streak"   value={`${streak_current} dias`} />
                  <StatCard icon={Trophy} label="Posição"  value={myRankPos ? `${myRankPos}°` : "—"} />
                </>
              )}
            </div>

            {/* Badges */}
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
                <div className="grid grid-cols-4 gap-2">
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
                        className="group flex flex-col items-center gap-1 p-2.5 rounded-xl border border-border/60 hover:border-primary hover:bg-primary transition-colors"
                      >
                        <div className="relative">
                          {(() => {
                            const Icon = BADGE_ICON_MAP[badge.icon];
                            return Icon
                              ? <Icon className={cn("h-6 w-6 transition-colors", earned ? "text-theme-brand group-hover:text-accent" : "text-muted-foreground/40 group-hover:text-accent/50")} />
                              : <span className={cn("text-2xl leading-none block", !earned && "grayscale opacity-35")}>{badge.icon}</span>;
                          })()}
                          {!earned && (
                            <Lock className="absolute -bottom-0.5 -right-1 h-3 w-3 text-muted-foreground/60 group-hover:text-accent/50 transition-colors" />
                          )}
                        </div>
                        <span className={cn(
                          "text-[9px] leading-tight font-medium text-center line-clamp-2 transition-colors",
                          earned ? "text-foreground group-hover:text-accent" : "text-muted-foreground group-hover:text-accent/50"
                        )}>
                          {badge.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* XP History */}
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
                          {(() => { const Icon = EVENT_ICONS[ev.event_type] ?? Zap; return <Icon className="h-4 w-4 shrink-0 text-theme-brand" />; })()}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">
                              {ev.description || ev.event_type.replace(/_/g, " ")}
                            </p>
                            <p className="text-[10px] text-muted-foreground font-light">
                              {format(new Date(ev.created_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}
                            </p>
                          </div>
                          <span className="text-xs font-bold text-theme-brand shrink-0">
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
        )}

      </div>

      {/* ── Confirm Dialog (Loja) ─────────────────────────────────────────────── */}
      <Dialog open={!!confirmItem} onOpenChange={open => !open && setConfirmItem(null)}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>Confirmar resgate</DialogTitle>
          </DialogHeader>
          {confirmItem && (
            <div className="space-y-3 py-2">
              <div className="text-center text-4xl py-2">
                {CATEGORY_EMOJIS[confirmItem.category] || "🎁"}
              </div>
              <p className="text-center font-bold">{confirmItem.title}</p>
              {confirmItem.description && (
                <p className="text-center text-sm text-muted-foreground">{confirmItem.description}</p>
              )}
              <div className="flex items-center justify-center gap-2 py-2 bg-primary/5 rounded-lg">
                <Coins className="h-5 w-5 text-theme-brand/60" />
                <p className="text-sm">
                  Você vai usar <span className="font-bold">{confirmItem.coins_cost.toLocaleString("pt-BR")} coins</span>.
                </p>
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Saldo após resgate:{" "}
                <span className="font-bold">
                  {(gami.coins - confirmItem.coins_cost).toLocaleString("pt-BR")} coins
                </span>
              </p>
            </div>
          )}
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setConfirmItem(null)} disabled={redeeming}>
              Cancelar
            </Button>
            <Button
              className="bg-primary text-white"
              onClick={handleRedeem}
              disabled={redeeming || !confirmItem || gami.coins < (confirmItem?.coins_cost ?? 0)}
            >
              {redeeming ? "Processando..." : "Confirmar resgate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Badge Detail Modal ────────────────────────────────────────────────── */}
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
  icon: Icon, label, value, accent,
}: {
  icon: React.ElementType; label: string; value: string; accent?: boolean;
}) => (
  <div className={cn(
    "rounded-xl border p-3 flex flex-col gap-1",
    accent ? "border-primary/30 bg-primary/5" : "bg-card border-border"
  )}>
    <Icon className={cn("h-5 w-5", accent ? "text-theme-brand" : "text-muted-foreground")} />
    <p className="text-[11px] text-muted-foreground font-light leading-tight">{label}</p>
    <p className={cn("text-lg font-bold leading-tight tabular-nums", accent && "text-theme-brand")}>
      {value}
    </p>
  </div>
);

const PodiumItem = ({
  entry, podiumHeight, medalColor, medalSize = "h-5 w-5", crown,
}: {
  entry: RankingEntry; podiumHeight: string; medalColor: string; medalSize?: string; crown?: boolean;
}) => (
  <div className="flex flex-col items-center gap-1 flex-1 max-w-[90px]">
    {crown && <Crown className="h-5 w-5 text-theme-brand -mb-1" />}
    <Avatar className={cn("ring-2 ring-offset-1 ring-border", crown ? "h-12 w-12" : "h-9 w-9")}>
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
      entry.isMe && "text-theme-brand"
    )}>
      {entry.name}{entry.isMe && " (eu)"}
    </p>
    <div className={cn(
      "w-full rounded-t-lg flex flex-col items-center justify-end pb-2 pt-1 gap-0.5",
      podiumHeight,
      crown ? "bg-primary/10" : "bg-muted/50"
    )}>
      <Medal className={medalSize} style={{ color: medalColor }} />
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
    <p className={cn("flex-1 text-sm font-medium truncate", entry.isMe && "text-theme-brand")}>
      {entry.name}
      {entry.isMe && <span className="ml-1 text-xs font-normal opacity-70">(você)</span>}
    </p>
    <div className="flex items-center gap-1 shrink-0">
      <Zap
        className="h-3 w-3"
        style={{ fill: "var(--theme-brand-on-bg)", color: "var(--theme-brand-on-bg)" }}
      />
      <span className="text-xs font-bold tabular-nums">
        {entry.xp_total.toLocaleString("pt-BR")}
      </span>
    </div>
  </div>
);

export default Recompensas;
