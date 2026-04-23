import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useGamification } from "@/contexts/GamificationContext";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import PDFViewer from "@/components/PDFViewer";
import VoiceRecorder from "@/components/VoiceRecorder";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen, Headphones, FileText, PenLine, Eye, EyeOff,
  ChevronDown, ChevronUp, CheckCircle2, XCircle, Zap,
  RotateCcw, Mic, GraduationCap, ExternalLink, AlertTriangle,
  Lock, Check, CheckCheck, History,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentInfo {
  id: string;
  current_step_id: string | null;
  levelId: string | null;
  unitId: string | null;
  stepNumber: number;
  stepTitle: string | null;
  totalSteps: number;
  levelCode: string;
  levelName: string;
  languageName: string;
  meetLink: string | null;
  // Viewing step — may differ from current when ?step_id= param is set
  viewingStepId: string | null;
  viewingStepNumber: number;
  viewingStepTitle: string | null;
  viewingUnitId: string | null;
  isPastStep: boolean;
}

interface VocabWord {
  id: string;
  word: string;
  translation: string;
  example_sentence: string | null;
  part_of_speech: string;
  difficulty: number;
  created_at: string;
}

interface GrammarRule {
  id: string;
  title: string;
  explanation: string;
  examples: { sentence: string; translation: string; highlight: string }[] | null;
  tip: string | null;
  order_index: number;
}

interface Material {
  id: string;
  title: string;
  type: string;
  delivery: string;
  file_url: string | null;
  accessed: boolean;
}

interface Exercise {
  id: string;
  type: "fill_blank" | "association" | "rewrite" | "production" | "dialogue";
  question: string;
  options: { left: string; right: string }[] | null;
  answer: string;
  explanation: string | null;
}

type ExStatus = "pending" | "correct" | "wrong" | "submitted";

interface StepProgress {
  id: string;
  number: number;
  title: string | null;
  type: string;
  status: "done" | "available" | "locked";
  isCurrentStep: boolean;
}

