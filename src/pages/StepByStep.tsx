import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGamification } from "@/contexts/GamificationContext";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Zap, Flame, CheckCircle2, RotateCcw, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
const steppieGritando = "/steppie/steppie-gritando.webp";

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
    <line x1="10" y1="135" x2="110" y2="135" stroke="var(--theme-primary)" strokeWidth="3" />
    <line x1="30" y1="135" x2="30" y2="10" stroke="var(--theme-primary)" strokeWidth="3" />
    <line x1="30" y1="10" x2="75" y2="10" stroke="var(--theme-primary)" strokeWidth="3" />
    <line x1="75" y1="10" x2="75" y2="25" stroke="var(--theme-primary)" strokeWidth="3" />
    {errors >= 1 && <circle cx="75" cy="35" r="10" stroke="var(--theme-primary)" strokeWidth="2.5" fill="none" />}
    {errors >= 2 && <line x1="75" y1="45" x2="75" y2="90" stroke="var(--theme-primary)" strokeWidth="2.5" />}
    {errors >= 3 && <line x1="75" y1="58" x2="55" y2="75" stroke="var(--theme-primary)" strokeWidth="2.5" />}
    {errors >= 4 && <line x1="75" y1="58" x2="95" y2="75" stroke="var(--theme-primary)" strokeWidth="2.5" />}
    {errors >= 5 && <line x1="75" y1="90" x2="55" y2="115" stroke="var(--theme-primary)" strokeWidth="2.5" />}
    {errors >= 6 && <line x1="75" y1="90" x2="95" y2="115" stroke="var(--theme-primary)" strokeWidth="2.5" />}
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

