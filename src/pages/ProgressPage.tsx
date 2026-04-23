import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useGamification } from "@/contexts/GamificationContext";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Check, Lock, Trophy, Flame, Zap, BookOpen, Headphones,
  FileText, PenLine, ChevronRight, CheckCircle2, XCircle,
  RotateCcw, ExternalLink, GraduationCap, AlertTriangle, CheckCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const steppieOrgulhoso = "/steppie/steppie-orgulhoso.webp";
const steppieGritando2 = "/steppie/steppie-gritando-2.webp";
const db = supabase as any;

// ─── Types ────────────────────────────────────────────────────────────────────

interface StepProgress {
  id: string;        // step UUID
  number: number;
  title: string | null;
  status: "locked" | "available" | "done";
  doneAt: string | null;
  isInherited: boolean;
}

interface Material {
  id: string;
  title: string;
  type: string;
  delivery: string;
  file_url: string | null;
}

interface Exercise {
  id: string;
  type: "fill_blank" | "association" | "rewrite" | "production" | "dialogue";
  question: string;
  options: { left: string; right: string }[] | null;
  answer: string;
  explanation: string | null;
}

interface AttemptData {
  answer_given: string;
  correct: boolean;
  xp_earned: number;
  completed_at?: string;
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

// ─── Material icons ───────────────────────────────────────────────────────────

const typeIcons: Record<string, React.ReactNode> = {
  vocab:    <BookOpen className="h-4 w-4" />,
  audio:    <Headphones className="h-4 w-4" />,
  grammar:  <FileText className="h-4 w-4" />,
  exercise: <PenLine className="h-4 w-4" />,
  slide:    <FileText className="h-4 w-4" />,
};

const typeLabels: Record<string, string> = {
  vocab: "Vocabulário", audio: "Áudio", grammar: "Gramática",
  exercise: "Exercício", slide: "Slide",
};

// ─── Inline exercise card ─────────────────────────────────────────────────────

const InlineExerciseCard = ({
  exercise,
  attempt,
  studentId,
  reviewMode,
  reviewResult,
  onReviewResult,
}: {
  exercise: Exercise;
  attempt: AttemptData | null;
  studentId: string;
  reviewMode: boolean;
  reviewResult?: { correct: boolean; answer: string } | null;
  onReviewResult: (exerciseId: string, result: { correct: boolean; answer: string }) => void;
}) => {
  const { gamification, refresh: refreshGamification } = useGamification();
  const [inputValue, setInputValue] = useState("");
  const [localResult, setLocalResult] = useState<{ correct: boolean; answer: string } | null>(null);

  // In view mode: if there's an attempt → show it. Otherwise interactive.
  // In review mode: if there's a reviewResult → show it. Otherwise interactive.
  const displayResult = reviewMode ? (reviewResult || localResult) : (attempt ? { correct: attempt.correct, answer: attempt.answer_given } : localResult);
  const isAnswered = !!displayResult;

  const submitAnswer = async (correct: boolean, answerGiven: string, xpAmount: number, coinsAmount: number) => {
    const result = { correct, answer: answerGiven };

    if (reviewMode) {
      // No XP in review mode
      setLocalResult(result);
      onReviewResult(exercise.id, result);
      return;
    }

    // Check first time
    const { data: existing } = await db
      .from("lesson_exercise_attempts")
      .select("id")
      .eq("student_id", studentId)
      .eq("exercise_id", exercise.id)
      .maybeSingle();

    const isFirstTime = !existing;
    const actualXp = isFirstTime ? xpAmount : 0;
    const actualCoins = isFirstTime ? coinsAmount : 0;

    if (isFirstTime) {
      await db.from("lesson_exercise_attempts").insert({
        student_id: studentId,
        exercise_id: exercise.id,
        answer_given: answerGiven,
        correct,
        xp_earned: actualXp,
      });
    }

    if (actualXp > 0) {
      await db.from("student_gamification").update({
        xp_total: gamification.xp_total + actualXp,
        coins: gamification.coins + actualCoins,
        updated_at: new Date().toISOString(),
      }).eq("student_id", studentId);
      await db.from("xp_events").insert({
        student_id: studentId, event_type: "lesson_exercise",
        xp: actualXp, coins: actualCoins,
        description: correct ? `Correto: ${exercise.question.slice(0, 50)}` : `Tentativa: ${exercise.question.slice(0, 50)}`,
      });
      await refreshGamification();
      supabase.functions.invoke("update-streak").catch(() => {});
    }

    setLocalResult(result);
    onReviewResult(exercise.id, result);
  };

  const typeLabel = exercise.type === "fill_blank" ? "Complete a frase"
    : exercise.type === "association" ? "Associação"
    : exercise.type === "rewrite" ? "Reescrita"
    : exercise.type === "production" ? "Produção"
    : "Diálogo";

  return (
    <div className={cn(
      "rounded-lg border p-3 space-y-2 text-sm transition-colors",
      isAnswered && displayResult?.correct && "border-green-400/40 bg-green-500/5",
      isAnswered && !displayResult?.correct && "border-red-400/40 bg-red-500/5",
      !isAnswered && "border-border bg-card"
    )}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{typeLabel}</p>
      <p className="font-light leading-relaxed">{exercise.question}</p>

      {isAnswered ? (
        <div className="space-y-1.5">
          <div className={cn("flex items-center gap-2", displayResult!.correct ? "text-green-600" : "text-red-600")}>
            {displayResult!.correct
              ? <><CheckCircle2 className="h-4 w-4 shrink-0" /><span className="text-xs font-bold">Correto{reviewMode ? "" : " · +" + (attempt?.xp_earned ?? 0) + " XP"}</span></>
              : <><XCircle className="h-4 w-4 shrink-0" /><span className="text-xs">Respondido: <span className="font-bold">{displayResult!.answer || "—"}</span></span></>
            }
          </div>
          {!displayResult!.correct && (
            <p className="text-xs text-muted-foreground">Resposta: <span className="font-bold text-foreground">{exercise.answer}</span></p>
          )}
          {exercise.explanation && !displayResult!.correct && (
            <p className="text-xs text-muted-foreground italic">{exercise.explanation}</p>
          )}
        </div>
      ) : exercise.type === "fill_blank" ? (
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && inputValue.trim()) {
                const correct = inputValue.trim().toLowerCase() === exercise.answer.trim().toLowerCase();
                submitAnswer(correct, inputValue.trim(), correct ? 10 : 2, correct ? 5 : 0);
              }
            }}
            placeholder="Sua resposta..."
            className="text-sm h-8"
          />
          <Button size="sm" className="h-8 text-xs" onClick={() => {
            if (!inputValue.trim()) return;
            const correct = inputValue.trim().toLowerCase() === exercise.answer.trim().toLowerCase();
            submitAnswer(correct, inputValue.trim(), correct ? 10 : 2, correct ? 5 : 0);
          }}>OK</Button>
        </div>
      ) : (exercise.type === "rewrite" || exercise.type === "production" || exercise.type === "dialogue") ? (
        <div className="space-y-2">
          <Textarea value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder="Sua resposta..." rows={2} className="text-sm resize-none" />
          <Button size="sm" className="w-full h-8 text-xs" onClick={() => {
            if (!inputValue.trim()) return;
            submitAnswer(true, inputValue.trim(), 10, 5);
          }}>Enviar</Button>
        </div>
      ) : (
        // Association — simplified: show pairs and a confirm button
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-light">Abra a aula para fazer este exercício de associação.</p>
          <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => submitAnswer(true, "association", 10, 5)}>
            Marcar como feito
          </Button>
        </div>
      )}
    </div>
  );
};

