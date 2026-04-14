import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGamification } from "@/contexts/GamificationContext";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Lock, Trophy, Flame, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import steppieOrgulhoso from "@/assets/steppie/steppie-orgulhoso.svg";
import steppieGritando2 from "@/assets/steppie/steppie-gritando-2.svg";

const db = supabase as any;

interface StepProgress {
  number: number;
  status: "locked" | "available" | "done";
}

interface RankingEntry {
  student_id: string;
  name: string;
  xp_total: number;
  streak_current: number;
  language_name: string;
  rank: number;
  isMe: boolean;
}

// ─── Progress tab ────────────────────────────────────────────────────────────
const ProgressTab = () => {
  const { profile } = useAuth();
  const [steps, setSteps] = useState<StepProgress[]>([]);
  const [levelName, setLevelName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    loadProgress();
  }, [profile]);

  const loadProgress = async () => {
    if (!profile) return;
    const { data: student } = await supabase
      .from("students")
      .select("id, level_id, current_step_id, steps!students_current_step_id_fkey(number)")
      .eq("user_id", profile.id)
      .single();

    if (!student || !student.level_id) { setLoading(false); return; }

    const { data: level } = await supabase
      .from("levels")
      .select("name, code, total_steps")
      .eq("id", student.level_id)
      .single();

    if (level) setLevelName(`${level.name} · ${level.code}`);

    const totalSteps = level?.total_steps || 40;
    const s = student as any;
    const currentStepNumber: number = s.steps?.number ?? 1;

    const { data: progressRecords } = await supabase
      .from("student_progress")
      .select("step_id, status, steps(number)")
      .eq("student_id", student.id);

    const doneSet = new Set<number>();
    if (progressRecords) {
      progressRecords.forEach((p: any) => {
        if (p.status === "done" && p.steps?.number) doneSet.add(p.steps.number);
      });
    }

    const stepsArray: StepProgress[] = [];
    for (let i = 1; i <= totalSteps; i++) {
      if (doneSet.has(i)) stepsArray.push({ number: i, status: "done" });
      else if (i === currentStepNumber) stepsArray.push({ number: i, status: "available" });
      else stepsArray.push({ number: i, status: "locked" });
    }

    setSteps(stepsArray);
    setLoading(false);
  };

  const doneCount = steps.filter(s => s.status === "done").length;
  const total = steps.length || 40;
  const percent = Math.round((doneCount / total) * 100);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xl">Progresso</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-6 w-48" />
          ) : (
            <>
              <p className="text-sm text-muted-foreground font-light">{levelName}</p>
              <p className="text-2xl font-bold text-primary mt-1">{percent}% concluído</p>
            </>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 20 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : steps.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhum passo configurado ainda.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-2">
            {steps.map(step => (
              <div
                key={step.number}
                className={cn(
                  "aspect-square rounded-lg flex flex-col items-center justify-center text-sm transition-colors",
                  step.status === "done" && "bg-primary text-primary-foreground",
                  step.status === "available" && "border-2 border-primary text-primary bg-card",
                  step.status === "locked" && "bg-muted text-muted-foreground"
                )}
              >
                {step.status === "done" ? (
                  <><Check className="h-4 w-4 text-lime" /><span className="text-xs font-bold mt-0.5">{step.number}</span></>
                ) : step.status === "locked" ? (
                  <><Lock className="h-3 w-3" /><span className="text-xs mt-0.5">{step.number}</span></>
                ) : (
                  <span className="text-base font-bold">{step.number}</span>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-5 pt-2 pb-1">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-primary flex items-center justify-center">
                <Check className="h-2.5 w-2.5 text-lime" />
              </div>
              <span className="text-xs text-muted-foreground font-light">Concluído</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded border-2 border-primary bg-card" />
              <span className="text-xs text-muted-foreground font-light">Atual</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-muted flex items-center justify-center">
                <Lock className="h-2.5 w-2.5 text-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground font-light">Bloqueado</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ─── Ranking tab ─────────────────────────────────────────────────────────────
const RankingTab = () => {
  const { profile } = useAuth();
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [myEntry, setMyEntry] = useState<RankingEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [languages, setLanguages] = useState<{ id: string; name: string }[]>([]);
  const [langFilter, setLangFilter] = useState<string>("all");

  useEffect(() => {
    if (!profile) return;
    loadRanking();
  }, [profile, langFilter]);

  const loadRanking = async () => {
    setLoading(true);
    try {
      // Get my student id
      const { data: me } = await supabase
        .from("students")
        .select("id, language_id, languages!students_language_id_fkey(name)")
        .eq("user_id", profile!.id)
        .maybeSingle();

      // Get all languages for filter
      const { data: langs } = await supabase
        .from("languages").select("id, name").eq("active", true);
      if (langs) setLanguages(langs);

      // Get top students via gamification
      let query = db
        .from("student_gamification")
        .select(`
          student_id, xp_total, streak_current,
          students!inner(
            user_id, language_id,
            profiles!students_user_id_fkey(name),
            languages!students_language_id_fkey(name)
          )
        `)
        .order("xp_total", { ascending: false })
        .limit(50);

      const { data: gami } = await query;

      if (!gami) { setLoading(false); return; }

      // Filter by language if needed
      const filtered = langFilter === "all"
        ? gami
        : gami.filter((g: any) => g.students?.language_id === langFilter);

      const top10 = filtered.slice(0, 10);

      const entries: RankingEntry[] = top10.map((g: any, index: number) => {
        const p = g.students?.profiles;
        const fullName: string = Array.isArray(p) ? (p[0]?.name || "—") : (p?.name || "—");
        const firstName = fullName.split(" ")[0];
        const langName = Array.isArray(g.students?.languages) ? g.students?.languages[0]?.name : g.students?.languages?.name || "—";
        return {
          student_id: g.student_id,
          name: firstName,
          xp_total: g.xp_total,
          streak_current: g.streak_current,
          language_name: langName,
          rank: index + 1,
          isMe: g.student_id === me?.id,
        };
      });

      setRanking(entries);

      // Check if I'm in top 10
      const iAmInTop = entries.some(e => e.isMe);
      if (!iAmInTop && me) {
        // Find my position in full list
        const myIndex = filtered.findIndex((g: any) => g.student_id === me.id);
        if (myIndex >= 0) {
          const g = filtered[myIndex];
          const p = g.students?.profiles;
          const fullName: string = Array.isArray(p) ? (p[0]?.name || "—") : (p?.name || "—");
          setMyEntry({
            student_id: g.student_id,
            name: fullName.split(" ")[0],
            xp_total: g.xp_total,
            streak_current: g.streak_current,
            language_name: Array.isArray(g.students?.languages) ? g.students?.languages[0]?.name : g.students?.languages?.name || "—",
            rank: myIndex + 1,
            isMe: true,
          });
        }
      } else {
        setMyEntry(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const MEDAL = ["🥇", "🥈", "🥉"];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Top 10 por XP
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {/* Language filter */}
          <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-none">
            <button
              onClick={() => setLangFilter("all")}
              className={cn("shrink-0 text-xs px-3 py-1 rounded-full border transition-colors", langFilter === "all" ? "bg-primary text-white border-primary" : "border-border text-muted-foreground")}
            >
              Todos
            </button>
            {languages.map(l => (
              <button
                key={l.id}
                onClick={() => setLangFilter(l.id)}
                className={cn("shrink-0 text-xs px-3 py-1 rounded-full border transition-colors", langFilter === l.id ? "bg-primary text-white border-primary" : "border-border text-muted-foreground")}
              >
                {l.name}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : ranking.length === 0 ? (
            <div className="py-8 text-center">
              <Trophy className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum aluno no ranking ainda.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {ranking.map(entry => (
                <div
                  key={entry.student_id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border transition-colors",
                    entry.isMe ? "border-primary bg-primary/5" : "border-transparent bg-muted/30"
                  )}
                >
                  {/* Rank */}
                  <div className="w-8 text-center shrink-0">
                    {entry.rank <= 3 ? (
                      <span className="text-xl">{MEDAL[entry.rank - 1]}</span>
                    ) : (
                      <span className="text-sm font-bold text-muted-foreground">{entry.rank}°</span>
                    )}
                  </div>

                  {/* Name + language */}
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-bold truncate", entry.isMe && "text-primary")}>
                      {entry.name} {entry.isMe && <span className="text-xs font-normal">(você)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground font-light">{entry.language_name}</p>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-3 shrink-0">
                    {entry.streak_current > 0 && (
                      <div className="flex items-center gap-0.5 text-xs text-orange-500">
                        <Flame className="h-3 w-3" />
                        <span className="font-bold">{entry.streak_current}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-0.5 text-xs text-primary">
                      <Zap className="h-3 w-3 fill-lime text-lime" />
                      <span className="font-bold">{entry.xp_total.toLocaleString("pt-BR")}</span>
                    </div>
                  </div>
                </div>
              ))}

              {/* My position if outside top 10 */}
              {myEntry && (
                <>
                  <div className="text-center text-xs text-muted-foreground py-1">• • •</div>
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-primary bg-primary/5">
                    <div className="w-8 text-center shrink-0">
                      <span className="text-sm font-bold text-primary">{myEntry.rank}°</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-primary truncate">{myEntry.name} <span className="text-xs font-normal">(você)</span></p>
                      <p className="text-xs text-muted-foreground font-light">{myEntry.language_name}</p>
                    </div>
                    <div className="flex items-center gap-0.5 text-xs text-primary shrink-0">
                      <Zap className="h-3 w-3 fill-lime text-lime" />
                      <span className="font-bold">{myEntry.xp_total.toLocaleString("pt-BR")}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────
const ProgressPage = () => (
  <StudentLayout>
    <Tabs defaultValue="progresso">
      <TabsList className="w-full mb-4">
        <TabsTrigger value="progresso" className="flex-1">Passos</TabsTrigger>
        <TabsTrigger value="ranking" className="flex-1">🏆 Ranking</TabsTrigger>
      </TabsList>
      <TabsContent value="progresso">
        <ProgressTab />
      </TabsContent>
      <TabsContent value="ranking">
        <RankingTab />
      </TabsContent>
    </Tabs>
  </StudentLayout>
);

export default ProgressPage;