const WordDisplay = ({ word, revealed, gameOver, won }: { word: string; revealed: Set<string>; gameOver: boolean; won: boolean }) => {
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

// ─── Fill in the blank game ───────────────────────────────────────────────────
const FillBlankGame = ({
  words, studentId, mission, onMissionUpdate, onSessionXp,
}: {
  words: VocabWord[];
  studentId: string;
  mission: DailyMission | null;
  onMissionUpdate: (m: DailyMission) => void;
  onSessionXp: (xp: number) => void;
}) => {
  const { gamification, refresh: refreshGamification } = useGamification();
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [results, setResults] = useState<{ correct: number; wrong: number; xp: number }>({ correct: 0, wrong: 0, xp: 0 });
  const [done, setDone] = useState(false);

  const SESSION_SIZE = Math.min(8, words.filter(w => w.example_sentence).length);
  const sessionWords = words.filter(w => w.example_sentence).slice(0, SESSION_SIZE);

  const buildQuestion = (w: VocabWord) => {
    const sentence = w.example_sentence || "";
    // Replace the word (case-insensitive) in the sentence with ___
    const regex = new RegExp(w.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    return { question: sentence.replace(regex, "___"), word: w.word };
  };

  const awardXp = useCallback(async (correct: boolean, w: VocabWord) => {
    const xpGain = correct ? 12 : 2;
    const coinsGain = correct ? 6 : 0;

    await db.from("student_gamification").update({
      xp_total: gamification.xp_total + xpGain,
      coins: gamification.coins + coinsGain,
      updated_at: new Date().toISOString(),
    }).eq("student_id", studentId);

    await db.from("xp_events").insert({
      student_id: studentId,
      event_type: "stepbystep",
      xp: xpGain,
      coins: coinsGain,
      description: `Preencha a lacuna ${correct ? "correto" : "errado"}: ${w.word}`,
    });

    await db.from("stepbystep_attempts").insert({
      student_id: studentId,
      vocabulary_id: w.id,
      exercise_type: "fill_blank",
      correct,
      xp_earned: xpGain,
      mission_id: mission?.id ?? null,
    });

    onSessionXp(xpGain);

    if (mission && !mission.completed) {
      const newDone = mission.exercises_done + 1;
      const nowComplete = newDone >= mission.exercises_total;
      const missionUpdate: Record<string, unknown> = {
        exercises_done: newDone,
        xp_earned: (mission.xp_earned || 0) + xpGain,
      };
      if (nowComplete) {
        missionUpdate.completed = true;
        missionUpdate.completed_at = new Date().toISOString();
        const bonusXp = 50; const bonusCoins = 25;
        await db.from("xp_events").insert({
          student_id: studentId, event_type: "daily_mission", xp: bonusXp, coins: bonusCoins, description: "Missão diária concluída! 🎯",
        });
        await db.from("student_gamification").update({
          xp_total: gamification.xp_total + xpGain + bonusXp,
          coins: gamification.coins + coinsGain + bonusCoins,
          updated_at: new Date().toISOString(),
        }).eq("student_id", studentId);
        onSessionXp(bonusXp);
        missionUpdate.xp_earned = (mission.xp_earned || 0) + xpGain + bonusXp;
        toast({ title: "🎯 Missão concluída!", description: "+50 XP de bônus!" });
      }
      await db.from("daily_missions").update(missionUpdate).eq("id", mission.id);
      onMissionUpdate({
        ...mission,
        exercises_done: newDone,
        completed: nowComplete || mission.completed,
        xp_earned: (mission.xp_earned || 0) + xpGain + (nowComplete ? 50 : 0),
      });
    }

    await refreshGamification();
    return xpGain;
  }, [studentId, gamification, mission, onMissionUpdate, onSessionXp, refreshGamification]);

  const handleSubmit = async () => {
    if (!answer.trim() || feedback) return;
    const w = sessionWords[index];
    const correct = answer.trim().toLowerCase() === w.word.toLowerCase();
    setFeedback(correct ? "correct" : "wrong");
    const xp = await awardXp(correct, w);
    setResults(prev => ({
      correct: prev.correct + (correct ? 1 : 0),
      wrong: prev.wrong + (correct ? 0 : 1),
      xp: prev.xp + xp,
    }));
  };

  const handleNext = () => {
    if (index + 1 >= SESSION_SIZE) {
      setDone(true);
    } else {
      setIndex(i => i + 1);
      setAnswer("");
      setFeedback(null);
    }
  };

  const handleRestart = () => {
    setIndex(0);
    setAnswer("");
    setFeedback(null);
    setResults({ correct: 0, wrong: 0, xp: 0 });
    setDone(false);
  };

  if (sessionWords.length === 0) {
    return (
      <div className="py-8 text-center space-y-2">
        <p className="font-bold text-sm">Nenhuma frase de exemplo cadastrada</p>
        <p className="text-xs text-muted-foreground font-light">Peça ao professor para adicionar exemplos ao vocabulário.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <div className="py-4">
          <p className="text-4xl mb-2">✏️</p>
          <p className="font-bold text-lg">Sessão concluída!</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="p-3"><p className="text-2xl font-bold text-green-600">{results.correct}</p><p className="text-xs text-muted-foreground">Acertou</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-2xl font-bold text-red-500">{results.wrong}</p><p className="text-xs text-muted-foreground">Errou</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-2xl font-bold text-primary">+{results.xp}</p><p className="text-xs text-muted-foreground">XP</p></CardContent></Card>
        </div>
        <Button className="w-full font-bold" style={{ background: 'var(--theme-accent)', color: 'var(--theme-text-on-accent)' }} onClick={handleRestart}>
          <RotateCcw className="h-4 w-4 mr-2" /> Nova sessão
        </Button>
      </div>
    );
  }

  const w = sessionWords[index];
  const { question } = buildQuestion(w);

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground font-light">
          <span>{index + 1}/{SESSION_SIZE}</span>
          <span>{results.correct} ✓  {results.wrong} ✗</span>
        </div>
        <Progress value={(index / SESSION_SIZE) * 100} className="h-1.5" />
      </div>

      {/* Question */}
      <div className="p-4 rounded-xl bg-muted/40 space-y-2">
        <p className="text-xs text-muted-foreground font-light uppercase tracking-wide">Complete a frase</p>
        <p className="text-base leading-relaxed font-medium">
          {question.split("___").map((part, i, arr) => (
            <span key={i}>
              {part}
              {i < arr.length - 1 && (
                <span className={cn(
                  "inline-block border-b-2 px-2 min-w-[60px] text-center font-bold",
                  feedback === "correct" && "border-green-500 text-green-700",
                  feedback === "wrong" && "border-red-400 text-red-500",
                  !feedback && "border-primary"
                )}>
                  {feedback ? w.word : (answer || "\u00A0\u00A0\u00A0")}
                </span>
              )}
            </span>
          ))}
        </p>
        {w.translation && (
          <p className="text-xs text-muted-foreground font-light">Tradução: <span className="font-bold">{w.translation}</span></p>
        )}
      </div>

      {/* Input */}
      {!feedback && (
        <div className="flex gap-2">
          <Input
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            placeholder="Digite a palavra..."
            className="flex-1"
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            autoFocus
          />
          <Button onClick={handleSubmit} disabled={!answer.trim()}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div className="space-y-3">
          <div className={cn("p-3 rounded-lg text-center text-sm font-bold", feedback === "correct" ? "bg-green-500/10 text-green-700 border border-green-500/20" : "bg-red-500/10 text-red-700 border border-red-500/20")}>
            {feedback === "correct" ? "✓ Correto! +12 XP +6 🪙" : `✗ Era "${w.word}" — +2 XP por tentar`}
          </div>
          <Button className="w-full bg-primary text-white" onClick={handleNext}>
            {index + 1 >= SESSION_SIZE ? "Ver resultado →" : "Próxima →"}
          </Button>
        </div>
      )}
    </div>
  );
};

// ─── Distractor loader ───────────────────────────────────────────────────────
const fetchDistractors = async (vocabularyId: string): Promise<string[]> => {
  const { data } = await db
    .from("vocabulary_distractors")
    .select("distractor")
    .eq("vocabulary_id", vocabularyId)
    .limit(3);
  return (data ?? []).map((d: { distractor: string }) => d.distractor);
};

// ─── Translation game (múltipla escolha) ─────────────────────────────────────
const TranslationGame = ({
  words, studentId, mission, onMissionUpdate, onSessionXp,
}: {
  words: VocabWord[];
  studentId: string;
  mission: DailyMission | null;
  onMissionUpdate: (m: DailyMission) => void;
  onSessionXp: (xp: number) => void;
}) => {
  const { gamification, refresh: refreshGamification } = useGamification();

  const SESSION_SIZE = Math.min(10, words.length);

  const buildSession = () =>
    [...words].sort(() => Math.random() - 0.5).slice(0, SESSION_SIZE);

  const buildOptions = async (correct: VocabWord, all: VocabWord[]): Promise<string[]> => {
    const linked = await fetchDistractors(correct.id);
    let distractors: string[];
    if (linked.length >= 3) {
      distractors = linked.slice(0, 3);
    } else {
      const needed = 3 - linked.length;
      const random = all
        .filter(w => w.id !== correct.id && w.translation && !linked.includes(w.translation!))
        .sort(() => Math.random() - 0.5)
        .slice(0, needed)
        .map(w => w.translation!);
      distractors = [...linked, ...random];
    }
    return [...distractors, correct.translation!].sort(() => Math.random() - 0.5);
  };

  const [session, setSession] = useState<VocabWord[]>(() => buildSession());
  const [index, setIndex] = useState(0);
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    buildOptions(session[0], words).then(setOptions);
  }, []);
  const [selected, setSelected] = useState<string | null>(null);
  const [results, setResults] = useState({ correct: 0, wrong: 0, xp: 0 });
  const [done, setDone] = useState(false);

  const current = session[index];
  const answered = selected !== null;

  const awardXp = useCallback(async (correct: boolean, w: VocabWord) => {
    const xpGain = correct ? 12 : 2;
    const coinsGain = correct ? 6 : 0;

    await db.from("student_gamification").update({
      xp_total: gamification.xp_total + xpGain,
      coins: gamification.coins + coinsGain,
      updated_at: new Date().toISOString(),
    }).eq("student_id", studentId);

    await db.from("xp_events").insert({
      student_id: studentId,
      event_type: "stepbystep",
      xp: xpGain,
      coins: coinsGain,
      description: `Tradução ${correct ? "correta" : "errada"}: ${w.word}`,
    });

    await db.from("stepbystep_attempts").insert({
      student_id: studentId,
      vocabulary_id: w.id,
      exercise_type: "translation",
      correct,
      xp_earned: xpGain,
      mission_id: mission?.id ?? null,
    });

    onSessionXp(xpGain);

    if (mission && !mission.completed) {
      const newDone = mission.exercises_done + 1;
      const nowComplete = newDone >= mission.exercises_total;
      const missionUpdate: Record<string, unknown> = {
        exercises_done: newDone,
        xp_earned: (mission.xp_earned || 0) + xpGain,
      };
      if (nowComplete) {
        missionUpdate.completed = true;
        missionUpdate.completed_at = new Date().toISOString();
        await db.from("xp_events").insert({
          student_id: studentId, event_type: "daily_mission",
          xp: 50, coins: 25, description: "Missão diária concluída! 🎯",
        });
        await db.from("student_gamification").update({
          xp_total: gamification.xp_total + xpGain + 50,
          coins: gamification.coins + coinsGain + 25,
          updated_at: new Date().toISOString(),
        }).eq("student_id", studentId);
        onSessionXp(50);
        missionUpdate.xp_earned = (mission.xp_earned || 0) + xpGain + 50;
        toast({ title: "🎯 Missão concluída!", description: "+50 XP de bônus!" });
      }
      await db.from("daily_missions").update(missionUpdate).eq("id", mission.id);
      onMissionUpdate({
        ...mission,
        exercises_done: newDone,
        completed: nowComplete || mission.completed,
        xp_earned: (mission.xp_earned || 0) + xpGain + (nowComplete ? 50 : 0),
      });
    }

    await refreshGamification();
  }, [gamification, studentId, mission, onMissionUpdate, onSessionXp, refreshGamification]);

  const handleSelect = async (option: string) => {
    if (answered) return;
    setSelected(option);
    const correct = option === current.translation;
    setResults(prev => ({
      correct: prev.correct + (correct ? 1 : 0),
      wrong: prev.wrong + (correct ? 0 : 1),
      xp: prev.xp + (correct ? 12 : 2),
    }));
    await awardXp(correct, current);
  };

  const handleNext = async () => {
    if (index + 1 >= SESSION_SIZE) {
      setDone(true);
      return;
    }
    const nextIndex = index + 1;
    setIndex(nextIndex);
    setOptions(await buildOptions(session[nextIndex], words));
    setSelected(null);
  };

  const handleRestart = async () => {
    const newSession = buildSession();
    setSession(newSession);
    setIndex(0);
    setOptions(await buildOptions(newSession[0], words));
    setSelected(null);
    setResults({ correct: 0, wrong: 0, xp: 0 });
    setDone(false);
  };

  if (done) {
    return (
      <div className="space-y-4 py-2">
        <div className="text-center space-y-1">
          <p className="text-3xl">{results.correct >= SESSION_SIZE * 0.7 ? "🎉" : "💪"}</p>
          <p className="font-bold">{results.correct}/{SESSION_SIZE} corretas</p>
          <p className="text-xs text-muted-foreground font-light">+{results.xp} XP ganhos</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
            <p className="font-bold text-green-700">{results.correct}</p>
            <p className="text-xs text-muted-foreground font-light">acertos</p>
          </div>
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="font-bold text-red-600">{results.wrong}</p>
            <p className="text-xs text-muted-foreground font-light">erros</p>
          </div>
        </div>
        <Button className="w-full font-bold" style={{ background: "var(--theme-accent)", color: "var(--theme-text-on-accent)" }} onClick={handleRestart}>
          Jogar de novo
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progresso */}
      <div className="flex items-center justify-between text-xs text-muted-foreground font-light">
        <span>{index + 1}/{SESSION_SIZE}</span>
        <span>+{results.xp} XP</span>
      </div>
      <Progress value={((index + 1) / SESSION_SIZE) * 100} className="h-1.5" />

      {/* Palavra */}
      <div className="py-6 text-center">
        <p className="text-3xl font-bold tracking-wide">{current.word}</p>
        {current.example_sentence && answered && (
          <p className="text-xs text-muted-foreground font-light italic mt-2">"{current.example_sentence}"</p>
        )}
      </div>

      {/* Opções */}
      <div className="grid grid-cols-1 gap-2">
        {options.map(opt => {
          const isCorrect = opt === current.translation;
          const isSelected = opt === selected;
          return (
            <button
              key={opt}
              onClick={() => handleSelect(opt)}
              disabled={answered}
              className={cn(
                "w-full p-3 rounded-xl border-2 text-sm font-bold text-left transition-all",
                !answered && "border-border bg-card hover:border-primary hover:bg-primary/5",
                answered && isCorrect && "border-green-500 bg-green-500/10 text-green-700",
                answered && isSelected && !isCorrect && "border-red-400 bg-red-500/10 text-red-600",
                answered && !isSelected && !isCorrect && "border-border bg-card opacity-50",
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {/* Feedback + próxima */}
      {answered && (
        <Button
          className="w-full font-bold"
          style={{ background: "var(--theme-accent)", color: "var(--theme-text-on-accent)" }}
          onClick={handleNext}
        >
          {index + 1 >= SESSION_SIZE ? "Ver resultado →" : "Próxima →"}
        </Button>
      )}
    </div>
  );
};

// ─── Matching game (pares) ────────────────────────────────────────────────────
type MatchCard = { id: string; text: string; side: "word" | "translation"; wordId: string; matched: boolean };

const MatchingGame = ({
  words, studentId, mission, onMissionUpdate, onSessionXp,
}: {
  words: VocabWord[];
  studentId: string;
  mission: DailyMission | null;
  onMissionUpdate: (m: DailyMission) => void;
  onSessionXp: (xp: number) => void;
}) => {
  const { gamification, refresh: refreshGamification } = useGamification();

  const PAIRS = 6;

  const buildSession = () => {
    const pool = words.filter(w => w.translation).sort(() => Math.random() - 0.5).slice(0, PAIRS);
    const wordCards: MatchCard[] = pool.map(w => ({
      id: `w-${w.id}`, text: w.word, side: "word", wordId: w.id, matched: false,
    }));
    const translationCards: MatchCard[] = pool
      .sort(() => Math.random() - 0.5)
      .map(w => ({
        id: `t-${w.id}`, text: w.translation!, side: "translation", wordId: w.id, matched: false,
      }));
    return { wordCards, translationCards, pool };
  };

  const [session, setSession] = useState(() => buildSession());
  const [leftCards, setLeftCards] = useState<MatchCard[]>(session.wordCards);
  const [rightCards, setRightCards] = useState<MatchCard[]>(session.translationCards);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [wrongPair, setWrongPair] = useState<[string, string] | null>(null);
  const [results, setResults] = useState({ correct: 0, wrong: 0, xp: 0 });
  const [done, setDone] = useState(false);

  const matchedCount = leftCards.filter(c => c.matched).length;

  const awardXp = useCallback(async (correct: boolean, wordId: string) => {
    const xpGain = correct ? 10 : 1;
    const coinsGain = correct ? 5 : 0;
    const w = session.pool.find(p => p.id === wordId);

    await db.from("student_gamification").update({
      xp_total: gamification.xp_total + xpGain,
      coins: gamification.coins + coinsGain,
      updated_at: new Date().toISOString(),
    }).eq("student_id", studentId);

    await db.from("xp_events").insert({
      student_id: studentId, event_type: "stepbystep",
      xp: xpGain, coins: coinsGain,
      description: `Pares ${correct ? "correto" : "errado"}: ${w?.word ?? ""}`,
    });

    await db.from("stepbystep_attempts").insert({
      student_id: studentId, vocabulary_id: wordId,
      exercise_type: "matching", correct, xp_earned: xpGain,
      mission_id: mission?.id ?? null,
    });

    onSessionXp(xpGain);

    if (mission && !mission.completed) {
      const newDone = mission.exercises_done + 1;
      const nowComplete = newDone >= mission.exercises_total;
      const missionUpdate: Record<string, unknown> = {
        exercises_done: newDone,
        xp_earned: (mission.xp_earned || 0) + xpGain,
      };
      if (nowComplete) {
        missionUpdate.completed = true;
        missionUpdate.completed_at = new Date().toISOString();
        await db.from("xp_events").insert({
          student_id: studentId, event_type: "daily_mission",
          xp: 50, coins: 25, description: "Missão diária concluída! 🎯",
        });
        await db.from("student_gamification").update({
          xp_total: gamification.xp_total + xpGain + 50,
          coins: gamification.coins + coinsGain + 25,
          updated_at: new Date().toISOString(),
        }).eq("student_id", studentId);
        onSessionXp(50);
        missionUpdate.xp_earned = (mission.xp_earned || 0) + xpGain + 50;
        toast({ title: "🎯 Missão concluída!", description: "+50 XP de bônus!" });
      }
      await db.from("daily_missions").update(missionUpdate).eq("id", mission.id);
      onMissionUpdate({
        ...mission, exercises_done: newDone,
        completed: nowComplete || mission.completed,
        xp_earned: (mission.xp_earned || 0) + xpGain + (nowComplete ? 50 : 0),
      });
    }

    await refreshGamification();
  }, [session, gamification, studentId, mission, onMissionUpdate, onSessionXp, refreshGamification]);

  useEffect(() => {
    if (!selectedLeft || !selectedRight) return;

    const leftCard = leftCards.find(c => c.id === selectedLeft)!;
    const rightCard = rightCards.find(c => c.id === selectedRight)!;
    const correct = leftCard.wordId === rightCard.wordId;

    if (correct) {
      setLeftCards(prev => prev.map(c => c.id === selectedLeft ? { ...c, matched: true } : c));
      setRightCards(prev => prev.map(c => c.id === selectedRight ? { ...c, matched: true } : c));
      setResults(prev => ({ correct: prev.correct + 1, wrong: prev.wrong, xp: prev.xp + 10 }));
      awardXp(true, leftCard.wordId);
      setSelectedLeft(null);
      setSelectedRight(null);

      if (matchedCount + 1 >= PAIRS) {
        setTimeout(() => setDone(true), 400);
      }
    } else {
      setWrongPair([selectedLeft, selectedRight]);
      setResults(prev => ({ correct: prev.correct, wrong: prev.wrong + 1, xp: prev.xp + 1 }));
      awardXp(false, leftCard.wordId);
      setTimeout(() => {
        setSelectedLeft(null);
        setSelectedRight(null);
        setWrongPair(null);
      }, 700);
    }
  }, [selectedLeft, selectedRight]);

  const handleRestart = () => {
    const s = buildSession();
    setSession(s);
    setLeftCards(s.wordCards);
    setRightCards(s.translationCards);
    setSelectedLeft(null);
    setSelectedRight(null);
    setWrongPair(null);
    setResults({ correct: 0, wrong: 0, xp: 0 });
    setDone(false);
  };

  if (done) {
    return (
      <div className="space-y-4 py-2">
        <div className="text-center space-y-1">
          <p className="text-3xl">🎉</p>
          <p className="font-bold">Todos os pares encontrados!</p>
          <p className="text-xs text-muted-foreground font-light">
            {results.wrong === 0 ? "Perfeito — zero erros!" : `${results.wrong} erro${results.wrong > 1 ? "s" : ""} no caminho`}
          </p>
          <p className="text-xs text-muted-foreground font-light">+{results.xp} XP ganhos</p>
        </div>
        <Button className="w-full font-bold" style={{ background: "var(--theme-accent)", color: "var(--theme-text-on-accent)" }} onClick={handleRestart}>
          Jogar de novo
        </Button>
      </div>
    );
  }

  const cardClass = (card: MatchCard, side: "left" | "right") => {
    const selectedId = side === "left" ? selectedLeft : selectedRight;
    const isSelected = card.id === selectedId;
    const isWrong = wrongPair && (wrongPair[0] === card.id || wrongPair[1] === card.id);
    return cn(
      "w-full p-3 rounded-xl border-2 text-xs font-bold text-center transition-all",
      card.matched && "border-green-500 bg-green-500/10 text-green-700 opacity-50 cursor-default",
      !card.matched && !isSelected && !isWrong && "border-border bg-card hover:border-primary hover:bg-primary/5 cursor-pointer",
      !card.matched && isSelected && !isWrong && "border-primary bg-primary/10 text-primary",
      isWrong && "border-red-400 bg-red-500/10 text-red-600",
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground font-light">
        <span>{matchedCount}/{PAIRS} pares</span>
        <span>+{results.xp} XP</span>
      </div>
      <Progress value={(matchedCount / PAIRS) * 100} className="h-1.5" />

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          {leftCards.map(card => (
            <button
              key={card.id}
              disabled={card.matched || !!wrongPair}
              onClick={() => !card.matched && setSelectedLeft(prev => prev === card.id ? null : card.id)}
              className={cardClass(card, "left")}
            >
              {card.text}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {rightCards.map(card => (
            <button
              key={card.id}
              disabled={card.matched || !!wrongPair}
              onClick={() => !card.matched && setSelectedRight(prev => prev === card.id ? null : card.id)}
              className={cardClass(card, "right")}
            >
              {card.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Scramble game (embaralhado) ─────────────────────────────────────────────
const ScrambleGame = ({
  words, studentId, mission, onMissionUpdate, onSessionXp,
}: {
  words: VocabWord[];
  studentId: string;
  mission: DailyMission | null;
  onMissionUpdate: (m: DailyMission) => void;
  onSessionXp: (xp: number) => void;
}) => {
  const { gamification, refresh: refreshGamification } = useGamification();

  const SESSION_SIZE = Math.min(8, words.filter(w => w.translation).length);

  const scramble = (word: string) =>
    word.split("").sort(() => Math.random() - 0.5);

  const buildSession = () =>
    [...words].filter(w => w.translation).sort(() => Math.random() - 0.5).slice(0, SESSION_SIZE);

  const [session] = useState<VocabWord[]>(() => buildSession());
  const [index, setIndex] = useState(0);
  const [tiles, setTiles] = useState<string[]>(() => scramble(session[0].word));
  const [placed, setPlaced] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [results, setResults] = useState({ correct: 0, wrong: 0, xp: 0 });
  const [done, setDone] = useState(false);

  const current = session[index];

  const awardXp = useCallback(async (correct: boolean, w: VocabWord) => {
    const xpGain = correct ? 15 : 2;
    const coinsGain = correct ? 8 : 0;

    await db.from("student_gamification").update({
      xp_total: gamification.xp_total + xpGain,
      coins: gamification.coins + coinsGain,
      updated_at: new Date().toISOString(),
    }).eq("student_id", studentId);

    await db.from("xp_events").insert({
      student_id: studentId, event_type: "stepbystep",
      xp: xpGain, coins: coinsGain,
      description: `Embaralhado ${correct ? "correto" : "errado"}: ${w.word}`,
    });

    await db.from("stepbystep_attempts").insert({
      student_id: studentId, vocabulary_id: w.id,
      exercise_type: "scramble", correct, xp_earned: xpGain,
      mission_id: mission?.id ?? null,
    });

    onSessionXp(xpGain);

    if (mission && !mission.completed) {
      const newDone = mission.exercises_done + 1;
      const nowComplete = newDone >= mission.exercises_total;
      const missionUpdate: Record<string, unknown> = {
        exercises_done: newDone,
        xp_earned: (mission.xp_earned || 0) + xpGain,
      };
      if (nowComplete) {
        missionUpdate.completed = true;
        missionUpdate.completed_at = new Date().toISOString();
        await db.from("xp_events").insert({
          student_id: studentId, event_type: "daily_mission",
          xp: 50, coins: 25, description: "Missão diária concluída! 🎯",
        });
        await db.from("student_gamification").update({
          xp_total: gamification.xp_total + xpGain + 50,
          coins: gamification.coins + coinsGain + 25,
          updated_at: new Date().toISOString(),
        }).eq("student_id", studentId);
        onSessionXp(50);
        missionUpdate.xp_earned = (mission.xp_earned || 0) + xpGain + 50;
        toast({ title: "🎯 Missão concluída!", description: "+50 XP de bônus!" });
      }
      await db.from("daily_missions").update(missionUpdate).eq("id", mission.id);
      onMissionUpdate({
        ...mission, exercises_done: newDone,
        completed: nowComplete || mission.completed,
        xp_earned: (mission.xp_earned || 0) + xpGain + (nowComplete ? 50 : 0),
      });
    }

    await refreshGamification();
  }, [gamification, studentId, mission, onMissionUpdate, onSessionXp, refreshGamification]);

  const handleTileTap = (letter: string, tileIndex: number) => {
    if (feedback) return;
    const newTiles = [...tiles];
    newTiles.splice(tileIndex, 1);
    const newPlaced = [...placed, letter];
    setTiles(newTiles);
    setPlaced(newPlaced);

    // Auto-submit quando todas as letras estiverem colocadas
    if (newPlaced.length === current.word.length) {
      const attempt = newPlaced.join("");
      const correct = attempt.toLowerCase() === current.word.toLowerCase();
      setFeedback(correct ? "correct" : "wrong");
      setResults(prev => ({
        correct: prev.correct + (correct ? 1 : 0),
        wrong: prev.wrong + (correct ? 0 : 1),
        xp: prev.xp + (correct ? 15 : 2),
      }));
      awardXp(correct, current);
    }
  };

  const handleRemovePlaced = (idx: number) => {
    if (feedback) return;
    const letter = placed[idx];
    const newPlaced = [...placed];
    newPlaced.splice(idx, 1);
    setPlaced(newPlaced);
    setTiles(prev => [...prev, letter]);
  };

  const handleNext = () => {
    if (index + 1 >= SESSION_SIZE) {
      setDone(true);
      return;
    }
    const nextIndex = index + 1;
    setIndex(nextIndex);
    setTiles(scramble(session[nextIndex].word));
    setPlaced([]);
    setFeedback(null);
  };

  const handleRestart = () => {
    const s = buildSession();
    setIndex(0);
    setTiles(scramble(s[0].word));
    setPlaced([]);
    setFeedback(null);
    setResults({ correct: 0, wrong: 0, xp: 0 });
    setDone(false);
  };

  if (done) {
    return (
      <div className="space-y-4 py-2">
        <div className="text-center space-y-1">
          <p className="text-3xl">{results.correct >= SESSION_SIZE * 0.7 ? "🎉" : "💪"}</p>
          <p className="font-bold">{results.correct}/{SESSION_SIZE} corretas</p>
          <p className="text-xs text-muted-foreground font-light">+{results.xp} XP ganhos</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
            <p className="font-bold text-green-700">{results.correct}</p>
            <p className="text-xs text-muted-foreground font-light">acertos</p>
          </div>
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="font-bold text-red-600">{results.wrong}</p>
            <p className="text-xs text-muted-foreground font-light">erros</p>
          </div>
        </div>
        <Button className="w-full font-bold" style={{ background: "var(--theme-accent)", color: "var(--theme-text-on-accent)" }} onClick={handleRestart}>
          Jogar de novo
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progresso */}
      <div className="flex items-center justify-between text-xs text-muted-foreground font-light">
        <span>{index + 1}/{SESSION_SIZE}</span>
        <span>+{results.xp} XP</span>
      </div>
      <Progress value={((index + 1) / SESSION_SIZE) * 100} className="h-1.5" />

      {/* Tradução (pista) */}
      <div className="py-4 text-center space-y-1">
        <p className="text-xs text-muted-foreground font-light uppercase tracking-widest">Tradução</p>
        <p className="text-xl font-bold">{current.translation}</p>
      </div>

      {/* Área de resposta (letras colocadas) */}
      <div className="min-h-[48px] flex flex-wrap justify-center gap-1.5 p-3 rounded-xl border-2 border-dashed border-border bg-muted/30">
        {placed.length === 0 && (
          <p className="text-xs text-muted-foreground font-light self-center">Toque nas letras abaixo</p>
        )}
        {placed.map((letter, i) => (
          <button
            key={i}
            onClick={() => handleRemovePlaced(i)}
            className={cn(
              "w-9 h-9 rounded-lg text-sm font-bold border-2 transition-all",
              !feedback && "border-primary bg-primary/10 text-primary hover:bg-primary/20",
              feedback === "correct" && "border-green-500 bg-green-500/10 text-green-700",
              feedback === "wrong" && "border-red-400 bg-red-500/10 text-red-600",
            )}
          >
            {letter.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={cn(
          "p-3 rounded-xl text-center text-sm font-bold border",
          feedback === "correct" && "bg-green-500/10 border-green-500/20 text-green-700",
          feedback === "wrong" && "bg-red-500/10 border-red-400/20 text-red-600",
        )}>
          {feedback === "correct"
            ? `✓ Correto! +15 XP`
            : `✗ Era "${current.word}" — +2 XP por tentar`}
        </div>
      )}

      {/* Tiles disponíveis */}
      {!feedback && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {tiles.map((letter, i) => (
            <button
              key={i}
              onClick={() => handleTileTap(letter, i)}
              className="w-9 h-9 rounded-lg text-sm font-bold border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-all"
            >
              {letter.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Próxima */}
      {feedback && (
        <Button
          className="w-full font-bold"
          style={{ background: "var(--theme-accent)", color: "var(--theme-text-on-accent)" }}
          onClick={handleNext}
        >
          {index + 1 >= SESSION_SIZE ? "Ver resultado →" : "Próxima →"}
        </Button>
      )}
    </div>
  );
};

// ─── Against the Clock game ───────────────────────────────────────────────────
const ClockGame = ({
  words, studentId, mission, onMissionUpdate, onSessionXp,
}: {
  words: VocabWord[];
  studentId: string;
  mission: DailyMission | null;
  onMissionUpdate: (m: DailyMission) => void;
  onSessionXp: (xp: number) => void;
}) => {
  const { gamification, refresh: refreshGamification } = useGamification();

  const SESSION_SIZE = Math.min(10, words.filter(w => w.translation).length);
  const TIME_PER_WORD = 10;

  const buildOptions = async (correct: VocabWord, all: VocabWord[]): Promise<string[]> => {
    const linked = await fetchDistractors(correct.id);
    let distractors: string[];
    if (linked.length >= 3) {
      distractors = linked.slice(0, 3);
    } else {
      const needed = 3 - linked.length;
      const random = all
        .filter(w => w.id !== correct.id && w.translation && !linked.includes(w.translation!))
        .sort(() => Math.random() - 0.5)
        .slice(0, needed)
        .map(w => w.translation!);
      distractors = [...linked, ...random];
    }
    return [...distractors, correct.translation!].sort(() => Math.random() - 0.5);
  };

  const buildSession = () =>
    [...words].filter(w => w.translation).sort(() => Math.random() - 0.5).slice(0, SESSION_SIZE);

  const [session] = useState<VocabWord[]>(() => buildSession());
  const [index, setIndex] = useState(0);
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    buildOptions(session[0], words).then(setOptions);
  }, []);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_WORD);
  const [selected, setSelected] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [results, setResults] = useState({ correct: 0, wrong: 0, xp: 0 });
  const [done, setDone] = useState(false);

  const current = session[index];
  const answered = selected !== null || timedOut;

  // Timer
  useEffect(() => {
    if (answered) return;
    if (timeLeft <= 0) {
      setTimedOut(true);
      setResults(prev => ({ ...prev, wrong: prev.wrong + 1 }));
      awardXp(false, current);
      return;
    }
    const t = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, answered]);

  const awardXp = useCallback(async (correct: boolean, w: VocabWord) => {
    const xpGain = correct ? 20 : 0;
    const coinsGain = correct ? 10 : 0;

    if (xpGain > 0) {
      await db.from("student_gamification").update({
        xp_total: gamification.xp_total + xpGain,
        coins: gamification.coins + coinsGain,
        updated_at: new Date().toISOString(),
      }).eq("student_id", studentId);
    }

    await db.from("xp_events").insert({
      student_id: studentId, event_type: "stepbystep",
      xp: xpGain, coins: coinsGain,
      description: `Relógio ${correct ? "correto" : "errado/tempo"}: ${w.word}`,
    });

    await db.from("stepbystep_attempts").insert({
      student_id: studentId, vocabulary_id: w.id,
      exercise_type: "clock", correct, xp_earned: xpGain,
      mission_id: mission?.id ?? null,
    });

    if (xpGain > 0) onSessionXp(xpGain);

    if (mission && !mission.completed) {
      const newDone = mission.exercises_done + 1;
      const nowComplete = newDone >= mission.exercises_total;
      const missionUpdate: Record<string, unknown> = {
        exercises_done: newDone,
        xp_earned: (mission.xp_earned || 0) + xpGain,
      };
      if (nowComplete) {
        missionUpdate.completed = true;
        missionUpdate.completed_at = new Date().toISOString();
        await db.from("xp_events").insert({
          student_id: studentId, event_type: "daily_mission",
          xp: 50, coins: 25, description: "Missão diária concluída! 🎯",
        });
        await db.from("student_gamification").update({
          xp_total: gamification.xp_total + xpGain + 50,
          coins: gamification.coins + coinsGain + 25,
          updated_at: new Date().toISOString(),
        }).eq("student_id", studentId);
        onSessionXp(50);
        missionUpdate.xp_earned = (mission.xp_earned || 0) + xpGain + 50;
        toast({ title: "🎯 Missão concluída!", description: "+50 XP de bônus!" });
      }
      await db.from("daily_missions").update(missionUpdate).eq("id", mission.id);
      onMissionUpdate({
        ...mission, exercises_done: newDone,
        completed: nowComplete || mission.completed,
        xp_earned: (mission.xp_earned || 0) + xpGain + (nowComplete ? 50 : 0),
      });
    }

    await refreshGamification();
  }, [gamification, studentId, mission, onMissionUpdate, onSessionXp, refreshGamification]);

  const handleSelect = async (option: string) => {
    if (answered) return;
    setSelected(option);
    const correct = option === current.translation;
    setResults(prev => ({
      correct: prev.correct + (correct ? 1 : 0),
      wrong: prev.wrong + (correct ? 0 : 1),
      xp: prev.xp + (correct ? 20 : 0),
    }));
    await awardXp(correct, current);
  };

  const handleNext = async () => {
    if (index + 1 >= SESSION_SIZE) {
      setDone(true);
      return;
    }
    const nextIndex = index + 1;
    setIndex(nextIndex);
    setOptions(await buildOptions(session[nextIndex], words));
    setSelected(null);
    setTimedOut(false);
    setTimeLeft(TIME_PER_WORD);
  };

  const handleRestart = async () => {
    setIndex(0);
    setOptions(await buildOptions(session[0], words));
    setSelected(null);
    setTimedOut(false);
    setTimeLeft(TIME_PER_WORD);
    setResults({ correct: 0, wrong: 0, xp: 0 });
    setDone(false);
  };

  if (done) {
    return (
      <div className="space-y-4 py-2">
        <div className="text-center space-y-1">
          <p className="text-3xl">{results.correct >= SESSION_SIZE * 0.7 ? "🔥" : "💪"}</p>
          <p className="font-bold">{results.correct}/{SESSION_SIZE} corretas</p>
          <p className="text-xs text-muted-foreground font-light">+{results.xp} XP ganhos</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
            <p className="font-bold text-green-700">{results.correct}</p>
            <p className="text-xs text-muted-foreground font-light">acertos</p>
          </div>
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="font-bold text-red-600">{results.wrong}</p>
            <p className="text-xs text-muted-foreground font-light">erros / tempo</p>
          </div>
        </div>
        <Button className="w-full font-bold" style={{ background: "var(--theme-accent)", color: "var(--theme-text-on-accent)" }} onClick={handleRestart}>
          Jogar de novo
        </Button>
      </div>
    );
  }

  const timerPct = (timeLeft / TIME_PER_WORD) * 100;
  const timerColor = timeLeft > 5 ? "bg-green-500" : timeLeft > 2 ? "bg-yellow-400" : "bg-red-500";

  return (
    <div className="space-y-4">
      {/* Progresso da sessão */}
      <div className="flex items-center justify-between text-xs text-muted-foreground font-light">
        <span>{index + 1}/{SESSION_SIZE}</span>
        <span>+{results.xp} XP</span>
      </div>
      <Progress value={((index + 1) / SESSION_SIZE) * 100} className="h-1.5" />

      {/* Timer */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-muted-foreground font-light">Tempo</span>
          <span className={timeLeft <= 3 ? "text-red-500" : ""}>{timeLeft}s</span>
        </div>
        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-1000", timerColor)}
            style={{ width: `${timerPct}%` }}
          />
        </div>
      </div>

      {/* Palavra */}
      <div className="py-4 text-center">
        <p className="text-3xl font-bold tracking-wide">{current.word}</p>
      </div>

      {/* Opções */}
      <div className="grid grid-cols-1 gap-2">
        {options.map(opt => {
          const isCorrect = opt === current.translation;
          const isSelected = opt === selected;
          return (
            <button
              key={opt}
              onClick={() => handleSelect(opt)}
              disabled={answered}
              className={cn(
                "w-full p-3 rounded-xl border-2 text-sm font-bold text-left transition-all",
                !answered && "border-border bg-card hover:border-primary hover:bg-primary/5",
                answered && isCorrect && "border-green-500 bg-green-500/10 text-green-700",
                answered && isSelected && !isCorrect && "border-red-400 bg-red-500/10 text-red-600",
                answered && !isSelected && !isCorrect && "border-border bg-card opacity-40",
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {/* Feedback tempo esgotado */}
      {timedOut && !selected && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-400/20 text-center text-sm font-bold text-red-600">
          ⏱ Tempo esgotado! Era "{current.translation}"
        </div>
      )}

      {/* Próxima */}
      {answered && (
        <Button
          className="w-full font-bold"
          style={{ background: "var(--theme-accent)", color: "var(--theme-text-on-accent)" }}
          onClick={handleNext}
        >
          {index + 1 >= SESSION_SIZE ? "Ver resultado →" : "Próxima →"}
        </Button>
      )}
    </div>
  );
};

// ─── Survival game ────────────────────────────────────────────────────────────
const SurvivalGame = ({
  words, studentId, mission, onMissionUpdate, onSessionXp,
}: {
  words: VocabWord[];
  studentId: string;
  mission: DailyMission | null;
  onMissionUpdate: (m: DailyMission) => void;
  onSessionXp: (xp: number) => void;
}) => {
  const { gamification, refresh: refreshGamification } = useGamification();

  const MAX_LIVES = 3;
  const THRESHOLD = 5; // acertos para subir de dificuldade

  const buildOptions = async (correct: VocabWord, pool: VocabWord[]): Promise<string[]> => {
    const linked = await fetchDistractors(correct.id);
    let distractors: string[];
    if (linked.length >= 3) {
      distractors = linked.slice(0, 3);
    } else {
      const needed = 3 - linked.length;
      const random = pool
        .filter(w => w.id !== correct.id && w.translation && !linked.includes(w.translation!))
        .sort(() => Math.random() - 0.5)
        .slice(0, needed)
        .map(w => w.translation!);
      distractors = [...linked, ...random];
    }
    return [...distractors, correct.translation!].sort(() => Math.random() - 0.5);
  };

  const pickWord = (difficulty: number, usedIds: Set<string>, all: VocabWord[]): VocabWord | null => {
    const pool = all.filter(w => w.difficulty === difficulty && w.translation && !usedIds.has(w.id));
    if (!pool.length) {
      // fallback: qualquer palavra não usada
      const fallback = all.filter(w => w.translation && !usedIds.has(w.id));
      if (!fallback.length) return null;
      return fallback[Math.floor(Math.random() * fallback.length)];
    }
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const [difficulty, setDifficulty] = useState(1);
  const [streak, setStreak] = useState(0); // acertos na dificuldade atual
  const [lives, setLives] = useState(MAX_LIVES);
  const [score, setScore] = useState(0);
  const [usedIds, setUsedIds] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState<VocabWord | null>(() => pickWord(1, new Set(), words));
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    if (current) buildOptions(current, words).then(setOptions);
  }, []);
  const [selected, setSelected] = useState<string | null>(null);
  const [gameOver, setGameOver] = useState(false);

  const answered = selected !== null;

  const awardXp = useCallback(async (correct: boolean, w: VocabWord, diff: number) => {
    const xpMap: Record<number, number> = { 1: 8, 2: 12, 3: 18 };
    const xpGain = correct ? (xpMap[diff] ?? 8) : 1;
    const coinsGain = correct ? Math.floor(xpGain / 2) : 0;

    await db.from("student_gamification").update({
      xp_total: gamification.xp_total + xpGain,
      coins: gamification.coins + coinsGain,
      updated_at: new Date().toISOString(),
    }).eq("student_id", studentId);

    await db.from("xp_events").insert({
      student_id: studentId, event_type: "stepbystep",
      xp: xpGain, coins: coinsGain,
      description: `Survival ${correct ? "correto" : "errado"} D${diff}: ${w.word}`,
    });

    await db.from("stepbystep_attempts").insert({
      student_id: studentId, vocabulary_id: w.id,
      exercise_type: "survival", correct, xp_earned: xpGain,
      mission_id: mission?.id ?? null,
    });

    onSessionXp(xpGain);

    if (mission && !mission.completed) {
      const newDone = mission.exercises_done + 1;
      const nowComplete = newDone >= mission.exercises_total;
      const missionUpdate: Record<string, unknown> = {
        exercises_done: newDone,
        xp_earned: (mission.xp_earned || 0) + xpGain,
      };
      if (nowComplete) {
        missionUpdate.completed = true;
        missionUpdate.completed_at = new Date().toISOString();
        await db.from("xp_events").insert({
          student_id: studentId, event_type: "daily_mission",
          xp: 50, coins: 25, description: "Missão diária concluída! 🎯",
        });
        await db.from("student_gamification").update({
          xp_total: gamification.xp_total + xpGain + 50,
          coins: gamification.coins + coinsGain + 25,
          updated_at: new Date().toISOString(),
        }).eq("student_id", studentId);
        onSessionXp(50);
        missionUpdate.xp_earned = (mission.xp_earned || 0) + xpGain + 50;
        toast({ title: "🎯 Missão concluída!", description: "+50 XP de bônus!" });
      }
      await db.from("daily_missions").update(missionUpdate).eq("id", mission.id);
      onMissionUpdate({
        ...mission, exercises_done: newDone,
        completed: nowComplete || mission.completed,
        xp_earned: (mission.xp_earned || 0) + xpGain + (nowComplete ? 50 : 0),
      });
    }

    await refreshGamification();
    return xpGain;
  }, [gamification, studentId, mission, onMissionUpdate, onSessionXp, refreshGamification]);

  const handleSelect = async (option: string) => {
    if (answered || !current) return;
    setSelected(option);
    const correct = option === current.translation;

    await awardXp(correct, current, difficulty);

    if (correct) {
      const newStreak = streak + 1;
      const newScore = score + 1;
      setScore(newScore);

      // Sobe dificuldade após THRESHOLD acertos, máximo difficulty 3
      if (newStreak >= THRESHOLD && difficulty < 3) {
        setDifficulty(prev => prev + 1);
        setStreak(0);
        toast({ title: `🔥 Nível ${difficulty + 1}!`, description: "Dificuldade aumentou!" });
      } else {
        setStreak(newStreak);
      }
    } else {
      const newLives = lives - 1;
      setLives(newLives);
      if (newLives <= 0) {
        setGameOver(true);
        return;
      }
    }
  };

  const handleNext = async () => {
    if (!current) return;
    const newUsed = new Set(usedIds).add(current.id);
    setUsedIds(newUsed);
    const next = pickWord(difficulty, newUsed, words);
    if (!next) {
      setGameOver(true);
      return;
    }
    setCurrent(next);
    setOptions(await buildOptions(next, words));
    setSelected(null);
  };

  const handleRestart = async () => {
    const startWord = pickWord(1, new Set(), words);
    setDifficulty(1);
    setStreak(0);
    setLives(MAX_LIVES);
    setScore(0);
    setUsedIds(new Set());
    setCurrent(startWord);
    setOptions(startWord ? await buildOptions(startWord, words) : []);
    setSelected(null);
    setGameOver(false);
  };

  if (gameOver) {
    return (
      <div className="space-y-4 py-2">
        <div className="text-center space-y-1">
          <p className="text-4xl">💀</p>
          <p className="font-bold text-lg">{score} {score === 1 ? "acerto" : "acertos"}</p>
          <p className="text-xs text-muted-foreground font-light">
            {score >= 15 ? "Lendário! 🏆" : score >= 10 ? "Muito bom! 🔥" : score >= 5 ? "Bom progresso! 💪" : "Continue tentando!"}
          </p>
          {difficulty > 1 && (
            <p className="text-xs text-muted-foreground font-light">
              Chegou até a dificuldade {difficulty === 3 ? "máxima 🎯" : difficulty}
            </p>
          )}
        </div>
        <Button className="w-full font-bold" style={{ background: "var(--theme-accent)", color: "var(--theme-text-on-accent)" }} onClick={handleRestart}>
          Jogar de novo
        </Button>
      </div>
    );
  }

  if (!current) return null;

  const diffLabel: Record<number, string> = { 1: "A1–A2", 2: "B1", 3: "B2" };

  return (
    <div className="space-y-4">
      {/* Header: vidas + score + dificuldade */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {Array.from({ length: MAX_LIVES }).map((_, i) => (
            <span key={i} className={cn("text-xl transition-all", i < lives ? "opacity-100" : "opacity-20")}>
              ❤️
            </span>
          ))}
        </div>
        <div className="text-center">
          <p className="text-lg font-bold">{score}</p>
          <p className="text-xs text-muted-foreground font-light">acertos</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold">{diffLabel[difficulty]}</p>
          <p className="text-xs text-muted-foreground font-light">{streak}/{THRESHOLD} para subir</p>
        </div>
      </div>

      {/* Barra de progresso para próximo nível */}
      {difficulty < 3 && (
        <Progress value={(streak / THRESHOLD) * 100} className="h-1.5" />
      )}

      {/* Palavra */}
      <div className="py-6 text-center">
        <p className="text-3xl font-bold tracking-wide">{current.word}</p>
        {current.example_sentence && answered && (
          <p className="text-xs text-muted-foreground font-light italic mt-2">"{current.example_sentence}"</p>
        )}
      </div>

      {/* Opções */}
      <div className="grid grid-cols-1 gap-2">
        {options.map(opt => {
          const isCorrect = opt === current.translation;
          const isSelected = opt === selected;
          return (
            <button
              key={opt}
              onClick={() => handleSelect(opt)}
              disabled={answered}
              className={cn(
                "w-full p-3 rounded-xl border-2 text-sm font-bold text-left transition-all",
                !answered && "border-border bg-card hover:border-primary hover:bg-primary/5",
                answered && isCorrect && "border-green-500 bg-green-500/10 text-green-700",
                answered && isSelected && !isCorrect && "border-red-400 bg-red-500/10 text-red-600",
                answered && !isSelected && !isCorrect && "border-border bg-card opacity-40",
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {/* Próxima */}
      {answered && !gameOver && (
        <Button
          className="w-full font-bold"
          style={{ background: "var(--theme-accent)", color: "var(--theme-text-on-accent)" }}
          onClick={handleNext}
        >
          Próxima →
        </Button>
      )}
    </div>
  );
};

// ─── Game mode tabs ───────────────────────────────────────────────────────────
type GameMode = "hangman" | "translation" | "fillblank" | "matching" | "scramble" | "clock" | "survival";

const MODE_CONFIG: { id: GameMode; label: string; emoji: string; desc: string }[] = [
  { id: "hangman",     emoji: "🪓",  label: "Forca",             desc: "Adivinhe a palavra letra por letra"          },
  { id: "translation", emoji: "🌐",  label: "Tradução",          desc: "Escolha a tradução correta"                 },
  { id: "fillblank",   emoji: "✏️",  label: "Lacuna",            desc: "Complete a frase com a palavra certa"       },
  { id: "matching",    emoji: "🔗",  label: "Pares",             desc: "Conecte cada palavra à sua tradução"        },
  { id: "scramble",    emoji: "🔀",  label: "Embaralhado",       desc: "Monte a palavra com as letras embaralhadas" },
  { id: "clock",       emoji: "⏱️",  label: "Contra o Relógio", desc: "10 palavras, 10 segundos cada"             },
  { id: "survival",    emoji: "💀",  label: "Survival",          desc: "3 vidas — aguenta até onde der"            },
];

// ─── Main Page ────────────────────────────────────────────────────────────────
const StepByStep = () => {
  const { profile } = useAuth();
  const { gamification, refresh: refreshGamification } = useGamification();

  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [levelId, setLevelId] = useState<string | null>(null);
  const [mission, setMission] = useState<DailyMission | null>(null);
  const [missionLoading, setMissionLoading] = useState(true);
  const [words, setWords] = useState<VocabWord[]>([]);

  // Hangman state
  const [word, setWord] = useState<VocabWord | null>(null);
  const [guessed, setGuessed] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState(0);
  const [gameState, setGameState] = useState<"playing" | "won" | "lost" | "no_vocab">("playing");
  const [celebrateWin, setCelebrateWin] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [deck, setDeck] = useState<VocabWord[]>([]);

  const [sessionXp, setSessionXp] = useState(0);
  const [mode, setMode] = useState<GameMode>("hangman");
  const [gameSelected, setGameSelected] = useState(false);

  const MAX_ERRORS = 6;

  useEffect(() => {
    if (!profile) return;
    loadStudent();
  }, [profile]);

  const loadStudent = async () => {
    if (!profile) return;
    const { data: student } = await supabase
      .from("students").select("id, level_id, language_id").eq("user_id", profile.id).maybeSingle();
    if (!student) { setLoading(false); return; }
    setStudentId(student.id);
    setLevelId(student.level_id);
    setLoading(false);
    await Promise.all([
      loadOrCreateMission(student.id),
      loadVocabulary(student.language_id),
    ]);
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

  const loadVocabulary = async (languageId: string | null) => {
    if (!languageId) { setGameState("no_vocab"); return; }

    // Busca todos os level_ids do idioma do aluno
    const { data: levels } = await db
      .from("levels")
      .select("id")
      .eq("language_id", languageId);

    const levelIds = (levels ?? []).map((l: { id: string }) => l.id);
    if (!levelIds.length) { setGameState("no_vocab"); return; }

    // Busca vocabulário de todos os níveis do idioma
    const { data: allWords } = await db
      .from("vocabulary")
      .select("id, word, translation, example_sentence, difficulty")
      .in("level_id", levelIds)
      .eq("active", true);

    if (!allWords || allWords.length === 0) { setGameState("no_vocab"); return; }

    const shuffled = [...allWords].sort(() => Math.random() - 0.5) as VocabWord[];
    setWords(shuffled);
    // Seed the deck and pick the first word from it
    const [first, ...rest] = shuffled;
    setDeck(rest);
    setWord(first);
    setGuessed(new Set());
    setErrors(0);
    setGameState("playing");
    setCelebrateWin(false);
    setHintsUsed(0);
  };

  const pickHangmanWord = (vocab: VocabWord[]) => {
    if (!vocab.length) { setGameState("no_vocab"); return; }
    // Pop from the no-repeat deck; reshuffle when exhausted
    setDeck(prev => {
      const remaining = prev.length ? prev : [...vocab].sort(() => Math.random() - 0.5);
      const [next, ...rest] = remaining;
      setWord(next);
      return rest;
    });
    setGuessed(new Set());
    setErrors(0);
    setGameState("playing");
    setCelebrateWin(false);
    setHintsUsed(0);
  };

  const wordLetters = word ? new Set(word.word.toUpperCase().split("").filter(c => /[A-Z]/.test(c))) : new Set<string>();
  const correctLetters = new Set([...guessed].filter(l => wordLetters.has(l)));

  const handleWin = useCallback(async () => {
    if (!studentId || !word) return;
    const xpGain = 15; const coinsGain = 8;
    const currentXp = gamification.xp_total;
    const currentCoins = gamification.coins;

    await db.from("student_gamification").update({
      xp_total: currentXp + xpGain, coins: currentCoins + coinsGain, updated_at: new Date().toISOString(),
    }).eq("student_id", studentId);

    await db.from("xp_events").insert({
      student_id: studentId, event_type: "stepbystep", xp: xpGain, coins: coinsGain, description: `Forca correto: ${word.word}`,
    });

    await db.from("stepbystep_attempts").insert({
      student_id: studentId, vocabulary_id: word.id, exercise_type: "hangman", correct: true, xp_earned: xpGain, mission_id: mission?.id || null,
    });

    setSessionXp(prev => prev + xpGain);

    if (mission && !mission.completed) {
      const newDone = mission.exercises_done + 1;
      const nowComplete = newDone >= mission.exercises_total;
      const missionUpdate: Record<string, unknown> = { exercises_done: newDone, xp_earned: (mission.xp_earned || 0) + xpGain };
      if (nowComplete) {
        missionUpdate.completed = true;
        missionUpdate.completed_at = new Date().toISOString();
        const bonusXp = 50; const bonusCoins = 25;
        await db.from("xp_events").insert({ student_id: studentId, event_type: "daily_mission", xp: bonusXp, coins: bonusCoins, description: "Missão diária concluída! 🎯" });
        await db.from("student_gamification").update({ xp_total: currentXp + xpGain + bonusXp, coins: currentCoins + coinsGain + bonusCoins, updated_at: new Date().toISOString() }).eq("student_id", studentId);
        setSessionXp(prev => prev + bonusXp);
        missionUpdate.xp_earned = (mission.xp_earned || 0) + xpGain + bonusXp;
        toast({ title: "🎯 Missão concluída!", description: "+50 XP de bônus!" });
      }
      await db.from("daily_missions").update(missionUpdate).eq("id", mission.id);
      setMission(prev => prev ? { ...prev, exercises_done: newDone, completed: nowComplete || prev.completed, xp_earned: (prev.xp_earned || 0) + xpGain + (nowComplete ? 50 : 0) } : prev);
    }
    await refreshGamification();
  }, [studentId, word, gamification, mission, refreshGamification]);

  const handleLoss = useCallback(async () => {
    if (!studentId || !word) return;
    const xpGain = 3;
    await db.from("student_gamification").update({ xp_total: gamification.xp_total + xpGain, updated_at: new Date().toISOString() }).eq("student_id", studentId);
    await db.from("xp_events").insert({ student_id: studentId, event_type: "stepbystep", xp: xpGain, coins: 0, description: `Forca errado: ${word.word}` });
    await db.from("stepbystep_attempts").insert({ student_id: studentId, vocabulary_id: word.id, exercise_type: "hangman", correct: false, xp_earned: xpGain, mission_id: mission?.id || null });
    setSessionXp(prev => prev + xpGain);
    await refreshGamification();
  }, [studentId, word, gamification, mission, refreshGamification]);

  const handleGuess = useCallback(async (letter: string) => {
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
  }, [word, guessed, errors, gameState, handleWin, handleLoss]);

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
        {/* Steppie header */}
        <div className="flex items-center gap-3">
          <img src={steppieGritando} alt="" aria-hidden="true" className="w-12 shrink-0" />
          <h2 className="text-lg font-bold">Step by Step</h2>
        </div>

        {/* ── Daily mission ─── */}
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
                <Zap className="h-3 w-3" style={{ fill: 'var(--theme-accent)', color: 'var(--theme-accent)' }} />{mission?.xp_earned ?? 0} XP hoje
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

        {/* ── Game selector overlay ─── */}
        {!gameSelected ? (
          <div className="space-y-3">
            <p className="text-sm font-bold px-1">Escolha um jogo</p>
            <div className="grid grid-cols-2 gap-3">
              {MODE_CONFIG.map(m => (
                <button
                  key={m.id}
                  onClick={() => { setMode(m.id); setGameSelected(true); }}
                  className="flex flex-col items-start gap-1 p-4 rounded-2xl border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-all text-left"
                >
                  <span className="text-2xl">{m.emoji}</span>
                  <span className="text-sm font-bold leading-tight">{m.label}</span>
                  <span className="text-xs text-muted-foreground font-light leading-tight">{m.desc}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {MODE_CONFIG.find(m => m.id === mode)?.emoji}{" "}
                  {MODE_CONFIG.find(m => m.id === mode)?.label}
                </CardTitle>
                <button
                  onClick={() => setGameSelected(false)}
                  className="text-xs text-muted-foreground font-light hover:text-foreground transition-colors"
                >
                  Trocar jogo
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Hangman — sem alteração */}
              {mode === "hangman" && (
                gameState === "no_vocab" ? (
                  <div className="py-8 text-center space-y-2">
                    <p className="font-bold text-sm">Nenhuma palavra cadastrada</p>
                    <p className="text-xs text-muted-foreground font-light">Peça ao professor para adicionar vocabulário.</p>
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
                    {/* Hints */}
                    {isPlaying && (
                      <div className="space-y-2">
                        {hintsUsed >= 1 && word?.translation && (
                          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground bg-muted/40 rounded-lg py-2 px-3">
                            <span>💡</span>
                            <span>Tradução: <span className="font-bold text-foreground">{word.translation}</span></span>
                          </div>
                        )}
                        {hintsUsed >= 2 && word?.example_sentence && (
                          <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/40 rounded-lg py-2 px-3">
                            <span className="shrink-0">💡</span>
                            <span className="italic">"{word.example_sentence}"</span>
                          </div>
                        )}
                        {(() => {
                          const maxHints = word?.example_sentence ? 2 : (word?.translation ? 1 : 0);
                          const canHint = hintsUsed < maxHints && errors < MAX_ERRORS - 1;
                          if (maxHints === 0) return null;
                          return (
                            <button
                              onClick={() => {
                                if (!canHint) return;
                                setErrors(e => e + 1);
                                setHintsUsed(h => h + 1);
                              }}
                              disabled={!canHint}
                              className="w-full text-xs text-muted-foreground border border-dashed border-muted-foreground/30 rounded-lg py-1.5 hover:bg-muted/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {canHint
                                ? `💡 Ver dica ${hintsUsed + 1} de ${maxHints} (+1 erro)`
                                : hintsUsed >= maxHints ? "Todas as dicas reveladas" : "Sem dicas disponíveis"}
                            </button>
                          );
                        })()}
                      </div>
                    )}
                    {isPlaying && <Keyboard guessed={guessed} correctLetters={correctLetters} onLetter={handleGuess} disabled={!isPlaying} />}
                    {(gameState === "won" || gameState === "lost") && (
                      <Button className="w-full font-bold" style={{ background: 'var(--theme-accent)', color: 'var(--theme-text-on-accent)' }} onClick={() => pickHangmanWord(words)}>
                        {gameState === "won" ? "Próxima palavra →" : "Tentar outra →"}
                      </Button>
                    )}
                  </>
                )
              )}

              {/* Fill in the blank — sem alteração */}
              {mode === "fillblank" && studentId && (
                <FillBlankGame
                  words={words}
                  studentId={studentId}
                  mission={mission}
                  onMissionUpdate={setMission}
                  onSessionXp={xp => setSessionXp(prev => prev + xp)}
                />
              )}

              {/* Translation */}
              {mode === "translation" && studentId && (
                <TranslationGame
                  words={words}
                  studentId={studentId}
                  mission={mission}
                  onMissionUpdate={setMission}
                  onSessionXp={xp => setSessionXp(prev => prev + xp)}
                />
              )}

              {/* Matching */}
              {mode === "matching" && studentId && (
                <MatchingGame
                  words={words}
                  studentId={studentId}
                  mission={mission}
                  onMissionUpdate={setMission}
                  onSessionXp={xp => setSessionXp(prev => prev + xp)}
                />
              )}

              {/* Scramble */}
              {mode === "scramble" && studentId && (
                <ScrambleGame
                  words={words}
                  studentId={studentId}
                  mission={mission}
                  onMissionUpdate={setMission}
                  onSessionXp={xp => setSessionXp(prev => prev + xp)}
                />
              )}

              {/* Against the Clock */}
              {mode === "clock" && studentId && (
                <ClockGame
                  words={words}
                  studentId={studentId}
                  mission={mission}
                  onMissionUpdate={setMission}
                  onSessionXp={xp => setSessionXp(prev => prev + xp)}
                />
              )}

              {/* Survival */}
              {mode === "survival" && studentId && (
                <SurvivalGame
                  words={words}
                  studentId={studentId}
                  mission={mission}
                  onMissionUpdate={setMission}
                  onSessionXp={xp => setSessionXp(prev => prev + xp)}
                />
              )}

            </CardContent>
          </Card>
        )}

        {/* ── Streak ─── */}
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

        {/* ── Session XP ─── */}
        {sessionXp > 0 && (
          <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground font-light pb-2">
            <Zap className="h-4 w-4" style={{ fill: 'var(--theme-accent)', color: 'var(--theme-accent)' }} />
            <span><span className="font-bold text-primary">+{sessionXp} XP</span> nesta sessão</span>
          </div>
        )}
      </div>
    </StudentLayout>
  );
};

export default StepByStep;