// ─── Step Review Sheet ────────────────────────────────────────────────────────

const StepReviewSheet = ({
  open,
  onClose,
  step,
  studentId,
}: {
  open: boolean;
  onClose: () => void;
  step: StepProgress | null;
  studentId: string | null;
}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [attempts, setAttempts] = useState<Record<string, AttemptData>>({});
  const [accessedIds, setAccessedIds] = useState<Set<string>>(new Set());
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewResults, setReviewResults] = useState<Record<string, { correct: boolean; answer: string }>>({});
  const [markingDone, setMarkingDone] = useState(false);
  const [localIsInherited, setLocalIsInherited] = useState(false);

  useEffect(() => {
    if (!open || !step || !studentId || !step.id) return;
    loadSheetData(step, studentId);
  }, [open, step?.id, studentId]);

  // Reset review mode when sheet closes or step changes
  useEffect(() => {
    if (!open) { setReviewMode(false); setReviewResults({}); setLocalIsInherited(false); }
  }, [open, step?.id]);

  const loadSheetData = async (s: StepProgress, sid: string) => {
    setLoading(true);
    setMaterials([]);
    setExercises([]);
    setAttempts({});
    setReviewMode(false);
    setReviewResults({});
    setLocalIsInherited(s.isInherited);

    const [matsRes, exsRes] = await Promise.all([
      supabase.from("materials").select("id, title, type, delivery, file_url").eq("step_id", s.id).eq("active", true),
      db.from("lesson_exercises").select("id, type, question, options, answer, explanation, order_index").eq("step_id", s.id).eq("active", true).order("order_index"),
    ]);

    const mats = (matsRes.data || []) as Material[];
    const exs = (exsRes.data || []) as Exercise[];
    setMaterials(mats);
    setExercises(exs);

    const exIds = exs.map(e => e.id);
    const [attRes, accRes] = await Promise.all([
      exIds.length > 0
        ? db.from("lesson_exercise_attempts").select("exercise_id, answer_given, correct, xp_earned, completed_at").eq("student_id", sid).in("exercise_id", exIds)
        : Promise.resolve({ data: [] }),
      supabase.from("material_accesses").select("material_id").eq("student_id", sid),
    ]);

    setAttempts(Object.fromEntries(((attRes.data || []) as any[]).map((a: any) => [a.exercise_id, a])));
    setAccessedIds(new Set(((accRes.data || []) as any[]).map((a: any) => a.material_id)));
    setLoading(false);
  };

  const openMaterial = async (m: Material) => {
    if (!m.file_url) return;
    window.open(m.file_url, "_blank");
    if (studentId && !accessedIds.has(m.id)) {
      await db.from("material_accesses").upsert(
        { student_id: studentId, material_id: m.id, accessed_at: new Date().toISOString() },
        { onConflict: "student_id,material_id" }
      );
      setAccessedIds(prev => new Set([...prev, m.id]));
    }
  };

  const handleReviewResult = (exerciseId: string, result: { correct: boolean; answer: string }) => {
    setReviewResults(prev => ({ ...prev, [exerciseId]: result }));
  };

  // "Marcar como concluída" logic
  const hasSlide     = materials.some(m => m.type === "slide");
  const hasExercises = exercises.length > 0;
  const slideMats    = materials.filter(m => m.type === "slide");
  const slideViewed  = slideMats.length > 0 && slideMats.every(m => accessedIds.has(m.id));
  const exercisesDone = exercises.length > 0 && exercises.every(e => !!attempts[e.id]);
  // Rule: if BOTH slide AND exercises exist → must view slide AND do exercises; otherwise always enabled
  const stepIsReady   = hasSlide && hasExercises;
  const canMarkDone   = !stepIsReady || (slideViewed && exercisesDone);

  const handleMarkDone = async () => {
    if (!step || !studentId || markingDone) return;
    setMarkingDone(true);
    try {
      await db.from("student_progress").upsert(
        {
          student_id: studentId,
          step_id: step.id,
          status: "done",
          done_at: new Date().toISOString(),
          is_inherited: false,
        },
        { onConflict: "student_id,step_id" }
      );
      setLocalIsInherited(false);
    } finally {
      setMarkingDone(false);
    }
  };

  const allAttempted = exercises.length > 0 && exercises.every(e => !!attempts[e.id]);
  const allReviewed = reviewMode && exercises.every(e => !!reviewResults[e.id]);

  const beforeMats = materials.filter(m => m.delivery === "before");
  const duringMats = materials.filter(m => m.delivery === "during");
  const afterMats  = materials.filter(m => m.delivery === "after");

  const doneCount  = exercises.filter(e => !!attempts[e.id]).length;
  const correctCount = exercises.filter(e => attempts[e.id]?.correct).length;

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("pt-BR");
  };

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto flex flex-col gap-0 p-0">
        {/* Header */}
        <SheetHeader className="p-4 pb-3 border-b">
          <SheetTitle className="text-base leading-tight">
            {step ? `Step ${step.number}${step.title ? ` · ${step.title}` : ""}` : "Step"}
          </SheetTitle>
          {step && (
            <div className="mt-1">
              {step.status === "done" && (
                <Badge className="bg-green-500/15 text-green-700 border-green-500/30 text-xs font-normal">
                  ✓ Concluído {step.doneAt ? `em ${formatDate(step.doneAt)}` : ""}
                </Badge>
              )}
              {step.status === "available" && (
                <Badge className="bg-primary/10 text-primary border-primary/30 text-xs font-normal">
                  Aula atual
                </Badge>
              )}
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Inherited warning banner */}
          {!loading && localIsInherited && (
            <div className="flex items-start gap-3 rounded-xl border border-yellow-400/40 bg-yellow-400/10 p-3">
              <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-800 dark:text-yellow-300 leading-relaxed">
                Essa aula parece não ter sido concluída por você, porém sua turma já passou dessa aula.
                Visualize o material e faça os exercícios para concluir essa aula.
              </p>
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : (
            <>
              {/* Materials */}
              {materials.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Materiais</p>

                  {[
                    { label: "Antes da aula", mats: beforeMats },
                    { label: "Durante", mats: duringMats },
                    { label: "Após a aula", mats: afterMats },
                  ].filter(g => g.mats.length > 0).map(group => (
                    <div key={group.label} className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/60">{group.label}</p>
                      {group.mats.map(m => (
                        <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg border bg-card hover:border-primary/30 transition-colors">
                          <div className="text-primary shrink-0">{typeIcons[m.type] || <FileText className="h-4 w-4" />}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold truncate">{m.title}</p>
                            <p className="text-[10px] text-muted-foreground">{typeLabels[m.type] || m.type}</p>
                          </div>
                          {accessedIds.has(m.id) && <span className="text-[10px] text-muted-foreground shrink-0">Visto</span>}
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs shrink-0" onClick={() => openMaterial(m)} disabled={!m.file_url}>
                            Abrir <ExternalLink className="h-2.5 w-2.5 ml-1" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* Exercises */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Exercícios</p>
                  {exercises.length > 0 && (
                    <span className="text-xs text-muted-foreground">{doneCount}/{exercises.length} feitos</span>
                  )}
                </div>

                {exercises.length === 0 ? (
                  <p className="text-xs text-muted-foreground font-light">Nenhum exercício cadastrado para esta aula.</p>
                ) : (
                  <>
                    {reviewMode && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
                        <RotateCcw className="h-3 w-3" />
                        Modo revisão — sem XP
                      </div>
                    )}

                    {allReviewed && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-600">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span className="text-xs font-bold">Revisão concluída!</span>
                      </div>
                    )}

                    {studentId && exercises.map(ex => (
                      <InlineExerciseCard
                        key={ex.id}
                        exercise={ex}
                        attempt={reviewMode ? null : (attempts[ex.id] || null)}
                        studentId={studentId}
                        reviewMode={reviewMode}
                        reviewResult={reviewResults[ex.id] || null}
                        onReviewResult={handleReviewResult}
                      />
                    ))}

                    {allAttempted && !reviewMode && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs gap-1.5"
                        onClick={() => { setReviewMode(true); setReviewResults({}); }}
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Refazer exercícios
                      </Button>
                    )}
                  </>
                )}
              </div>

              {/* Performance (done steps only) */}
              {step?.status === "done" && doneCount > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Sua performance</p>
                  <Card>
                    <CardContent className="p-3 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold">{doneCount}</p>
                        <p className="text-[10px] text-muted-foreground">Exercícios feitos</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-green-600">{correctCount}</p>
                        <p className="text-[10px] text-muted-foreground">Corretos</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold">{doneCount > 0 ? Math.round((correctCount / doneCount) * 100) : 0}%</p>
                        <p className="text-[10px] text-muted-foreground">Acerto</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t space-y-2">
          {step?.status === "available" ? (
            <Button
              className="w-full font-bold gap-2"
              style={{ background: "var(--theme-accent)", color: "var(--theme-text-on-accent)" }}
              onClick={() => { onClose(); navigate(step?.id ? `/aula?step_id=${step.id}` : "/aula"); }}
            >
              <GraduationCap className="h-4 w-4" /> Ir para a aula
            </Button>
          ) : null}

          {/* "Marcar como concluída" — shown for done steps (including inherited) */}
          {step?.status === "done" && !loading && (
            localIsInherited ? (
              <Button
                className="w-full font-bold gap-2"
                disabled={!canMarkDone || markingDone}
                onClick={handleMarkDone}
              >
                <CheckCheck className="h-4 w-4" />
                {markingDone ? "Salvando…" : "Marcar aula como concluída"}
              </Button>
            ) : null
          )}

          {step?.status !== "available" && (
            <Button variant="outline" className="w-full" onClick={onClose}>
              Fechar
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

// ─── Progress tab ─────────────────────────────────────────────────────────────

const ProgressTab = () => {
  const { profile } = useAuth();
  const [steps, setSteps] = useState<StepProgress[]>([]);
  const [levelName, setLevelName] = useState("");
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [selectedStep, setSelectedStep] = useState<StepProgress | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [stepsWithContent, setStepsWithContent] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!profile) return;
    loadProgress();
  }, [profile]);

  const loadProgress = async () => {
    if (!profile) return;
    const { data: student } = await supabase
      .from("students")
      .select("id, level_id, current_step_id, steps!students_current_step_id_fkey(number, title)")
      .eq("user_id", profile.id)
      .single();

    if (!student || !student.level_id) { setLoading(false); return; }

    const s = student as any;
    setStudentId(s.id);

    const { data: level } = await supabase
      .from("levels")
      .select("name, code, total_steps")
      .eq("id", s.level_id)
      .single();

    if (level) setLevelName(`${level.name} · ${level.code}`);
    const totalSteps = level?.total_steps || 40;
    const currentStepNumber: number = s.steps?.number ?? 1;

    const { data: progressRecords } = await supabase
      .from("student_progress")
      .select("step_id, status, done_at, is_inherited, steps(number, title)")
      .eq("student_id", s.id);

    // Map: stepNumber → { stepId, status, doneAt, title, isInherited }
    const doneMap = new Map<number, { id: string; doneAt: string | null; title: string | null; isInherited: boolean }>();
    const availableMap = new Map<number, { id: string; title: string | null }>();
    if (progressRecords) {
      for (const p of progressRecords as any[]) {
        if (p.status === "done" && p.steps?.number) {
          doneMap.set(p.steps.number, { id: p.step_id, doneAt: p.done_at || null, title: p.steps.title || null, isInherited: p.is_inherited ?? false });
        } else if (p.status === "available" && p.steps?.number) {
          availableMap.set(p.steps.number, { id: p.step_id, title: p.steps.title || null });
        }
      }
    }

    // Also grab current step_id + title from student
    const currentStepId: string | null = s.current_step_id || null;
    const currentStepTitle: string | null = s.steps?.title || null;

    const stepsArray: StepProgress[] = [];
    for (let i = 1; i <= totalSteps; i++) {
      const done = doneMap.get(i);
      const avail = availableMap.get(i);
      if (done) {
        stepsArray.push({ id: done.id, number: i, title: done.title, status: "done", doneAt: done.doneAt, isInherited: done.isInherited });
      } else if (i === currentStepNumber && currentStepId) {
        stepsArray.push({ id: currentStepId, number: i, title: currentStepTitle, status: "available", doneAt: null, isInherited: false });
      } else if (avail) {
        stepsArray.push({ id: avail.id, number: i, title: avail.title, status: "available", doneAt: null, isInherited: false });
      } else {
        stepsArray.push({ id: "", number: i, title: null, status: "locked", doneAt: null, isInherited: false });
      }
    }

    setSteps(stepsArray);

    // Fetch which steps have materials (for content dot)
    const clickableIds = stepsArray.filter(st => st.status !== "locked" && st.id).map(st => st.id);
    if (clickableIds.length > 0) {
      const { data: mats } = await supabase
        .from("materials")
        .select("step_id")
        .in("step_id", clickableIds)
        .eq("active", true);
      setStepsWithContent(new Set((mats || []).map((m: any) => m.step_id)));
    }

    setLoading(false);
  };

  const openStep = (step: StepProgress) => {
    if (step.status === "locked" || !step.id) return;
    setSelectedStep(step);
    setSheetOpen(true);
  };

  const doneCount = steps.filter(s => s.status === "done").length;
  const total = steps.length || 40;
  const percent = Math.round((doneCount / total) * 100);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">Progresso</CardTitle>
            <img src={steppieOrgulhoso} alt="" aria-hidden="true" className="w-12" />
          </div>
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
                onClick={() => openStep(step)}
                style={{
                  cursor: step.status === "locked" ? "not-allowed" : "pointer",
                  transition: "transform 0.15s",
                }}
                className={cn(
                  "aspect-square rounded-lg flex flex-col items-center justify-center text-sm relative",
                  step.status !== "locked" && "hover:scale-105 active:scale-95",
                  step.status === "done" && "bg-primary text-primary-foreground",
                  step.status === "available" && "border-2 border-primary text-primary bg-card",
                  step.status === "locked" && "bg-muted text-muted-foreground"
                )}
              >
                {step.status === "done" ? (
                  step.isInherited ? (
                    <><AlertTriangle className="h-4 w-4 text-yellow-400" /><span className="text-xs font-bold mt-0.5">{step.number}</span></>
                  ) : (
                    <><Check className="h-4 w-4" style={{ color: "var(--theme-accent)" }} /><span className="text-xs font-bold mt-0.5">{step.number}</span></>
                  )
                ) : step.status === "locked" ? (
                  <><Lock className="h-3 w-3" /><span className="text-xs mt-0.5">{step.number}</span></>
                ) : (
                  <span className="text-base font-bold">{step.number}</span>
                )}

                {/* Content dot */}
                {step.status !== "locked" && step.id && stepsWithContent.has(step.id) && (
                  <span
                    className="absolute top-1 right-1 rounded-full"
                    style={{ width: 6, height: 6, background: "var(--theme-accent)" }}
                  />
                )}

                {/* Clickable indicator */}
                {step.status !== "locked" && (
                  <ChevronRight className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 opacity-40" />
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-4 pt-2 pb-1 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-primary flex items-center justify-center">
                <Check className="h-2.5 w-2.5" style={{ color: "var(--theme-accent)" }} />
              </div>
              <span className="text-xs text-muted-foreground font-light">Concluído</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-primary flex items-center justify-center">
                <AlertTriangle className="h-2.5 w-2.5 text-yellow-400" />
              </div>
              <span className="text-xs text-muted-foreground font-light">Pendente</span>
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

      <StepReviewSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        step={selectedStep}
        studentId={studentId}
      />
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
      const { data: me } = await supabase
        .from("students")
        .select("id, language_id, languages!students_language_id_fkey(name)")
        .eq("user_id", profile!.id)
        .maybeSingle();

      const { data: langs } = await supabase.from("languages").select("id, name").eq("active", true);
      if (langs) setLanguages(langs);

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
          student_id: g.student_id, name: firstName,
          xp_total: g.xp_total, streak_current: g.streak_current,
          language_name: langName, rank: index + 1,
          isMe: g.student_id === me?.id,
        };
      });

      setRanking(entries);

      const iAmInTop = entries.some(e => e.isMe);
      if (!iAmInTop && me) {
        const myIndex = filtered.findIndex((g: any) => g.student_id === me.id);
        if (myIndex >= 0) {
          const g = filtered[myIndex];
          const p = g.students?.profiles;
          const fullName: string = Array.isArray(p) ? (p[0]?.name || "—") : (p?.name || "—");
          setMyEntry({
            student_id: g.student_id, name: fullName.split(" ")[0],
            xp_total: g.xp_total, streak_current: g.streak_current,
            language_name: Array.isArray(g.students?.languages) ? g.students?.languages[0]?.name : g.students?.languages?.name || "—",
            rank: myIndex + 1, isMe: true,
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
            <img src={steppieGritando2} alt="" aria-hidden="true" className="w-8" />
            Top 10 por XP
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-none">
            <button onClick={() => setLangFilter("all")}
              className={cn("shrink-0 text-xs px-3 py-1 rounded-full border transition-colors", langFilter === "all" ? "bg-primary text-white border-primary" : "border-border text-muted-foreground")}>
              Todos
            </button>
            {languages.map(l => (
              <button key={l.id} onClick={() => setLangFilter(l.id)}
                className={cn("shrink-0 text-xs px-3 py-1 rounded-full border transition-colors", langFilter === l.id ? "bg-primary text-white border-primary" : "border-border text-muted-foreground")}>
                {l.name}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
          ) : ranking.length === 0 ? (
            <div className="py-8 text-center">
              <Trophy className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum aluno no ranking ainda.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {ranking.map(entry => (
                <div key={entry.student_id}
                  className={cn("flex items-center gap-3 p-3 rounded-xl border transition-colors",
                    entry.isMe ? "border-primary bg-primary/5" : "border-transparent bg-muted/30")}>
                  <div className="w-8 text-center shrink-0">
                    {entry.rank <= 3 ? <span className="text-xl">{MEDAL[entry.rank - 1]}</span> : <span className="text-sm font-bold text-muted-foreground">{entry.rank}°</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-bold truncate", entry.isMe && "text-primary")}>
                      {entry.name} {entry.isMe && <span className="text-xs font-normal">(você)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground font-light">{entry.language_name}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {entry.streak_current > 0 && (
                      <div className="flex items-center gap-0.5 text-xs text-orange-500">
                        <Flame className="h-3 w-3" /><span className="font-bold">{entry.streak_current}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-0.5 text-xs text-primary">
                      <Zap className="h-3 w-3" style={{ fill: "var(--theme-accent)", color: "var(--theme-accent)" }} />
                      <span className="font-bold">{entry.xp_total.toLocaleString("pt-BR")}</span>
                    </div>
                  </div>
                </div>
              ))}

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
                      <Zap className="h-3 w-3" style={{ fill: "var(--theme-accent)", color: "var(--theme-accent)" }} />
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
