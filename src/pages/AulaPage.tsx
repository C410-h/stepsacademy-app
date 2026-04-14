import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
import { Badge } from "@/components/ui/badge";
import {
  BookOpen, Headphones, FileText, PenLine, Eye, EyeOff,
  ChevronDown, ChevronUp, CheckCircle2, XCircle, Zap,
  RotateCcw, Mic, GraduationCap, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentInfo {
  id: string;
  current_step_id: string | null;
  stepNumber: number;
  stepTitle: string | null;
  totalSteps: number;
  levelCode: string;
  levelName: string;
  languageName: string;
  meetLink: string | null;
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

const ExercisesEngine = ({
  exercises,
  studentId,
  onXpEarned,
}: {
  exercises: Exercise[];
  studentId: string;
  onXpEarned?: (xp: number, coins: number) => void;
}) => {
  const { gamification, refresh: refreshGamification } = useGamification();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [status, setStatus] = useState<ExStatus>("pending");
  const [answer, setAnswer] = useState("");
  const [sessionXp, setSessionXp] = useState(0);
  const [sessionCoins, setSessionCoins] = useState(0);
  const [done, setDone] = useState(false);
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

  const awardXp = useCallback(async (xpAmount: number, coinsAmount: number, correct: boolean) => {
    const sid = studentId || gamification.studentId;
    if (!sid) return;
    await (supabase as any).from("student_gamification").update({
      xp_total: gamification.xp_total + xpAmount,
      coins: gamification.coins + coinsAmount,
      updated_at: new Date().toISOString(),
    }).eq("student_id", sid);
    const ex = exercises[currentIndex];
    await (supabase as any).from("xp_events").insert({
      student_id: sid,
      event_type: "lesson_exercise",
      xp: xpAmount,
      coins: coinsAmount,
      description: correct ? `Correto: ${ex?.question?.slice(0, 50)}` : `Tentativa: ${ex?.question?.slice(0, 50)}`,
    });
    setSessionXp(prev => prev + xpAmount);
    setSessionCoins(prev => prev + coinsAmount);
    onXpEarned?.(xpAmount, coinsAmount);
    await refreshGamification();
    supabase.functions.invoke("update-streak").catch(() => {});
  }, [studentId, gamification, exercises, currentIndex, refreshGamification, onXpEarned]);

  const handleFillBlankSubmit = async () => {
    const ex = exercises[currentIndex];
    if (!answer.trim()) return;
    const correct = answer.trim().toLowerCase() === ex.answer.trim().toLowerCase();
    setStatus(correct ? "correct" : "wrong");
    await awardXp(correct ? 10 : 2, correct ? 5 : 0, correct);
  };

  const handleOpenSubmit = async () => {
    if (!answer.trim()) return;
    setStatus("submitted");
    await awardXp(10, 5, true);
  };

  const handleAssociationConfirm = async () => {
    const ex = exercises[currentIndex];
    if (!ex.options) return;
    let allCorrect = true;
    for (let i = 0; i < ex.options.length; i++) {
      if (shuffledRight[pairs[i]] !== ex.options[i].right) { allCorrect = false; break; }
    }
    setStatus(allCorrect ? "correct" : "wrong");
    await awardXp(allCorrect ? 10 : 2, allCorrect ? 5 : 0, allCorrect);
  };

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

  const progressPercent = ((currentIndex + (status !== "pending" ? 1 : 0)) / exercises.length) * 100;
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

// ─── Main Page ────────────────────────────────────────────────────────────────

const AulaPage = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfTitle, setPdfTitle] = useState("");

  useEffect(() => {
    if (!profile) return;
    loadData();
  }, [profile]);

  const loadData = async () => {
    if (!profile) return;
    setLoading(true);

    // Student base data
    const { data: raw } = await supabase
      .from("students")
      .select(`
        id, current_step_id, onboarding_completed,
        levels!students_level_id_fkey(name, code, total_steps),
        languages!students_language_id_fkey(name),
        steps!students_current_step_id_fkey(number, title)
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

    setStudent({
      id: s.id,
      current_step_id: s.current_step_id,
      stepNumber: s.steps?.number || 0,
      stepTitle: s.steps?.title || null,
      totalSteps: s.levels?.total_steps || 40,
      levelCode: s.levels?.code || "",
      levelName: s.levels?.name || "",
      languageName: s.languages?.name || "",
      meetLink,
    });

    if (!s.current_step_id) { setLoading(false); return; }

    // Parallel data fetching
    const [stepRes, exercisesRes, accessesRes, personalRes] = await Promise.all([
      supabase.from("materials").select("id, title, type, delivery, file_url").eq("step_id", s.current_step_id).eq("active", true),
      (supabase as any).from("lesson_exercises").select("id, type, question, options, answer, explanation, order_index").eq("step_id", s.current_step_id).eq("active", true).order("order_index"),
      supabase.from("material_accesses").select("material_id").eq("student_id", s.id),
      supabase.from("student_materials").select("material_id, materials(id, title, type, delivery, file_url)").eq("student_id", s.id).eq("is_personal", true),
    ]);

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
    setLoading(false);
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
  if (!student?.current_step_id) {
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
      <div className="space-y-5">

        {/* ── Header ── */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-light uppercase tracking-wide">Aula atual</p>
          <h1 className="text-xl font-bold leading-tight">
            {student.stepTitle || `Passo ${student.stepNumber}`}
          </h1>
          <p className="text-xs text-muted-foreground font-light">
            {student.languageName} · {student.levelCode} · Step {student.stepNumber} de {student.totalSteps}
          </p>
        </div>

        {/* ── Meet button ── */}
        {student.meetLink && (
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
            <ExercisesEngine exercises={exercises} studentId={student.id} />
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

        {/* ── Audio player ── */}
        {audioUrl && (
          <Card>
            <CardContent className="py-4">
              <audio controls className="w-full" src={audioUrl}>Seu navegador não suporta áudio.</audio>
              <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setAudioUrl(null)}>Fechar player</Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── PDF Viewer ── */}
      <PDFViewer url={pdfUrl} title={pdfTitle} onClose={() => setPdfUrl(null)} />
    </StudentLayout>
  );
};

export default AulaPage;