interface UnitWithSteps {
  id: string;
  number: number;
  title: string;
  steps: StepProgress[];
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Icons / labels ───────────────────────────────────────────────────────────

const typeIcons: Record<string, React.ReactNode> = {
  vocab:    <BookOpen className="h-5 w-5" />,
  audio:    <Headphones className="h-5 w-5" />,
  grammar:  <FileText className="h-5 w-5" />,
  exercise: <PenLine className="h-5 w-5" />,
  slide:    <FileText className="h-5 w-5" />,
};

const typeLabels: Record<string, string> = {
  vocab:    "Vocabulário",
  audio:    "Áudio",
  grammar:  "Gramática",
  exercise: "Exercício",
  slide:    "Slide",
};

// ─── CollapsibleSection ───────────────────────────────────────────────────────

const CollapsibleSection = ({
  title,
  badge,
  children,
  defaultOpen = true,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center justify-between w-full group"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold uppercase tracking-wide text-muted-foreground group-hover:text-foreground transition-colors">
            {title}
          </span>
          {badge && (
            <Badge variant="secondary" className="text-[10px] font-light px-1.5 py-0">
              {badge}
            </Badge>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  );
};

// ─── MaterialCard ─────────────────────────────────────────────────────────────

const MaterialCard = ({
  material,
  onOpen,
}: {
  material: Material;
  onOpen: (m: Material) => void;
}) => (
  <Card
    className="cursor-pointer hover:border-primary/30 transition-colors"
    onClick={() => onOpen(material)}
  >
    <CardContent className="flex items-center gap-3 py-3 px-4">
      <div className="text-primary shrink-0">
        {typeIcons[material.type] || <FileText className="h-5 w-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold truncate">{material.title}</p>
        <p className="text-xs text-muted-foreground font-light">{typeLabels[material.type] || material.type}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {material.accessed ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Eye className="h-3 w-3" /> Visto
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-primary font-bold">
            <EyeOff className="h-3 w-3" /> Novo
          </span>
        )}
      </div>
    </CardContent>
  </Card>
);

// ─── Exercise sub-components ──────────────────────────────────────────────────

const XpBadge = ({ xp, coins }: { xp: number; coins: number }) => (
  <div className="flex items-center gap-3 text-sm font-light text-muted-foreground">
    {xp > 0 && (
      <span className="flex items-center gap-1 text-primary font-bold">
        <Zap className="h-3.5 w-3.5" style={{ fill: "var(--theme-accent)", color: "var(--theme-accent)" }} />
        +{xp} XP
      </span>
    )}
    {coins > 0 && <span className="font-bold">+{coins} 🪙</span>}
  </div>
);

const FillBlank = ({
  exercise, status, value, onChange, onSubmit,
}: {
  exercise: Exercise; status: ExStatus; value: string;
  onChange: (v: string) => void; onSubmit: () => void;
}) => {
  const parts = exercise.question.split(/(\[___\])/g);
  return (
    <div className="space-y-4">
      <p className="text-base font-light leading-relaxed">
        {parts.map((part, i) =>
          part === "[___]" ? (
            <span key={i} className="inline-block border-b-2 border-primary px-3 font-bold text-primary min-w-[80px] text-center">
              {status !== "pending" ? exercise.answer : "___"}
            </span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </p>
      {status === "pending" && (
        <>
          <Input value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => e.key === "Enter" && onSubmit()} placeholder="Digite sua resposta..." className="text-base" autoFocus />
          <Button onClick={onSubmit} disabled={!value.trim()} className="w-full bg-primary text-primary-foreground font-bold">Confirmar</Button>
        </>
      )}
      {status === "correct" && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-600">
          <CheckCircle2 className="h-5 w-5 shrink-0" /><span className="font-bold text-sm">Correto! +10 XP +5 🪙</span>
        </div>
      )}
      {status === "wrong" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-600">
            <XCircle className="h-5 w-5 shrink-0" /><span className="text-sm"><span className="font-bold">Resposta:</span> {exercise.answer}</span>
          </div>
          {exercise.explanation && <p className="text-xs text-muted-foreground font-light italic px-1">{exercise.explanation}</p>}
          <p className="text-xs text-muted-foreground font-light px-1">+2 XP por tentar</p>
        </div>
      )}
    </div>
  );
};

const Association = ({
  exercise, status, selectedLeft, pairs, shuffledRight, onLeftClick, onRightClick, onConfirm,
}: {
  exercise: Exercise; status: ExStatus; selectedLeft: number | null;
  pairs: Record<number, number>; shuffledRight: string[];
  onLeftClick: (i: number) => void; onRightClick: (i: number) => void; onConfirm: () => void;
}) => {
  const opts = exercise.options || [];
  const allPaired = Object.keys(pairs).length === opts.length;
  const isCorrectPair = (leftIdx: number, rightIdx: number) => shuffledRight[rightIdx] === opts[leftIdx]?.right;
  return (
    <div className="space-y-4">
      <p className="text-sm font-light text-muted-foreground">Toque em um item de cada coluna para formar os pares.</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          {opts.map((opt, i) => {
            const isPaired = pairs[i] !== undefined;
            const correct = status !== "pending" && isPaired && isCorrectPair(i, pairs[i]);
            const wrong = status !== "pending" && isPaired && !isCorrectPair(i, pairs[i]);
            return (
              <button key={i} onClick={() => onLeftClick(i)} disabled={status !== "pending"}
                className={cn("w-full rounded-lg p-2.5 text-sm text-left transition-all border-2",
                  selectedLeft === i && "border-primary bg-primary/10",
                  isPaired && status === "pending" && "border-primary/40 bg-primary/5",
                  correct && "border-green-500 bg-green-500/10 text-green-700",
                  wrong && "border-red-500 bg-red-500/10 text-red-700",
                  !isPaired && selectedLeft !== i && status === "pending" && "border-border bg-card"
                )}>{opt.left}</button>
            );
          })}
        </div>
        <div className="space-y-2">
          {shuffledRight.map((right, i) => {
            const pairedWithLeft = Object.entries(pairs).find(([, ri]) => ri === i);
            const isPaired = pairedWithLeft !== undefined;
            const leftIdx = isPaired ? parseInt(pairedWithLeft![0]) : -1;
            const correct = status !== "pending" && isPaired && isCorrectPair(leftIdx, i);
            const wrong = status !== "pending" && isPaired && !isCorrectPair(leftIdx, i);
            return (
              <button key={i} onClick={() => onRightClick(i)} disabled={status !== "pending"}
                className={cn("w-full rounded-lg p-2.5 text-sm text-left transition-all border-2",
                  isPaired && status === "pending" && "border-primary/40 bg-primary/5",
                  correct && "border-green-500 bg-green-500/10 text-green-700",
                  wrong && "border-red-500 bg-red-500/10 text-red-700",
                  !isPaired && status === "pending" && "border-border bg-card"
                )}>{right}</button>
            );
          })}
        </div>
      </div>
      {status === "pending" && <Button onClick={onConfirm} disabled={!allPaired} className="w-full bg-primary text-primary-foreground font-bold">Confirmar pares</Button>}
      {status === "correct" && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-600">
          <CheckCircle2 className="h-5 w-5 shrink-0" /><span className="font-bold text-sm">Todos corretos! +10 XP +5 🪙</span>
        </div>
      )}
      {status === "wrong" && (
        <div className="p-3 rounded-lg bg-red-500/10 text-red-600 text-sm">
          <p className="font-bold">Alguns pares incorretos. +2 XP por tentar.</p>
          <p className="text-xs mt-1 font-light">Revise os pares corretos acima.</p>
        </div>
      )}
    </div>
  );
};

const OpenAnswer = ({
  exercise, status, value, onChange, onSubmit, isProduction,
}: {
  exercise: Exercise; status: ExStatus; value: string;
  onChange: (v: string) => void; onSubmit: () => void; isProduction: boolean;
}) => (
  <div className="space-y-4">
    <p className="text-base font-light leading-relaxed">{exercise.question}</p>
    {status === "pending" && (
      <>
        <Textarea value={value} onChange={e => onChange(e.target.value)} placeholder={isProduction ? "Escreva sua resposta..." : "Reescreva a frase..."} className="text-base resize-none font-light" rows={isProduction ? 4 : 3} autoFocus />
        <Button onClick={onSubmit} disabled={!value.trim()} className="w-full bg-primary text-primary-foreground font-bold">Enviar</Button>
      </>
    )}
    {status === "submitted" && (
      <div className="space-y-3">
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
          <p className="text-xs text-muted-foreground font-light mb-1">{isProduction ? "Exemplo de resposta:" : "Sugestão de resposta:"}</p>
          <p className="text-sm font-bold">{exercise.answer}</p>
        </div>
        {exercise.explanation && <p className="text-xs text-muted-foreground font-light italic px-1">{exercise.explanation}</p>}
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-600">
          <CheckCircle2 className="h-5 w-5 shrink-0" /><span className="font-bold text-sm">Enviado! +10 XP +5 🪙</span>
        </div>
      </div>
    )}
  </div>
);

// ─── ExercisesEngine ──────────────────────────────────────────────────────────

type AttemptMap = Record<string, { answer_given: string; correct: boolean; xp_earned: number }>;

const ExercisesEngine = ({
  exercises,
  studentId,
  initialAttempts,
  onXpEarned,
  onAllDone,
}: {
  exercises: Exercise[];
  studentId: string;
  initialAttempts: AttemptMap;
  onXpEarned?: (xp: number, coins: number) => void;
  onAllDone?: () => void;
}) => {
  const { gamification, refresh: refreshGamification } = useGamification();

  // Start from first unattempted exercise; if all done → show done screen
  const firstUnattempted = useMemo(
    () => exercises.findIndex(ex => !initialAttempts[ex.id]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // compute once on mount
  );
  const allPreviouslyDone = firstUnattempted === -1 && exercises.length > 0;

  const [currentIndex, setCurrentIndex] = useState(() => allPreviouslyDone ? 0 : Math.max(0, firstUnattempted));
  const [status, setStatus] = useState<ExStatus>("pending");
  const [answer, setAnswer] = useState("");
  const [sessionXp, setSessionXp] = useState(0);
  const [sessionCoins, setSessionCoins] = useState(0);
  const [done, setDone] = useState(() => allPreviouslyDone);
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [pairs, setPairs] = useState<Record<number, number>>({});
  const [shuffledRight, setShuffledRight] = useState<string[]>([]);

  useEffect(() => {
    setStatus("pending");
    setAnswer("");
    setSelectedLeft(null);
    setPairs({});
    const ex = exercises[currentIndex];
    if (ex?.type === "association" && ex.options) {
      setShuffledRight(shuffleArray(ex.options.map(o => o.right)));
    }
  }, [currentIndex, exercises]);

  const awardXp = useCallback(async (exerciseId: string, answerGiven: string, xpAmount: number, coinsAmount: number, correct: boolean) => {
    const sid = studentId || gamification.studentId;
    if (!sid) return;

    // Check first time — only give XP + insert attempt if no previous record
    const { data: existing } = await (supabase as any)
      .from("lesson_exercise_attempts")
      .select("id")
      .eq("student_id", sid)
      .eq("exercise_id", exerciseId)
      .maybeSingle();

    const isFirstTime = !existing;
    const actualXp = isFirstTime ? xpAmount : 0;
    const actualCoins = isFirstTime ? coinsAmount : 0;

    if (isFirstTime) {
      await (supabase as any).from("lesson_exercise_attempts").insert({
        student_id: sid,
        exercise_id: exerciseId,
        answer_given: answerGiven,
        correct,
        xp_earned: actualXp,
      });
    }

    if (actualXp > 0) {
      await (supabase as any).from("student_gamification").update({
        xp_total: gamification.xp_total + actualXp,
        coins: gamification.coins + actualCoins,
        updated_at: new Date().toISOString(),
      }).eq("student_id", sid);
      const ex = exercises[currentIndex];
      await (supabase as any).from("xp_events").insert({
        student_id: sid, event_type: "lesson_exercise",
        xp: actualXp, coins: actualCoins,
        description: correct ? `Correto: ${ex?.question?.slice(0, 50)}` : `Tentativa: ${ex?.question?.slice(0, 50)}`,
      });
      setSessionXp(prev => prev + actualXp);
      setSessionCoins(prev => prev + actualCoins);
      onXpEarned?.(actualXp, actualCoins);
      await refreshGamification();
      supabase.functions.invoke("update-streak").catch(() => {});
    }
  }, [studentId, gamification, exercises, currentIndex, refreshGamification, onXpEarned]);

  const handleFillBlankSubmit = async () => {
    const ex = exercises[currentIndex];
    if (!answer.trim()) return;
    const correct = answer.trim().toLowerCase() === ex.answer.trim().toLowerCase();
    setStatus(correct ? "correct" : "wrong");
    await awardXp(ex.id, answer.trim(), correct ? 10 : 2, correct ? 5 : 0, correct);
  };

  const handleOpenSubmit = async () => {
    const ex = exercises[currentIndex];
    if (!answer.trim()) return;
    setStatus("submitted");
    await awardXp(ex.id, answer.trim(), 10, 5, true);
  };

  const handleAssociationConfirm = async () => {
    const ex = exercises[currentIndex];
    if (!ex.options) return;
    let allCorrect = true;
    for (let i = 0; i < ex.options.length; i++) {
      if (shuffledRight[pairs[i]] !== ex.options[i].right) { allCorrect = false; break; }
    }
    const answerStr = ex.options.map((o, i) => `${o.left}=${shuffledRight[pairs[i]] ?? "?"}`).join(";");
    setStatus(allCorrect ? "correct" : "wrong");
    await awardXp(ex.id, answerStr, allCorrect ? 10 : 2, allCorrect ? 5 : 0, allCorrect);
  };

  useEffect(() => {
    if (done) onAllDone?.();
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNext = () => {
    if (currentIndex + 1 >= exercises.length) setDone(true);
    else setCurrentIndex(prev => prev + 1);
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setDone(false);
    setSessionXp(0);
    setSessionCoins(0);
  };

  const completedBefore = firstUnattempted === -1 ? exercises.length : firstUnattempted;
  const progressPercent = ((completedBefore + (currentIndex - completedBefore) + (status !== "pending" ? 1 : 0)) / exercises.length) * 100;
  const canGoNext = status !== "pending";
  const currentExercise = exercises[currentIndex];

  if (done) {
    return (
      <Card>
        <CardContent className="py-6 space-y-4 text-center">
          <div className="h-14 w-14 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 20%, transparent)" }}>
            <CheckCircle2 className="h-7 w-7 text-primary" />
          </div>
          <div>
            <p className="font-bold">Exercícios concluídos! 🎉</p>
            <p className="text-xs text-muted-foreground font-light mt-0.5">
              +{sessionXp} XP · +{sessionCoins} 🪙
            </p>
          </div>
          <Button variant="outline" size="sm" className="w-full text-xs gap-1.5" onClick={handleRestart}>
            <RotateCcw className="h-3.5 w-3.5" /> Refazer exercícios
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Exercício {currentIndex + 1} de {exercises.length}</span>
          <XpBadge xp={sessionXp} coins={sessionCoins} />
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progressPercent}%`, background: "var(--theme-accent)" }} />
        </div>
      </div>

      {/* Exercise card */}
      <Card className={cn("transition-all duration-300", status === "correct" && "border-green-400/50", status === "wrong" && "border-red-400/50")}>
        <CardContent className="pt-5 pb-5 space-y-4">
          <p className="text-xs text-muted-foreground font-light uppercase tracking-wide">
            {currentExercise.type === "fill_blank" && "Complete a frase"}
            {currentExercise.type === "association" && "Associação"}
            {currentExercise.type === "rewrite" && "Reescrita"}
            {currentExercise.type === "production" && "Produção"}
            {currentExercise.type === "dialogue" && "Diálogo"}
          </p>

          {currentExercise.type === "fill_blank" && (
            <FillBlank exercise={currentExercise} status={status} value={answer} onChange={setAnswer} onSubmit={handleFillBlankSubmit} />
          )}
          {currentExercise.type === "association" && (
            <Association exercise={currentExercise} status={status} selectedLeft={selectedLeft} pairs={pairs} shuffledRight={shuffledRight}
              onLeftClick={i => { if (status !== "pending") return; setSelectedLeft(prev => prev === i ? null : i); }}
              onRightClick={i => { if (status !== "pending" || selectedLeft === null) return; setPairs(prev => ({ ...prev, [selectedLeft]: i })); setSelectedLeft(null); }}
              onConfirm={handleAssociationConfirm} />
          )}
          {(currentExercise.type === "rewrite" || currentExercise.type === "dialogue") && (
            <OpenAnswer exercise={currentExercise} status={status} value={answer} onChange={setAnswer} onSubmit={handleOpenSubmit} isProduction={false} />
          )}
          {currentExercise.type === "production" && (
            <OpenAnswer exercise={currentExercise} status={status} value={answer} onChange={setAnswer} onSubmit={handleOpenSubmit} isProduction={true} />
          )}
        </CardContent>
      </Card>

      {canGoNext && (
        <Button className="w-full font-bold" style={{ background: "var(--theme-accent)", color: "var(--theme-text-on-accent)" }} onClick={handleNext}>
          {currentIndex + 1 >= exercises.length ? "Ver resultado" : "Próximo exercício →"}
        </Button>
      )}
    </div>
  );
};

// ─── StepCard ─────────────────────────────────────────────────────────────────

const StepCard = ({
  step,
  onClick,
}: {
  step: StepProgress;
  onClick: () => void;
}) => {
  const isLocked = step.status === "locked";
  return (
    <div
      onClick={isLocked ? undefined : onClick}
      style={{
        cursor: isLocked ? "not-allowed" : "pointer",
        transition: "transform 0.15s",
      }}
      className={cn(
        "aspect-square rounded-lg flex flex-col items-center justify-center text-sm relative select-none",
        !isLocked && "hover:scale-105 active:scale-95",
        step.status === "done" && "bg-primary text-primary-foreground",
        step.status === "available" && "border-2 bg-card",
        step.status === "available" && !step.isCurrentStep && "border-muted-foreground/30 text-foreground",
        step.isCurrentStep && "border-primary text-primary",
        step.status === "locked" && "bg-muted text-muted-foreground",
      )}
    >
      {step.status === "done" ? (
        <>
          <Check className="h-4 w-4" style={{ color: "var(--theme-accent)" }} />
          <span className="text-xs font-bold mt-0.5">{step.number}</span>
        </>
      ) : step.status === "locked" ? (
        <>
          <Lock className="h-3 w-3" />
          <span className="text-xs mt-0.5">{step.number}</span>
        </>
      ) : (
        <span className={cn("font-bold", step.isCurrentStep ? "text-base" : "text-sm")}>
          {step.number}
        </span>
      )}
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const AulaPage = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const paramStepId = searchParams.get("step_id");

  const [view, setView] = useState<"current" | "all">(
    searchParams.get("tab") === "all" ? "all" : "current"
  );
  const [allUnits, setAllUnits] = useState<UnitWithSteps[]>([]);
  const [allLoading, setAllLoading] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);

  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [missedCount, setMissedCount] = useState(0);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabWord[]>([]);
  const [grammar, setGrammar] = useState<GrammarRule[]>([]);
  const [attemptMap, setAttemptMap] = useState<AttemptMap>({});
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfTitle, setPdfTitle] = useState("");
  const [isInherited, setIsInherited] = useState(false);
  const [exercisesAllDone, setExercisesAllDone] = useState(false);
  const [markingAulaDone, setMarkingAulaDone] = useState(false);

  useEffect(() => {
    if (!profile) return;
    loadData();
  }, [profile, paramStepId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    if (!profile) return;
    setLoading(true);

    // Student base data
    const { data: raw } = await supabase
      .from("students")
      .select(`
        id, current_step_id, level_id, onboarding_completed,
        levels!students_level_id_fkey(name, code, total_steps),
        languages!students_language_id_fkey(name),
        steps!students_current_step_id_fkey(number, title, unit_id)
      `)
      .eq("user_id", profile.id)
      .single();

    if (!raw) { setLoading(false); return; }
    const s = raw as any;

    // Meet link (individual → group)
    let meetLink: string | null = null;
    const { data: nextClass } = await supabase
      .from("classes")
      .select("meet_link")
      .eq("student_id", s.id)
      .eq("status", "scheduled")
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    meetLink = nextClass?.meet_link || null;

    if (!meetLink) {
      const { data: gs } = await supabase.from("group_students").select("group_id").eq("student_id", s.id).limit(1).maybeSingle();
      if (gs) {
        const { data: gc } = await supabase.from("classes").select("meet_link").eq("group_id", gs.group_id).eq("status", "scheduled").order("scheduled_at", { ascending: true }).limit(1).maybeSingle();
        meetLink = gc?.meet_link || null;
      }
    }

    // Resolve which step to display content for (param override vs current)
    const isPastStep = !!paramStepId && paramStepId !== s.current_step_id;
    let viewingStepId = paramStepId || s.current_step_id;
    let viewingStepNumber = s.steps?.number || 0;
    let viewingStepTitle: string | null = s.steps?.title || null;
    let viewingUnitId: string | null = s.steps?.unit_id || null;

    if (isPastStep && paramStepId) {
      const { data: pStep } = await supabase
        .from("steps")
        .select("number, title, unit_id")
        .eq("id", paramStepId)
        .single();
      if (pStep) {
        viewingStepNumber = (pStep as any).number;
        viewingStepTitle = (pStep as any).title ?? null;
        viewingUnitId = (pStep as any).unit_id ?? null;
      }
    }

    setStudent({
      id: s.id,
      current_step_id: s.current_step_id,
      levelId: s.level_id || null,
      unitId: s.steps?.unit_id || null,
      stepNumber: s.steps?.number || 0,
      stepTitle: s.steps?.title || null,
      totalSteps: s.levels?.total_steps || 40,
      levelCode: s.levels?.code || "",
      levelName: s.levels?.name || "",
      languageName: s.languages?.name || "",
      meetLink,
      viewingStepId,
      viewingStepNumber,
      viewingStepTitle,
      viewingUnitId,
      isPastStep,
    });

    // Check missed_pending sessions
    const { data: missedRows } = await (supabase as any)
      .from("class_sessions")
      .select("id")
      .eq("student_id", s.id)
      .eq("status", "missed_pending")
      .limit(1);
    setMissedCount(missedRows?.length || 0);

    if (!viewingStepId) { setLoading(false); return; }

    // Parallel data fetching — use viewingStepId (may differ from current_step_id)
    const [stepRes, exercisesRes, accessesRes, personalRes, vocabRes, grammarRes, progressRes] = await Promise.all([
      supabase.from("materials").select("id, title, type, delivery, file_url").eq("step_id", viewingStepId).eq("active", true),
      (supabase as any).from("lesson_exercises").select("id, type, question, options, answer, explanation, order_index").eq("step_id", viewingStepId).eq("active", true).order("order_index"),
      supabase.from("material_accesses").select("material_id").eq("student_id", s.id),
      supabase.from("student_materials").select("material_id, materials(id, title, type, delivery, file_url)").eq("student_id", s.id).eq("is_personal", true),
      s.level_id && viewingUnitId
        ? (supabase as any).from("vocabulary").select("id, word, translation, example_sentence, part_of_speech, difficulty, created_at").eq("level_id", s.level_id).eq("unit_id", viewingUnitId).eq("active", true).order("word")
        : Promise.resolve({ data: [] }),
      (supabase as any).from("step_grammar").select("id, title, explanation, examples, tip, order_index").eq("step_id", viewingStepId).eq("active", true).order("order_index"),
      (supabase as any).from("student_progress").select("is_inherited").eq("student_id", s.id).eq("step_id", viewingStepId).maybeSingle(),
    ]);

    // Fetch attempts for current step exercises (for resume + XP dedup)
    const exerciseIds = ((exercisesRes.data || []) as any[]).map((e: any) => e.id);
    const attemptsRes = exerciseIds.length > 0
      ? await (supabase as any).from("lesson_exercise_attempts")
          .select("exercise_id, answer_given, correct, xp_earned")
          .eq("student_id", s.id)
          .in("exercise_id", exerciseIds)
      : { data: [] };
    const aMap = Object.fromEntries(
      ((attemptsRes.data || []) as any[]).map((a: any) => [a.exercise_id, a])
    );
    setAttemptMap(aMap);
    setIsInherited(progressRes?.data?.is_inherited ?? false);
    // Check if all exercises were already done
    const exList = (exercisesRes.data as Exercise[]) || [];
    setExercisesAllDone(exList.length > 0 && exList.every(e => !!aMap[e.id]));

    const accessedIds = new Set((accessesRes.data || []).map((a: any) => a.material_id));

    const stepMats: Material[] = ((stepRes.data || []) as any[]).map(m => ({ ...m, accessed: accessedIds.has(m.id) }));
    const personalMats: Material[] = ((personalRes.data || []) as any[]).map((sm: any) => sm.materials).filter(Boolean).map((m: any) => ({ ...m, accessed: accessedIds.has(m.id) }));

    const seen = new Set<string>();
    const combined: Material[] = [];
    for (const m of [...stepMats, ...personalMats]) {
      if (!seen.has(m.id)) { seen.add(m.id); combined.push(m); }
    }
    setMaterials(combined);
    setExercises((exercisesRes.data as Exercise[]) || []);
    setVocabulary((vocabRes.data as VocabWord[]) || []);
    setGrammar((grammarRes.data as GrammarRule[]) || []);
    setLoading(false);
  };

  // Lazy-load units map when user switches to 'all' view
  useEffect(() => {
    if (view === "all" && !allLoaded && student) {
      loadAllUnits();
    }
  }, [view, student, allLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAllUnits = async () => {
    if (!student?.levelId) return;
    setAllLoading(true);
    try {
      const { data: unitsData } = await (supabase as any)
        .from("units")
        .select("id, number, title")
        .eq("level_id", student.levelId)
        .order("number");

      if (!unitsData || unitsData.length === 0) {
        setAllUnits([]);
        setAllLoaded(true);
        return;
      }

      const unitIds = (unitsData as any[]).map((u: any) => u.id);

      const { data: stepsData } = await (supabase as any)
        .from("steps")
        .select("id, number, title, type, unit_id")
        .in("unit_id", unitIds)
        .order("number");

      if (!stepsData || (stepsData as any[]).length === 0) {
        setAllUnits((unitsData as any[]).map((u: any) => ({ ...u, steps: [] })));
        setAllLoaded(true);
        return;
      }

      const stepIds = (stepsData as any[]).map((s: any) => s.id);

      const { data: progressData } = await (supabase as any)
        .from("student_progress")
        .select("step_id, status")
        .eq("student_id", student.id)
        .in("step_id", stepIds);

      const progressMap = new Map<string, string>(
        ((progressData || []) as any[]).map((p: any) => [p.step_id, p.status])
      );

      const units: UnitWithSteps[] = (unitsData as any[]).map((unit: any) => ({
        id: unit.id,
        number: unit.number,
        title: unit.title,
        steps: (stepsData as any[])
          .filter((s: any) => s.unit_id === unit.id)
          .map((step: any) => {
            const progressStatus = progressMap.get(step.id);
            const isCurrentStep = step.id === student.current_step_id;
            let status: "done" | "available" | "locked";
            if (progressStatus === "done") status = "done";
            else if (progressStatus === "available" || isCurrentStep) status = "available";
            else status = "locked";
            return {
              id: step.id,
              number: step.number,
              title: step.title ?? null,
              type: step.type,
              status,
              isCurrentStep,
            };
          }),
      }));

      setAllUnits(units);
      setAllLoaded(true);
    } catch {
      setAllUnits([]);
    } finally {
      setAllLoading(false);
    }
  };

  const openMaterial = async (m: Material) => {
    if (!m.file_url || !student) return;
    if (m.type === "audio") {
      setAudioUrl(m.file_url);
    } else {
      setPdfTitle(m.title);
      setPdfUrl(m.file_url);
    }
    if (!m.accessed) {
      await (supabase as any).from("material_accesses").upsert(
        { student_id: student.id, material_id: m.id, accessed_at: new Date().toISOString() },
        { onConflict: "student_id,material_id" }
      );
      setMaterials(prev => prev.map(mat => mat.id === m.id ? { ...mat, accessed: true } : mat));
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────
  const beforeMats = materials.filter(m => m.delivery === "before");
  const afterMats  = materials.filter(m => m.delivery === "after" || m.delivery === "during");

  // "Marcar aula como concluída" logic
  const slideMats     = materials.filter(m => m.type === "slide");
  const hasSlide      = slideMats.length > 0;
  const hasExercises  = exercises.length > 0;
  const slideViewed   = hasSlide && slideMats.every(m => m.accessed);
  // stepIsReady: has BOTH slide AND exercises → strict requirement
  const stepIsReady   = hasSlide && hasExercises;
  const canMarkAulaDone = !stepIsReady || (slideViewed && exercisesAllDone);

  const handleMarkAulaDone = async () => {
    if (!student || markingAulaDone) return;
    setMarkingAulaDone(true);
    try {
      await (supabase as any).from("student_progress").upsert(
        {
          student_id: student.id,
          step_id: student.current_step_id,
          status: "done",
          done_at: new Date().toISOString(),
          is_inherited: false,
        },
        { onConflict: "student_id,step_id" }
      );
      setIsInherited(false);
    } finally {
      setMarkingAulaDone(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <StudentLayout>
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-4 w-1/2 rounded" />
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </StudentLayout>
    );
  }

  // ── No step ───────────────────────────────────────────────────────────────
  if (!student?.viewingStepId) {
    return (
      <StudentLayout>
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
          <GraduationCap className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-bold">Jornada ainda não iniciada</h2>
          <p className="text-sm text-muted-foreground font-light">
            Seu professor ainda não iniciou sua jornada. Entre em contato para começar.
          </p>
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="relative space-y-5">
        {/* Missed sessions overlay */}
        {missedCount > 0 && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-xl bg-background/90 backdrop-blur-sm text-center p-6">
            <AlertTriangle className="h-10 w-10 text-amber-500" />
            <div className="space-y-1">
              <p className="font-bold text-base">Aulas com falta pendente</p>
              <p className="text-sm text-muted-foreground font-light max-w-xs">
                Você tem {missedCount === 1 ? "uma aula" : `${missedCount} aulas`} com falta confirmada.
                Remarcasse para continuar acessando o conteúdo.
              </p>
            </div>
            <Button onClick={() => navigate("/")} className="gap-2">
              Ir para o início
            </Button>
          </div>
        )}

        {/* ── View selector ── */}
        <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
          <button
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
              view === "current"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setView("current")}
          >
            Aula atual
          </button>
          <button
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
              view === "all"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setView("all")}
          >
            Todas as aulas
          </button>
        </div>

        {view === "current" ? (
          <>
            {/* ── Past step banner ── */}
            {student.isPastStep && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <History className="h-4 w-4 text-primary shrink-0" />
                  <p className="text-xs text-primary font-medium">
                    Você está revisando a aula anterior (Passo {student.viewingStepNumber})
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-xs font-bold text-primary hover:text-primary/80 px-2"
                  onClick={() => navigate("/aula")}
                >
                  Ir para aula atual
                </Button>
              </div>
            )}

            {/* ── Header ── */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-light uppercase tracking-wide">
                {student.isPastStep ? "Revisando aula anterior" : "Aula atual"}
              </p>
              <h1 className="text-xl font-bold leading-tight">
                {student.viewingStepTitle || `Passo ${student.viewingStepNumber}`}
              </h1>
              <p className="text-xs text-muted-foreground font-light">
                {student.languageName} · {student.levelCode} · Step {student.viewingStepNumber} de {student.totalSteps}
              </p>
            </div>

            {/* ── Inherited warning banner ── */}
            {isInherited && !student.isPastStep && (
              <div className="flex items-start gap-3 rounded-xl border border-yellow-400/40 bg-yellow-400/10 p-3">
                <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-800 dark:text-yellow-300 leading-relaxed">
                  Essa aula parece não ter sido concluída por você, porém sua turma já passou dessa aula.
                  Visualize o material e faça os exercícios para concluir essa aula.
                </p>
              </div>
            )}

            {/* ── Meet button ── */}
            {student.meetLink && !student.isPastStep && (
              <Button
                className="w-full font-bold h-12"
                style={{ background: "var(--theme-accent)", color: "var(--theme-text-on-accent)" }}
                onClick={() => window.open(student.meetLink!, "_blank")}
              >
                <ExternalLink className="h-5 w-5 mr-2" />
                Entrar na aula
              </Button>
            )}

            {/* ── Antes da aula ── */}
            <CollapsibleSection title="Antes da aula">
              {beforeMats.length === 0 ? (
                <Card>
                  <CardContent className="py-6 text-center">
                    <p className="text-sm text-muted-foreground font-light">Nenhum material disponível para este momento.</p>
                  </CardContent>
                </Card>
              ) : (
                beforeMats.map(m => <MaterialCard key={m.id} material={m} onOpen={openMaterial} />)
              )}
            </CollapsibleSection>

            {/* ── Exercícios ── */}
            <CollapsibleSection
              title="Exercícios da aula"
              badge={exercises.length > 0 ? `${exercises.length} exercício${exercises.length !== 1 ? "s" : ""}` : undefined}
            >
              {exercises.length === 0 ? (
                <Card>
                  <CardContent className="py-6 text-center">
                    <p className="text-sm text-muted-foreground font-light">Nenhum exercício cadastrado para esta aula ainda.</p>
                  </CardContent>
                </Card>
              ) : (
                <ExercisesEngine exercises={exercises} studentId={student.id} initialAttempts={attemptMap} onAllDone={() => setExercisesAllDone(true)} />
              )}
            </CollapsibleSection>

            {/* ── Vocabulário da Aula ── */}
            <CollapsibleSection
              title="Vocabulário da Aula"
              badge={vocabulary.length > 0 ? `${vocabulary.length}` : undefined}
              defaultOpen={false}
            >
              {vocabulary.length === 0 ? (
                <Card>
                  <CardContent className="py-6 text-center">
                    <p className="text-sm text-muted-foreground font-light">Nenhum vocabulário cadastrado para esta aula ainda.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {vocabulary.map(word => {
                    const isNew = new Date(word.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                    const posLabels: Record<string, string> = {
                      noun: "subs.", verb: "verbo", adjective: "adj.", adverb: "adv.",
                      expression: "expr.", other: "outro",
                    };
                    return (
                      <Card key={word.id}>
                        <CardContent className="py-3 px-4 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-bold text-sm">{word.word}</p>
                              <p className="text-xs text-muted-foreground font-light">{word.translation}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 pt-0.5">
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-light">
                                {posLabels[word.part_of_speech] || word.part_of_speech}
                              </Badge>
                              {isNew && (
                                <Badge className="text-[10px] px-1.5 py-0" style={{ background: "var(--theme-accent)", color: "var(--theme-text-on-accent)" }}>
                                  Novo
                                </Badge>
                              )}
                            </div>
                          </div>
                          {word.example_sentence && (
                            <p className="text-xs text-muted-foreground italic font-light">{word.example_sentence}</p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CollapsibleSection>

            {/* ── Gramática da Aula ── */}
            <CollapsibleSection
              title="Gramática da Aula"
              badge={grammar.length > 0 ? `${grammar.length} regr${grammar.length !== 1 ? "as" : "a"}` : undefined}
              defaultOpen={false}
            >
              {grammar.length === 0 ? (
                <Card>
                  <CardContent className="py-6 text-center">
                    <p className="text-sm text-muted-foreground font-light">Nenhuma regra gramatical cadastrada para esta aula ainda.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {grammar.map(rule => (
                    <Card key={rule.id}>
                      <CardContent className="pt-4 pb-4 space-y-2">
                        <p className="font-bold text-sm">{rule.title}</p>
                        <p className="text-sm font-light text-muted-foreground leading-relaxed">{rule.explanation}</p>
                        {rule.examples && rule.examples.length > 0 && (
                          <div className="space-y-2 pt-1">
                            {rule.examples.map((ex, i) => (
                              <div key={i} className="border-l-2 pl-3" style={{ borderColor: "var(--theme-accent)" }}>
                                <p
                                  className="text-sm"
                                  dangerouslySetInnerHTML={{
                                    __html: ex.highlight && ex.sentence
                                      ? ex.sentence.replace(
                                          new RegExp(`(${ex.highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"),
                                          '<mark style="background:color-mix(in srgb, var(--theme-accent) 25%, transparent);padding:0 2px;border-radius:2px">$1</mark>'
                                        )
                                      : (ex.sentence || ""),
                                  }}
                                />
                                <p className="text-xs text-muted-foreground font-light">{ex.translation}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        {rule.tip && (
                          <div className="flex items-start gap-1.5 bg-muted/50 rounded-lg p-2.5 text-xs font-light text-muted-foreground">
                            <span className="shrink-0">💡</span>
                            <span>{rule.tip}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CollapsibleSection>

            {/* ── Após a aula ── */}
            <CollapsibleSection title="Após a aula">
              {afterMats.length === 0 ? (
                <Card>
                  <CardContent className="py-6 text-center">
                    <p className="text-sm text-muted-foreground font-light">Nenhum material disponível para este momento.</p>
                  </CardContent>
                </Card>
              ) : (
                afterMats.map(m => <MaterialCard key={m.id} material={m} onOpen={openMaterial} />)
              )}
            </CollapsibleSection>

            {/* ── Speaking ── */}
            {!student.isPastStep && (
              <Card>
                <CardContent className="pt-5 pb-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Mic className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">Pratique sua pronúncia</p>
                      <p className="text-xs text-muted-foreground font-light">
                        Envie uma gravação para o seu professor avaliar.
                      </p>
                    </div>
                  </div>
                  <VoiceRecorder studentId={student.id} stepId={student.current_step_id} />
                </CardContent>
              </Card>
            )}

            {/* ── Audio player ── */}
            {audioUrl && (
              <Card>
                <CardContent className="py-4">
                  <audio controls className="w-full" src={audioUrl}>Seu navegador não suporta áudio.</audio>
                  <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setAudioUrl(null)}>Fechar player</Button>
                </CardContent>
              </Card>
            )}

            {/* ── Marcar aula como concluída (somente aula atual) ── */}
            {!student.isPastStep && (
              <>
                <Button
                  className="w-full font-bold gap-2"
                  variant={canMarkAulaDone ? "default" : "outline"}
                  disabled={!canMarkAulaDone || markingAulaDone}
                  onClick={handleMarkAulaDone}
                >
                  <CheckCheck className="h-4 w-4" />
                  {markingAulaDone ? "Salvando…" : "Marcar aula como concluída"}
                </Button>
                {stepIsReady && !canMarkAulaDone && (
                  <p className="text-center text-xs text-muted-foreground font-light -mt-3">
                    {!slideViewed && !exercisesAllDone
                      ? "Visualize o slide e faça os exercícios para concluir."
                      : !slideViewed
                      ? "Visualize o slide para concluir."
                      : "Faça os exercícios para concluir."}
                  </p>
                )}
              </>
            )}
          </>
        ) : (
          /* ── All units view ── */
          <div className="space-y-6">
            {allLoading ? (
              <>
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-16 w-full rounded-lg" />
              </>
            ) : allUnits.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center">
                  <p className="text-sm text-muted-foreground font-light">Nenhuma unidade encontrada.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {(() => {
                  const allSteps = allUnits.flatMap(u => u.steps);
                  const doneCount = allSteps.filter(s => s.status === "done").length;
                  const total = allSteps.length;
                  const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;
                  return (
                    <Card>
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between mb-1">
                          <div>
                            <p className="text-sm text-muted-foreground font-light">
                              {student.languageName} · {student.levelName} · {student.levelCode}
                            </p>
                            <p className="text-2xl font-bold text-primary mt-0.5">
                              {percent}% concluído
                            </p>
                            <p className="text-xs text-muted-foreground font-light mt-0.5">
                              {doneCount} de {total} aulas
                            </p>
                          </div>
                          <img
                            src="/steppie/steppie-orgulhoso.webp"
                            alt=""
                            aria-hidden="true"
                            className="w-14 shrink-0 self-end"
                          />
                        </div>
                        <Progress value={percent} className="h-2.5 mt-3" />
                      </CardContent>
                    </Card>
                  );
                })()}
                <div className="grid grid-cols-5 gap-2">
                  {allUnits.flatMap(u => u.steps).map(step => (
                    <StepCard key={step.id} step={step} onClick={() => setView("current")} />
                  ))}
                </div>
                {allUnits.length > 0 && (
                  <div className="flex items-center justify-center gap-5 pt-1 pb-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded bg-primary flex items-center justify-center">
                        <Check className="h-2.5 w-2.5" style={{ color: "var(--theme-accent)" }} />
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
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── PDF Viewer ── */}
      <PDFViewer url={pdfUrl} title={pdfTitle} onClose={() => setPdfUrl(null)} />
    </StudentLayout>
  );
};

export default AulaPage;
