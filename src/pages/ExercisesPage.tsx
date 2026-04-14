import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGamification } from "@/contexts/GamificationContext";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { BookCheck, CheckCircle2, XCircle, Zap, RotateCcw, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import VoiceRecorder from "@/components/VoiceRecorder";

interface Exercise {
  id: string;
  type: "fill_blank" | "association" | "rewrite" | "production" | "dialogue";
  question: string;
  options: { left: string; right: string }[] | null;
  answer: string;
  explanation: string | null;
}

type ExStatus = "pending" | "correct" | "wrong" | "submitted";

// ─── Hangman SVG (reutilizado também no StepByStep) ─────────────────────────
// ─── Utilities ──────────────────────────────────────────────────────────────
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Barra de progresso XP (session) ────────────────────────────────────────
const XpBadge = ({ xp, coins }: { xp: number; coins: number }) => (
  <div className="flex items-center gap-3 text-sm font-light text-muted-foreground">
    {xp > 0 && (
      <span className="flex items-center gap-1 text-primary font-bold">
        <Zap className="h-3.5 w-3.5" style={{ fill: 'var(--theme-accent)', color: 'var(--theme-accent)' }} />
        +{xp} XP
      </span>
    )}
    {coins > 0 && <span className="font-bold">+{coins} 🪙</span>}
  </div>
);

// ─── FillBlank ───────────────────────────────────────────────────────────────
const FillBlank = ({
  exercise,
  status,
  value,
  onChange,
  onSubmit,
}: {
  exercise: Exercise;
  status: ExStatus;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) => {
  const parts = exercise.question.split(/(\[___\])/g);
  return (
    <div className="space-y-4">
      <p className="text-base font-light leading-relaxed">
        {parts.map((part, i) =>
          part === "[___]" ? (
            <span
              key={i}
              className="inline-block border-b-2 border-primary px-3 font-bold text-primary min-w-[80px] text-center"
            >
              {status !== "pending" ? exercise.answer : "___"}
            </span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </p>

      {status === "pending" && (
        <>
          <Input
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => e.key === "Enter" && onSubmit()}
            placeholder="Digite sua resposta..."
            className="text-base"
            autoFocus
          />
          <Button
            onClick={onSubmit}
            disabled={!value.trim()}
            className="w-full bg-primary text-primary-foreground font-bold"
          >
            Confirmar
          </Button>
        </>
      )}

      {status === "correct" && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-600">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span className="font-bold text-sm">Correto! +10 XP +5 🪙</span>
        </div>
      )}

      {status === "wrong" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-600">
            <XCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm">
              <span className="font-bold">Resposta:</span> {exercise.answer}
            </span>
          </div>
          {exercise.explanation && (
            <p className="text-xs text-muted-foreground font-light italic px-1">
              {exercise.explanation}
            </p>
          )}
          <p className="text-xs text-muted-foreground font-light px-1">+2 XP por tentar</p>
        </div>
      )}
    </div>
  );
};

// ─── Association ─────────────────────────────────────────────────────────────
const Association = ({
  exercise,
  status,
  selectedLeft,
  pairs,
  shuffledRight,
  onLeftClick,
  onRightClick,
  onConfirm,
}: {
  exercise: Exercise;
  status: ExStatus;
  selectedLeft: number | null;
  pairs: Record<number, number>;
  shuffledRight: string[];
  onLeftClick: (i: number) => void;
  onRightClick: (i: number) => void;
  onConfirm: () => void;
}) => {
  const opts = exercise.options || [];
  const allPaired = Object.keys(pairs).length === opts.length;

  // Para mostrar resultado: correto ou não
  const isCorrectPair = (leftIdx: number, rightIdx: number) => {
    const correctRight = opts[leftIdx]?.right;
    return shuffledRight[rightIdx] === correctRight;
  };

  return (
    <div className="space-y-4">
      <p className="text-sm font-light text-muted-foreground">
        Toque em um item de cada coluna para formar os pares.
      </p>

      <div className="grid grid-cols-2 gap-2">
        {/* Coluna esquerda */}
        <div className="space-y-2">
          {opts.map((opt, i) => {
            const isPaired = pairs[i] !== undefined;
            const correct = status !== "pending" && isPaired && isCorrectPair(i, pairs[i]);
            const wrong = status !== "pending" && isPaired && !isCorrectPair(i, pairs[i]);
            return (
              <button
                key={i}
                onClick={() => onLeftClick(i)}
                disabled={status !== "pending"}
                className={cn(
                  "w-full rounded-lg p-2.5 text-sm text-left transition-all border-2",
                  selectedLeft === i && "border-primary bg-primary/10",
                  isPaired && status === "pending" && "border-primary/40 bg-primary/5",
                  correct && "border-green-500 bg-green-500/10 text-green-700",
                  wrong && "border-red-500 bg-red-500/10 text-red-700",
                  !isPaired && selectedLeft !== i && status === "pending" && "border-border bg-card"
                )}
              >
                {opt.left}
              </button>
            );
          })}
        </div>

        {/* Coluna direita (embaralhada) */}
        <div className="space-y-2">
          {shuffledRight.map((right, i) => {
            const pairedWithLeft = Object.entries(pairs).find(([, ri]) => ri === i);
            const isPaired = pairedWithLeft !== undefined;
            const leftIdx = isPaired ? parseInt(pairedWithLeft![0]) : -1;
            const correct = status !== "pending" && isPaired && isCorrectPair(leftIdx, i);
            const wrong = status !== "pending" && isPaired && !isCorrectPair(leftIdx, i);
            return (
              <button
                key={i}
                onClick={() => onRightClick(i)}
                disabled={status !== "pending"}
                className={cn(
                  "w-full rounded-lg p-2.5 text-sm text-left transition-all border-2",
                  isPaired && status === "pending" && "border-primary/40 bg-primary/5",
                  correct && "border-green-500 bg-green-500/10 text-green-700",
                  wrong && "border-red-500 bg-red-500/10 text-red-700",
                  !isPaired && status === "pending" && "border-border bg-card"
                )}
              >
                {right}
              </button>
            );
          })}
        </div>
      </div>

      {status === "pending" && (
        <Button
          onClick={onConfirm}
          disabled={!allPaired}
          className="w-full bg-primary text-primary-foreground font-bold"
        >
          Confirmar pares
        </Button>
      )}

      {status === "correct" && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-600">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span className="font-bold text-sm">Todos corretos! +10 XP +5 🪙</span>
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

// ─── Rewrite / Production ────────────────────────────────────────────────────
const OpenAnswer = ({
  exercise,
  status,
  value,
  onChange,
  onSubmit,
  isProduction,
}: {
  exercise: Exercise;
  status: ExStatus;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  isProduction: boolean;
}) => (
  <div className="space-y-4">
    <p className="text-base font-light leading-relaxed">{exercise.question}</p>

    {status === "pending" && (
      <>
        <Textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={isProduction ? "Escreva sua resposta..." : "Reescreva a frase..."}
          className="text-base resize-none font-light"
          rows={isProduction ? 4 : 3}
          autoFocus
        />
        <Button
          onClick={onSubmit}
          disabled={!value.trim()}
          className="w-full bg-primary text-primary-foreground font-bold"
        >
          Enviar
        </Button>
      </>
    )}

    {status === "submitted" && (
      <div className="space-y-3">
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
          <p className="text-xs text-muted-foreground font-light mb-1">
            {isProduction ? "Exemplo de resposta:" : "Sugestão de resposta:"}
          </p>
          <p className="text-sm font-bold">{exercise.answer}</p>
        </div>
        {exercise.explanation && (
          <p className="text-xs text-muted-foreground font-light italic px-1">
            {exercise.explanation}
          </p>
        )}
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-600">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span className="font-bold text-sm">Enviado! +10 XP +5 🪙</span>
        </div>
      </div>
    )}
  </div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────
const ExercisesPage = () => {
  const { profile } = useAuth();
  const { gamification, refresh: refreshGamification } = useGamification();

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState<string | null>(null);

  // Per-exercise state
  const [status, setStatus] = useState<ExStatus>("pending");
  const [answer, setAnswer] = useState("");
  const [sessionXp, setSessionXp] = useState(0);
  const [sessionCoins, setSessionCoins] = useState(0);
  const [done, setDone] = useState(false);
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);

  // Association state
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [pairs, setPairs] = useState<Record<number, number>>({});
  const [shuffledRight, setShuffledRight] = useState<string[]>([]);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    loadExercises();
  }, [profile]);

  const loadExercises = async () => {
    if (!profile) return;
    setLoading(true);
    const { data: student } = await supabase
      .from("students")
      .select("id, current_step_id")
      .eq("user_id", profile.id)
      .maybeSingle();

    if (!student || !student.current_step_id) {
      setLoading(false);
      return;
    }
    setStudentId(student.id);
    setCurrentStepId(student.current_step_id || null);

    const { data: exs } = await (supabase as any)
      .from("lesson_exercises")
      .select("id, type, question, options, answer, explanation")
      .eq("step_id", student.current_step_id)
      .eq("active", true)
      .order("order_index");

    setExercises((exs as Exercise[]) || []);
    setLoading(false);
  };

  // ── Init per-exercise state on index change ───────────────────────────────
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

  // ── Award XP ──────────────────────────────────────────────────────────────
  const awardXp = useCallback(
    async (xpAmount: number, coinsAmount: number, correct: boolean) => {
      const sid = studentId || gamification.studentId;
      if (!sid) return;

      const currentXp = gamification.xp_total;
      const currentCoins = gamification.coins;

      await (supabase as any)
        .from("student_gamification")
        .update({
          xp_total: currentXp + xpAmount,
          coins: currentCoins + coinsAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("student_id", sid);

      const ex = exercises[currentIndex];
      await (supabase as any).from("xp_events").insert({
        student_id: sid,
        event_type: "lesson_exercise",
        xp: xpAmount,
        coins: coinsAmount,
        description: correct
          ? `Correto: ${ex?.question?.slice(0, 50)}`
          : `Tentativa: ${ex?.question?.slice(0, 50)}`,
      });

      setSessionXp(prev => prev + xpAmount);
      setSessionCoins(prev => prev + coinsAmount);

      await refreshGamification();

      // Atualizar streak em background
      supabase.functions.invoke("update-streak").catch(() => {});
    },
    [studentId, gamification, exercises, currentIndex, refreshGamification]
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleFillBlankSubmit = async () => {
    const ex = exercises[currentIndex];
    if (!answer.trim()) return;
    const correct =
      answer.trim().toLowerCase() === ex.answer.trim().toLowerCase();
    setStatus(correct ? "correct" : "wrong");
    await awardXp(correct ? 10 : 2, correct ? 5 : 0, correct);
  };

  const handleOpenSubmit = async () => {
    if (!answer.trim()) return;
    setStatus("submitted");
    await awardXp(10, 5, true);
  };

  const handleAssociationLeftClick = (idx: number) => {
    if (status !== "pending") return;
    setSelectedLeft(prev => (prev === idx ? null : idx));
  };

  const handleAssociationRightClick = (rightIdx: number) => {
    if (status !== "pending" || selectedLeft === null) return;
    setPairs(prev => ({ ...prev, [selectedLeft]: rightIdx }));
    setSelectedLeft(null);
  };

  const handleAssociationConfirm = async () => {
    const ex = exercises[currentIndex];
    if (!ex.options) return;
    let allCorrect = true;
    for (let i = 0; i < ex.options.length; i++) {
      if (shuffledRight[pairs[i]] !== ex.options[i].right) {
        allCorrect = false;
        break;
      }
    }
    setStatus(allCorrect ? "correct" : "wrong");
    await awardXp(allCorrect ? 10 : 2, allCorrect ? 5 : 0, allCorrect);
  };

  const handleNext = () => {
    if (currentIndex + 1 >= exercises.length) {
      setDone(true);
    } else {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setDone(false);
    setSessionXp(0);
    setSessionCoins(0);
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <StudentLayout>
        <div className="space-y-4">
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-3 w-3/4 rounded" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </StudentLayout>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (exercises.length === 0) {
    return (
      <StudentLayout>
        <div className="space-y-4">
          <Card>
            <CardContent className="py-3 flex items-center gap-2">
              <Zap className="h-4 w-4" style={{ fill: 'var(--theme-accent)', color: 'var(--theme-accent)' }} />
              <span className="text-sm font-bold">{gamification.xp_total} XP total</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <BookCheck className="h-12 w-12 text-muted-foreground mx-auto" />
              <p className="font-bold">Nenhum exercício disponível</p>
              <p className="text-sm text-muted-foreground font-light">
                Nenhum exercício disponível para esta aula ainda.
              </p>
            </CardContent>
          </Card>
        </div>
      </StudentLayout>
    );
  }

  // ── Completion screen ─────────────────────────────────────────────────────
  if (done) {
    return (
      <StudentLayout>
        <div className="flex flex-col items-center justify-center py-10 space-y-6 text-center">
          <div className="h-20 w-20 rounded-full flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--theme-accent) 20%, transparent)' }}>
            <CheckCircle2 className="h-10 w-10 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Exercícios concluídos! 🎉</h2>
            <p className="text-sm text-muted-foreground font-light mt-1">
              Você completou todos os exercícios desta aula.
            </p>
          </div>
          <Card className="w-full">
            <CardContent className="py-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-light text-muted-foreground">XP ganho</span>
                <span className="font-bold text-primary flex items-center gap-1">
                  <Zap className="h-4 w-4" style={{ fill: 'var(--theme-accent)', color: 'var(--theme-accent)' }} />
                  +{sessionXp} XP
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-light text-muted-foreground">Coins</span>
                <span className="font-bold">+{sessionCoins} 🪙</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-light text-muted-foreground">XP total</span>
                <span className="font-bold">{gamification.xp_total} XP</span>
              </div>
            </CardContent>
          </Card>
          <Button
            className="w-full font-bold"
            style={{ background: 'var(--theme-accent)', color: 'var(--theme-text-on-accent)' }}
            onClick={handleRestart}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Refazer exercícios
          </Button>

          {/* Speaking section */}
          <Card className="w-full text-left">
            <CardContent className="pt-5 pb-5 space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Mic className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-bold text-sm">Pratique sua pronúncia</p>
                  <p className="text-xs text-muted-foreground font-light">
                    Envie uma gravação falando sobre o tema da aula para o seu professor avaliar.
                  </p>
                </div>
              </div>
              <VoiceRecorder
                studentId={studentId || ""}
                stepId={currentStepId || ""}
              />
            </CardContent>
          </Card>
        </div>
      </StudentLayout>
    );
  }

  // ── Main exercise view ────────────────────────────────────────────────────
  const currentExercise = exercises[currentIndex];
  const progressPercent = (currentIndex / exercises.length) * 100;
  const canGoNext = status !== "pending";

  return (
    <StudentLayout>
      <div className="space-y-4">
        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">
              Exercício {currentIndex + 1} de {exercises.length}
            </span>
            <XpBadge xp={sessionXp} coins={sessionCoins} />
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%`, background: 'var(--theme-accent)' }}
            />
          </div>
        </div>

        {/* Exercise card */}
        <Card
          className={cn(
            "transition-all duration-300",
            status === "correct" && "border-green-400/50",
            status === "wrong" && "border-red-400/50"
          )}
        >
          <CardContent className="pt-5 pb-5 space-y-4">
            {/* Type label */}
            <p className="text-xs text-muted-foreground font-light uppercase tracking-wide">
              {currentExercise.type === "fill_blank" && "Complete a frase"}
              {currentExercise.type === "association" && "Associação"}
              {currentExercise.type === "rewrite" && "Reescrita"}
              {currentExercise.type === "production" && "Produção"}
              {currentExercise.type === "dialogue" && "Diálogo"}
            </p>

            {/* Exercise content */}
            {currentExercise.type === "fill_blank" && (
              <FillBlank
                exercise={currentExercise}
                status={status}
                value={answer}
                onChange={setAnswer}
                onSubmit={handleFillBlankSubmit}
              />
            )}

            {currentExercise.type === "association" && (
              <Association
                exercise={currentExercise}
                status={status}
                selectedLeft={selectedLeft}
                pairs={pairs}
                shuffledRight={shuffledRight}
                onLeftClick={handleAssociationLeftClick}
                onRightClick={handleAssociationRightClick}
                onConfirm={handleAssociationConfirm}
              />
            )}

            {(currentExercise.type === "rewrite" || currentExercise.type === "dialogue") && (
              <OpenAnswer
                exercise={currentExercise}
                status={status}
                value={answer}
                onChange={setAnswer}
                onSubmit={handleOpenSubmit}
                isProduction={false}
              />
            )}

            {currentExercise.type === "production" && (
              <OpenAnswer
                exercise={currentExercise}
                status={status}
                value={answer}
                onChange={setAnswer}
                onSubmit={handleOpenSubmit}
                isProduction={true}
              />
            )}
          </CardContent>
        </Card>

        {/* Next button */}
        {canGoNext && (
          <Button
            className="w-full font-bold"
            style={{ background: 'var(--theme-accent)', color: 'var(--theme-text-on-accent)' }}
            onClick={handleNext}
          >
            {currentIndex + 1 >= exercises.length ? "Ver resultado" : "Próximo exercício →"}
          </Button>
        )}
      </div>
    </StudentLayout>
  );
};

export default ExercisesPage;
