import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGamification } from "@/contexts/GamificationContext";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Zap, Flame, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────
interface VocabWord {
  id: string;
  word: string;
  translation: string | null;
  example_sentence: string | null;
  difficulty: number;
}

interface DailyMission {
  id: string;
  exercises_done: number;
  exercises_total: number;
  xp_earned: number;
  completed: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ─── SVG Hangman ─────────────────────────────────────────────────────────────
const HangmanSVG = ({ errors }: { errors: number }) => (
  <svg viewBox="0 0 120 140" className="w-full max-w-[180px] mx-auto" strokeLinecap="round">
    <line x1="10" y1="135" x2="110" y2="135" stroke="#520A70" strokeWidth="3" />
    <line x1="30" y1="135" x2="30" y2="10" stroke="#520A70" strokeWidth="3" />
    <line x1="30" y1="10" x2="75" y2="10" stroke="#520A70" strokeWidth="3" />
    <line x1="75" y1="10" x2="75" y2="25" stroke="#520A70" strokeWidth="3" />
    {errors >= 1 && <circle cx="75" cy="35" r="10" stroke="#520A70" strokeWidth="2.5" fill="none" />}
    {errors >= 2 && <line x1="75" y1="45" x2="75" y2="90" stroke="#520A70" strokeWidth="2.5" />}
    {errors >= 3 && <line x1="75" y1="58" x2="55" y2="75" stroke="#520A70" strokeWidth="2.5" />}
    {errors >= 4 && <line x1="75" y1="58" x2="95" y2="75" stroke="#520A70" strokeWidth="2.5" />}
    {errors >= 5 && <line x1="75" y1="90" x2="55" y2="115" stroke="#520A70" strokeWidth="2.5" />}
    {errors >= 6 && <line x1="75" y1="90" x2="95" y2="115" stroke="#520A70" strokeWidth="2.5" />}
  </svg>
);

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const Keyboard = ({
  guessed, correctLetters, onLetter, disabled,
}: {
  guessed: Set<string>; correctLetters: Set<string>; onLetter: (l: string) => void; disabled: boolean;
}) => (
  <div className="flex flex-wrap justify-center gap-1.5 max-w-xs mx-auto">
    {LETTERS.map(letter => {
      const isGuessed = guessed.has(letter);
      const isCorrect = correctLetters.has(letter);
      const isWrong = isGuessed && !isCorrect;
      return (
        <button key={letter} onClick={() => onLetter(letter)} disabled={isGuessed || disabled}
          className={cn(
            "w-9 h-9 rounded-lg text-sm font-bold transition-all border-2",
            !isGuessed && "border-border bg-card hover:border-primary hover:bg-primary/5",
            isCorrect && "border-green-500 bg-green-500/10 text-green-700",
            isWrong && "border-red-300 bg-red-50 text-red-400 opacity-60"
          )}
        >{letter}</button>
      );
    })}
  </div>
);

const WordDisplay = ({ word, revealed, gameOver, won }: { word: string; revealed: Set<string>; gameOver: boolean; won: boolean; }) => {
  const letters = word.toUpperCase().split("");
  return (
    <div className="flex flex-wrap justify-center gap-2 py-4">
      {letters.map((char, i) => {
        const isLetter = /[A-Z]/.test(char);
        const show = !isLetter || revealed.has(char) || gameOver;
        return (
          <div key={i} className={cn("flex flex-col items-center", !isLetter && "opacity-40")}>
            <span className={cn("text-xl font-bold min-w-[1.5rem] text-center", gameOver && !won && !revealed.has(char) && isLetter && "text-red-500")}>
              {show ? char : " "}
            </span>
            {isLetter && <div className={cn("h-0.5 w-5 mt-1 rounded", show ? "bg-primary" : "bg-muted-foreground/40")} />}
          </div>
        );
      })}
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const StepByStep = () => {
  const { profile } = useAuth();
  const { gamification, refresh: refreshGamification } = useGamification();

  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [levelId, setLevelId] = useState<string | null>(null);
  const [mission, setMission] = useState<DailyMission | null>(null);
  const [missionLoading, setMissionLoading] = useState(true);
  const [word, setWord] = useState<VocabWord | null>(null);
  const [guessed, setGuessed] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState(0);
  const [gameState, setGameState] = useState<"playing" | "won" | "lost" | "no_vocab">("playing");
  const [sessionXp, setSessionXp] = useState(0);
  const [freePlay, setFreePlay] = useState(false);
  const [celebrateWin, setCelebrateWin] = useState(false);

  const MAX_ERRORS = 6;

  useEffect(() => {
    if (!profile) return;
    loadStudent();
  }, [profile]);

  const loadStudent = async () => {
    if (!profile) return;
    const { data: student } = await supabase
      .from("students").select("id, level_id").eq("user_id", profile.id).maybeSingle();
    if (!student) { setLoading(false); return; }
    setStudentId(student.id);
    setLevelId(student.level_id);
    setLoading(false);
    await loadOrCreateMission(student.id);
    await loadNewWord(student.level_id, student.id);
  };

  const loadOrCreateMission = async (sid: string) => {
    setMissionLoading(true);
    const today = new Date().toISOString().split("T")[0];
    const { data: existing } = await db
      .from("daily_missions")
      .select("id, exercises_done, exercises_total, xp_earned, completed")
      .eq("student_id", sid).eq("date", today).maybeSingle();

    if (existing) {
      setMission(existing as DailyMission);
    } else {
      const { data: created } = await db
        .from("daily_missions")
        .insert({ student_id: sid, date: today })
        .select("id, exercises_done, exercises_total, xp_earned, completed")
        .single();
      if (created) setMission(created as DailyMission);
    }
    setMissionLoading(false);
  };

  const loadNewWord = async (lid: string | null) => {
    if (!lid) { setGameState("no_vocab"); return; }
    const useEasy = Math.random() < 0.7;
    const diffFilter = useEasy ? [1] : [2, 3];

    let { data: words } = await db
      .from("vocabulary")
      .select("id, word, translation, example_sentence, difficulty")
      .eq("level_id", lid).eq("active", true).in("difficulty", diffFilter);

    if (!words || words.length === 0) {
      const { data: allWords } = await db
        .from("vocabulary")
        .select("id, word, translation, example_sentence, difficulty")
        .eq("level_id", lid).eq("active", true);
      words = allWords;
    }

    if (!words || words.length === 0) { setGameState("no_vocab"); setWord(null); return; }
    const random = words[Math.floor(Math.random() * words.length)] as VocabWord;
    setWord(random);
    setGuessed(new Set());
    setErrors(0);
    setGameState("playing");
    setCelebrateWin(false);
  };

  const wordLetters = word ? new Set(word.word.toUpperCase().split("").filter(c => /[A-Z]/.test(c))) : new Set<string>();
  const correctLetters = new Set([...guessed].filter(l => wordLetters.has(l)));

  const handleWin = async () => {
    const sid = studentId;
    if (!sid || !word) return;
    const xpGain = 15; const coinsGain = 8;
    const currentXp = gamification.xp_total;
    const currentCoins = gamification.coins;

    await db.from("student_gamification").update({
      xp_total: currentXp + xpGain, coins: currentCoins + coinsGain, updated_at: new Date().toISOString(),
    }).eq("student_id", sid);

    await db.from("xp_events").insert({
      student_id: sid, event_type: "stepbystep", xp: xpGain, coins: coinsGain, description: `Forca correto: ${word.word}`,
    });

    await db.from("stepbystep_attempts").insert({
      student_id: sid, vocabulary_id: word.id, exercise_type: "hangman", correct: true, xp_earned: xpGain, mission_id: mission?.id || null,
    });

    setSessionXp(prev => prev + xpGain);

    if (mission && !mission.completed) {
      const newDone = mission.exercises_done + 1;
      const nowComplete = newDone >= mission.exercises_total;
      const missionUpdate: Record<string, unknown> = {
        exercises_done: newDone, xp_earned: (mission.xp_earned || 0) + xpGain,
      };
      if (nowComplete) {
        missionUpdate.completed = true;
        missionUpdate.completed_at = new Date().toISOString();
        const bonusXp = 50; const bonusCoins = 25;
        await db.from("xp_events").insert({
          student_id: sid, event_type: "daily_mission", xp: bonusXp, coins: bonusCoins, description: "Missão diária concluída! 🎯",
        });
        await db.from("student_gamification").update({
          xp_total: currentXp + xpGain + bonusXp, coins: currentCoins + coinsGain + bonusCoins, updated_at: new Date().toISOString(),
        }).eq("student_id", sid);
        setSessionXp(prev => prev + bonusXp);
        missionUpdate.xp_earned = (mission.xp_earned || 0) + xpGain + bonusXp;
      }
      await db.from("daily_missions").update(missionUpdate).eq("id", mission.id);
      setMission(prev => prev ? {
        ...prev, exercises_done: newDone, completed: nowComplete || prev.completed,
        xp_earned: (prev.xp_earned || 0) + xpGain + (nowComplete ? 50 : 0),
      } : prev);
    }
    await refreshGamification();
  };

  const handleLoss = async () => {
    const sid = studentId;
    if (!sid || !word) return;
    const xpGain = 3;
    await db.from("student_gamification").update({
      xp_total: gamification.xp_total + xpGain, updated_at: new Date().toISOString(),
    }).eq("student_id", sid);
    await db.from("xp_events").insert({
      student_id: sid, event_type: "stepbystep", xp: xpGain, coins: 0, description: `Forca errado: ${word.word}`,
    });
    await db.from("stepbystep_attempts").insert({
      student_id: sid, vocabulary_id: word.id, exercise_type: "hangman", correct: false, xp_earned: xpGain, mission_id: mission?.id || null,
    });
    setSessionXp(prev => prev + xpGain);
    await refreshGamification();
  };

  const handleGuess = useCallback(
    async (letter: string) => {
      if (!word || gameState !== "playing") return;
      const upper = letter.toUpperCase();
      if (guessed.has(upper)) return;
      const wLetters = new Set(word.word.toUpperCase().split("").filter(c => /[A-Z]/.test(c)));
      const newGuessed = new Set(guessed).add(upper);
      const isCorrect = wLetters.has(upper);
      const newErrors = isCorrect ? errors : errors + 1;
      const newCorrect = new Set([...newGuessed].filter(l => wLetters.has(l)));
      const newWon = [...wLetters].every(l => newCorrect.has(l));
      const newLost = newErrors >= MAX_ERRORS;
      setGuessed(newGuessed);
      setErrors(newErrors);
      if (newWon) { setGameState("won"); setCelebrateWin(true); await handleWin(); }
      else if (newLost) { setGameState("lost"); await handleLoss(); }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [word, guessed, errors, gameState, handleWin, handleLoss]
  );

  const handleNextWord = () => { loadNewWord(levelId); };

  if (loading) {
    return (
      <StudentLayout>
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </StudentLayout>
    );
  }

  const missionDone = mission?.completed ?? false;
  const missionProgress = mission ? Math.min((mission.exercises_done / mission.exercises_total) * 100, 100) : 0;
  const isPlaying = gameState === "playing";

  return (
    <StudentLayout>
      <div className="space-y-4">
        <Card>
          <CardContent className="py-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">Missão do dia</span>
                {missionDone && (
                  <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">Concluída! +50 XP</Badge>
                )}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground font-light">
                <Zap className="h-3 w-3 fill-lime text-lime" />{mission?.xp_earned ?? 0} XP hoje
              </div>
            </div>
            {missionLoading ? <Skeleton className="h-2 w-full rounded" /> : (
              <>
                <Progress value={missionProgress} className="h-2" />
                <p className="text-xs text-muted-foreground font-light">{mission?.exercises_done ?? 0}/{mission?.exercises_total ?? 10} exercícios</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{missionDone && !freePlay ? "Prática Livre" : "Mini-game Forca"}</CardTitle>
              <span className="text-xs text-muted-foreground font-light">{errors}/{MAX_ERRORS} erros</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {gameState === "no_vocab" ? (
              <div className="py-8 text-center space-y-2">
                <p className="font-bold text-sm">Nenhuma palavra cadastrada</p>
                <p className="text-xs text-muted-foreground font-light">Peça ao professor para adicionar vocabulário ao seu nível.</p>
              </div>
            ) : (
              <>
                <HangmanSVG errors={errors} />
                {word && <WordDisplay word={word.word} revealed={correctLetters} gameOver={gameState !== "playing"} won={gameState === "won"} />}
                {gameState === "won" && (
                  <div className="space-y-2">
                    <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
                      <p className="font-bold text-green-700 text-sm">{celebrateWin ? "🎉 Correto! " : ""}+15 XP +8 🪙</p>
                    </div>
                    {word?.translation && <p className="text-xs text-center text-muted-foreground font-light"><span className="font-bold">{word.word}</span> = {word.translation}</p>}
                    {word?.example_sentence && <p className="text-xs text-center text-muted-foreground italic font-light">"{word.example_sentence}"</p>}
                  </div>
                )}
                {gameState === "lost" && (
                  <div className="space-y-2">
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
                      <p className="font-bold text-red-600 text-sm">A palavra era: <span className="uppercase">{word?.word}</span></p>
                      <p className="text-xs text-muted-foreground font-light mt-1">+3 XP por tentar</p>
                    </div>
                    {word?.example_sentence && <p className="text-xs text-center text-muted-foreground italic font-light">"{word.example_sentence}"</p>}
                  </div>
                )}
                {isPlaying && <Keyboard guessed={guessed} correctLetters={correctLetters} onLetter={handleGuess} disabled={!isPlaying} />}
                {(gameState === "won" || gameState === "lost") && (
                  <Button className="w-full bg-lime text-steps-black hover:bg-lime/90 font-bold" onClick={handleNextWord}>
                    {gameState === "won" ? "Próxima palavra →" : "Tentar outra →"}
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {gamification.streak_current > 0 ? <Flame className="h-5 w-5 text-orange-500" /> : <Flame className="h-5 w-5 text-muted-foreground" />}
                <div>
                  <p className="text-sm font-bold">{gamification.streak_current > 0 ? `${gamification.streak_current} dias seguidos 🔥` : "Sem streak ativo"}</p>
                  <p className="text-xs text-muted-foreground font-light">{gamification.streak_current > 0 ? "Continue amanhã para manter o streak!" : "Faça sua missão hoje para começar um streak."}</p>
                </div>
              </div>
              {gamification.streak_best > 0 && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground font-light">Melhor</p>
                  <p className="text-sm font-bold">{gamification.streak_best}d</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {missionDone && !freePlay && (
          <Card className="border-lime/40 bg-lime/5">
            <CardContent className="py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-primary">Missão concluída! 🎯</p>
                <p className="text-xs text-muted-foreground font-light">Continue praticando por diversão.</p>
              </div>
              <Button size="sm" className="bg-lime text-steps-black hover:bg-lime/90 font-bold shrink-0" onClick={() => setFreePlay(true)}>
                <Zap className="h-4 w-4 mr-1" />Continuar
              </Button>
            </CardContent>
          </Card>
        )}

        {sessionXp > 0 && (
          <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground font-light pb-2">
            <Zap className="h-4 w-4 fill-lime text-lime" />
            <span><span className="font-bold text-primary">+{sessionXp} XP</span> nesta sessão</span>
          </div>
        )}
      </div>
    </StudentLayout>
  );
};

export default StepByStep;
