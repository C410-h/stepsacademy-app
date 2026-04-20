import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Headphones, BookOpen, PenLine, Mic,
  Upload, Plus, Trash2, Save, ChevronRight,
  CheckCircle2, AlertCircle, Clock, XCircle, Loader2, Globe,
  Library, Search, Rocket, History,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type GenerateType = "exercises" | "vocabulary" | "grammar";

interface StepInfo {
  id: string;
  number: number;
  title: string | null;
  unitId: string | null;
  status: "complete" | "partial" | "empty";
  submissionId: string | null;
  submissionStatus: string | null;
  adminComment: string | null;
}

interface ExerciseItem {
  localId: string;
  type: "fill_blank" | "association" | "open_answer" | "rewrite" | "production" | "dialogue";
  question: string;
  options: string; // comma-separated; for association: "left=right,left2=right2"
  answer: string;
  explanation: string;
}

interface VocabItem {
  localId: string;
  word: string;
  translation: string;
  example_sentence: string;
  part_of_speech: "noun" | "verb" | "adjective" | "adverb" | "expression" | "other";
  difficulty: 1 | 2 | 3;
  distractors: [string, string, string];
}

interface GrammarExample {
  sentence: string;
  translation: string;
  highlight: string;
}

interface GrammarItem {
  localId: string;
  title: string;
  explanation: string;
  examples: GrammarExample[];
  tip: string;
}

interface FileEntry {
  localId: string;
  materialType: "slide" | "audio" | "grammar" | "vocab" | "exercise";
  file: File | null;
  filename: string;
  previewUrl: string | null;
  isRecording?: boolean;
  exercises?: ExerciseItem[];
  aiStatus?: "idle" | "converting" | "done" | "confirmed" | "error";
  aiResult?: ExerciseItem[];
  aiFonte?: "slide" | "documento";
  aiInstrucoes?: string;
  aiGenerate?: GenerateType[];
  aiVocabulary?: VocabItem[];
  aiGrammar?: GrammarItem[];
  aiReviewTab?: GenerateType;
  uploadedFileUrl?: string | null;
  uploading?: boolean; // auto-upload em background ao selecionar slide
}

interface Props {
  teacherId: string;
}

interface LevelOption { id: string; name: string; code: string; language_id: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  complete: "bg-lime/80 text-lime-900",
  partial: "bg-yellow-400/80 text-yellow-900",
  empty: "bg-muted text-muted-foreground",
};

const statusLabel: Record<string, { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Rascunho", icon: <Save className="h-3 w-3" />, variant: "secondary" },
  pending: { label: "Aguardando aprovação", icon: <Clock className="h-3 w-3" />, variant: "default" },
  approved: { label: "Publicado", icon: <CheckCircle2 className="h-3 w-3" />, variant: "outline" },
  rejected: { label: "Rejeitado", icon: <XCircle className="h-3 w-3" />, variant: "destructive" },
  partial: { label: "Parcialmente aprovado", icon: <AlertCircle className="h-3 w-3" />, variant: "secondary" },
};

const TYPE_LABELS: Record<string, string> = {
  slide: "Slide / Apresentação",
  audio: "Áudio",
  grammar: "Gramática (PDF)",
  vocab: "Vocabulário (PDF)",
  exercise: "Conteúdo com IA",
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  slide: <FileText className="h-4 w-4" />,
  audio: <Headphones className="h-4 w-4" />,
  grammar: <FileText className="h-4 w-4" />,
  vocab: <BookOpen className="h-4 w-4" />,
  exercise: <PenLine className="h-4 w-4" />,
};

const GENERATE_LABELS: Record<GenerateType, string> = {
  exercises: "Exercícios",
  vocabulary: "Vocabulário",
  grammar: "Gramática",
};

function newLocalId() {
  return Math.random().toString(36).slice(2);
}

function formatOptionsForDb(ex: ExerciseItem): any {
  if (!ex.options?.trim()) return null;
  if (ex.type === "association") {
    return ex.options.split(",").map(pair => {
      const eq = pair.indexOf("=");
      if (eq === -1) return { left: pair.trim(), right: "" };
      return { left: pair.slice(0, eq).trim(), right: pair.slice(eq + 1).trim() };
    });
  }
  return ex.options.split(",").map(o => o.trim()).filter(Boolean);
}

// ── ExerciseEditor ────────────────────────────────────────────────────────────

function ExerciseEditor({
  exercises,
  onChange,
}: {
  exercises: ExerciseItem[];
  onChange: (exercises: ExerciseItem[]) => void;
}) {
  const addEx = () =>
    onChange([
      ...exercises,
      { localId: newLocalId(), type: "fill_blank", question: "", options: "", answer: "", explanation: "" },
    ]);

  const updateEx = (localId: string, patch: Partial<ExerciseItem>) =>
    onChange(exercises.map(e => (e.localId === localId ? { ...e, ...patch } : e)));

  const removeEx = (localId: string) => onChange(exercises.filter(e => e.localId !== localId));

  return (
    <div className="space-y-3">
      {exercises.map((ex, i) => (
        <div key={ex.localId} className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground">Exercício {i + 1}</span>
            <button onClick={() => removeEx(ex.localId)} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <Select value={ex.type} onValueChange={v => updateEx(ex.localId, { type: v as ExerciseItem["type"] })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fill_blank">Preencher lacuna</SelectItem>
              <SelectItem value="association">Associação</SelectItem>
              <SelectItem value="open_answer">Resposta aberta</SelectItem>
              <SelectItem value="rewrite">Reescrita</SelectItem>
              <SelectItem value="production">Produção</SelectItem>
              <SelectItem value="dialogue">Diálogo</SelectItem>
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Enunciado / Frase com [___] para lacuna"
            value={ex.question}
            onChange={e => updateEx(ex.localId, { question: e.target.value })}
            rows={2}
            className="text-xs"
          />
          {ex.type === "association" && (
            <Input
              placeholder="Pares (ex: cat=gato,dog=cachorro)"
              value={ex.options}
              onChange={e => updateEx(ex.localId, { options: e.target.value })}
              className="text-xs h-8"
            />
          )}
          <Input
            placeholder={
              ex.type === "fill_blank" ? "Resposta correta" :
              ex.type === "association" ? "Pares corretos (ex: cat=gato,dog=cachorro)" :
              "Resposta esperada / critério"
            }
            value={ex.answer}
            onChange={e => updateEx(ex.localId, { answer: e.target.value })}
            className="text-xs h-8"
          />
          <Input
            placeholder="Explicação (opcional)"
            value={ex.explanation}
            onChange={e => updateEx(ex.localId, { explanation: e.target.value })}
            className="text-xs h-8"
          />
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={addEx} className="w-full text-xs gap-1.5">
        <Plus className="h-3.5 w-3.5" />Adicionar exercício
      </Button>
    </div>
  );
}

// ── VocabEditor ───────────────────────────────────────────────────────────────

function VocabEditor({
  vocab,
  onChange,
}: {
  vocab: VocabItem[];
  onChange: (v: VocabItem[]) => void;
}) {
  const update = (localId: string, patch: Partial<VocabItem>) =>
    onChange(vocab.map(v => v.localId === localId ? { ...v, ...patch } : v));
  const remove = (localId: string) => onChange(vocab.filter(v => v.localId !== localId));
  const add = () => onChange([...vocab, {
    localId: newLocalId(), word: "", translation: "", example_sentence: "",
    part_of_speech: "noun", difficulty: 1, distractors: ["", "", ""],
  }]);

  return (
    <div className="space-y-3">
      {vocab.map((item, i) => (
        <div key={item.localId} className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground">Palavra {i + 1}</span>
            <button onClick={() => remove(item.localId)} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Palavra"
              value={item.word}
              onChange={e => update(item.localId, { word: e.target.value })}
              className="text-xs h-8 font-bold"
            />
            <Input
              placeholder="Tradução"
              value={item.translation}
              onChange={e => update(item.localId, { translation: e.target.value })}
              className="text-xs h-8"
            />
          </div>
          <Textarea
            placeholder="Frase de exemplo"
            value={item.example_sentence}
            onChange={e => update(item.localId, { example_sentence: e.target.value })}
            rows={2}
            className="text-xs"
          />
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={item.part_of_speech}
              onValueChange={v => update(item.localId, { part_of_speech: v as VocabItem["part_of_speech"] })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="noun">Substantivo</SelectItem>
                <SelectItem value="verb">Verbo</SelectItem>
                <SelectItem value="adjective">Adjetivo</SelectItem>
                <SelectItem value="adverb">Advérbio</SelectItem>
                <SelectItem value="expression">Expressão</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={String(item.difficulty)}
              onValueChange={v => update(item.localId, { difficulty: Number(v) as 1 | 2 | 3 })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Básico</SelectItem>
                <SelectItem value="2">Intermediário</SelectItem>
                <SelectItem value="3">Avançado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-bold">Distratores (respostas erradas)</p>
            <div className="grid grid-cols-3 gap-1.5">
              {([0, 1, 2] as const).map(idx => (
                <Input
                  key={idx}
                  placeholder={`Distrator ${idx + 1}`}
                  value={item.distractors[idx] || ""}
                  onChange={e => {
                    const d = [...item.distractors] as [string, string, string];
                    d[idx] = e.target.value;
                    update(item.localId, { distractors: d });
                  }}
                  className="text-xs h-8"
                />
              ))}
            </div>
          </div>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={add} className="w-full text-xs gap-1.5">
        <Plus className="h-3.5 w-3.5" />Adicionar palavra
      </Button>
    </div>
  );
}

// ── GrammarEditor ─────────────────────────────────────────────────────────────

function GrammarEditor({
  grammar,
  onChange,
}: {
  grammar: GrammarItem[];
  onChange: (g: GrammarItem[]) => void;
}) {
  const update = (localId: string, patch: Partial<GrammarItem>) =>
    onChange(grammar.map(g => g.localId === localId ? { ...g, ...patch } : g));
  const remove = (localId: string) => onChange(grammar.filter(g => g.localId !== localId));
  const add = () => onChange([...grammar, {
    localId: newLocalId(), title: "", explanation: "", examples: [], tip: "",
  }]);

  const addExample = (localId: string) => {
    const item = grammar.find(g => g.localId === localId);
    if (!item) return;
    update(localId, { examples: [...item.examples, { sentence: "", translation: "", highlight: "" }] });
  };
  const updateExample = (localId: string, exIdx: number, patch: Partial<GrammarExample>) => {
    const item = grammar.find(g => g.localId === localId);
    if (!item) return;
    update(localId, { examples: item.examples.map((e, i) => i === exIdx ? { ...e, ...patch } : e) });
  };
  const removeExample = (localId: string, exIdx: number) => {
    const item = grammar.find(g => g.localId === localId);
    if (!item) return;
    update(localId, { examples: item.examples.filter((_, i) => i !== exIdx) });
  };

  return (
    <div className="space-y-3">
      {grammar.map((item, i) => (
        <div key={item.localId} className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground">Regra {i + 1}</span>
            <button onClick={() => remove(item.localId)} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <Input
            placeholder="Título da regra gramatical"
            value={item.title}
            onChange={e => update(item.localId, { title: e.target.value })}
            className="text-xs h-8 font-bold"
          />
          <Textarea
            placeholder="Explicação didática"
            value={item.explanation}
            onChange={e => update(item.localId, { explanation: e.target.value })}
            rows={3}
            className="text-xs"
          />
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-bold">Exemplos</p>
            {item.examples.map((ex, exIdx) => (
              <div key={exIdx} className="border rounded p-2 space-y-1.5 bg-background/50">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Exemplo {exIdx + 1}</span>
                  <button onClick={() => removeExample(item.localId, exIdx)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <Input placeholder="Frase no idioma" value={ex.sentence} onChange={e => updateExample(item.localId, exIdx, { sentence: e.target.value })} className="text-xs h-7" />
                <Input placeholder="Tradução" value={ex.translation} onChange={e => updateExample(item.localId, exIdx, { translation: e.target.value })} className="text-xs h-7" />
                <Input placeholder="Trecho a destacar" value={ex.highlight} onChange={e => updateExample(item.localId, exIdx, { highlight: e.target.value })} className="text-xs h-7" />
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => addExample(item.localId)} className="w-full text-xs gap-1 h-7">
              <Plus className="h-3 w-3" />Adicionar exemplo
            </Button>
          </div>
          <Input
            placeholder="💡 Dica prática (opcional)"
            value={item.tip}
            onChange={e => update(item.localId, { tip: e.target.value })}
            className="text-xs h-8"
          />
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={add} className="w-full text-xs gap-1.5">
        <Plus className="h-3.5 w-3.5" />Adicionar regra gramatical
      </Button>
    </div>
  );
}

// ── AudioRecorder ─────────────────────────────────────────────────────────────

function AudioRecorder({ onRecorded }: { onRecorded: (blob: Blob, url: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        onRecorded(blob, url);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch {
      alert("Não foi possível acessar o microfone.");
    }
  };

  const stop = () => {
    mediaRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-3">
      {recording ? (
        <>
          <div className="flex items-center gap-2 text-sm text-destructive">
            <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
            {fmt(seconds)}
          </div>
          <Button size="sm" variant="destructive" onClick={stop} className="gap-1.5">
            <Mic className="h-3.5 w-3.5" />Parar
          </Button>
        </>
      ) : (
        <Button size="sm" variant="outline" onClick={start} className="gap-1.5">
          <Mic className="h-3.5 w-3.5" />Gravar áudio
        </Button>
      )}
    </div>
  );
}

// ── ExerciseBankPicker ────────────────────────────────────────────────────────

interface BankExercise {
  id: string;
  type: string;
  question: string;
  options: any;
  answer: string;
  explanation: string | null;
}

function ExerciseBankPicker({
  open, onOpenChange, levelId, onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  levelId: string | null;
  onSelect: (exercises: ExerciseItem[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [results, setResults] = useState<BankExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const search = useCallback(async () => {
    setLoading(true);
    let q = (supabase as any)
      .from("exercise_bank")
      .select("id, type, question, options, answer, explanation")
      .eq("active", true)
      .order("times_used", { ascending: false })
      .limit(40);
    if (levelId) q = q.eq("level_id", levelId);
    if (typeFilter !== "all") q = q.eq("type", typeFilter);
    if (query.trim()) q = q.ilike("question", `%${query.trim()}%`);
    const { data } = await q;
    setResults(data || []);
    setLoading(false);
  }, [levelId, typeFilter, query]);

  useEffect(() => { if (open) { search(); setSelected(new Set()); } }, [open, search]);

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const confirm = () => {
    const chosen = results.filter(r => selected.has(r.id));
    onSelect(chosen.map(e => ({
      localId: newLocalId(),
      type: e.type as ExerciseItem["type"],
      question: e.question,
      options: Array.isArray(e.options)
        ? e.options.map((o: any) => typeof o === "object" && o.left ? `${o.left}=${o.right}` : String(o)).join(",")
        : (e.options || ""),
      answer: e.answer,
      explanation: e.explanation || "",
    })));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">Banco de Exercícios</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por enunciado…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && search()}
              className="pl-8 text-xs h-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={v => setTypeFilter(v)}>
            <SelectTrigger className="w-36 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="fill_blank">Preencher lacuna</SelectItem>
              <SelectItem value="association">Associação</SelectItem>
              <SelectItem value="open_answer">Resposta aberta</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Nenhum exercício encontrado.</p>
          ) : results.map(ex => (
            <button
              key={ex.id}
              onClick={() => toggle(ex.id)}
              className={cn(
                "w-full text-left p-3 rounded-lg border text-xs transition-colors",
                selected.has(ex.id) ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-muted-foreground uppercase text-[10px]">{ex.type}</span>
                {selected.has(ex.id) && <CheckCircle2 className="h-3 w-3 text-primary ml-auto" />}
              </div>
              <p className="font-medium line-clamp-2">{ex.question}</p>
              <p className="text-muted-foreground font-light mt-0.5 truncate">→ {ex.answer}</p>
            </button>
          ))}
        </div>
        <div className="pt-2 border-t flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button size="sm" className="flex-1" onClick={confirm} disabled={selected.size === 0}>
            Adicionar {selected.size > 0 ? `(${selected.size})` : "selecionados"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── PublishDialog ─────────────────────────────────────────────────────────────

function PublishDialog({
  open, onOpenChange, exercises, vocabulary, grammar, hasSlide, hasAudio, onPublish, publishing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  exercises: ExerciseItem[];
  vocabulary: VocabItem[];
  grammar: GrammarItem[];
  hasSlide: boolean;
  hasAudio: boolean;
  onPublish: () => void;
  publishing: boolean;
}) {
  const total = exercises.length + vocabulary.length + grammar.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Revisar e publicar</DialogTitle>
        </DialogHeader>

        {total === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Nenhum conteúdo gerado ainda. Volte e gere o conteúdo antes de publicar.
          </p>
        ) : (
          <div className="space-y-3 text-sm">
            {exercises.length > 0 && (
              <div className="space-y-0.5">
                <p className="font-bold text-xs text-muted-foreground uppercase tracking-wide">Exercícios</p>
                <p className="font-light">{exercises.length} exercício{exercises.length !== 1 ? "s" : ""}</p>
              </div>
            )}
            {vocabulary.length > 0 && (
              <div className="space-y-0.5">
                <p className="font-bold text-xs text-muted-foreground uppercase tracking-wide">Vocabulário</p>
                <p className="font-light">{vocabulary.length} palavra{vocabulary.length !== 1 ? "s" : ""}</p>
                <p className="text-xs text-muted-foreground">
                  {vocabulary.slice(0, 6).map(v => v.word).join(", ")}{vocabulary.length > 6 ? "…" : ""}
                </p>
              </div>
            )}
            {grammar.length > 0 && (
              <div className="space-y-0.5">
                <p className="font-bold text-xs text-muted-foreground uppercase tracking-wide">Gramática</p>
                {grammar.map((g, i) => (
                  <p key={i} className="text-xs font-light">• {g.title || `Regra ${i + 1}`}</p>
                ))}
              </div>
            )}

            <div className="border-t pt-3">
              <p className="font-bold text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Arquivos</p>
              <div className="flex gap-4">
                <span className={cn("text-xs", hasSlide ? "text-foreground" : "text-muted-foreground/50")}>
                  {hasSlide ? "✅" : "⚠️"} Slide
                </span>
                <span className={cn("text-xs", hasAudio ? "text-foreground" : "text-muted-foreground/50")}>
                  {hasAudio ? "✅" : "⚠️"} Áudio
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1 text-sm" onClick={() => onOpenChange(false)}>
            ← Voltar e editar
          </Button>
          <Button
            className="flex-1 text-sm gap-1.5"
            onClick={onPublish}
            disabled={publishing || total === 0}
          >
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            Publicar tudo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const TeacherContentTab = ({ teacherId }: Props) => {
  const { toast } = useToast();
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [languageId, setLanguageId] = useState<string | null>(null);
  const [levelId, setLevelId] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStep, setSelectedStep] = useState<StepInfo | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [currentSubmissionId, setCurrentSubmissionId] = useState<string | null>(null);
  const [bankPickerEntryId, setBankPickerEntryId] = useState<string | null>(null);

  // ── Slide version history ───────────────────────────────────────────────────
  const [slideVersions, setSlideVersions] = useState<{
    id: string; file_url: string; filename: string | null; version_number: number; replaced_at: string;
  }[]>([]);
  const [slideMaterialId, setSlideMaterialId] = useState<string | null>(null);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);

  // Load levels + auto-detect teacher's language via their students
  useEffect(() => {
    Promise.all([
      supabase.from("levels").select("id, name, code, language_id").order("code"),
      supabase
        .from("teacher_students")
        .select("students!inner(language_id)")
        .eq("teacher_id", teacherId),
    ]).then(([{ data: lvls }, { data: ts }]) => {
      setLevels(lvls || []);

      if (ts && ts.length > 0) {
        // Count occurrences per language_id and pick the most common
        const counts: Record<string, number> = {};
        for (const row of ts as any[]) {
          const lid = row.students?.language_id;
          if (lid) counts[lid] = (counts[lid] || 0) + 1;
        }
        const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
        if (dominant) setLanguageId(dominant);
      }
    });
  }, [teacherId]);

  // ── Load steps ──────────────────────────────────────────────────────────────

  const loadSteps = useCallback(async () => {
    if (!languageId || !levelId) { setLoading(false); return; }
    setLoading(true);

    const { data: unitsData } = await supabase
      .from("units")
      .select("id")
      .eq("level_id", levelId);

    const unitIds = (unitsData || []).map(u => u.id);
    if (unitIds.length === 0) { setSteps([]); setLoading(false); return; }

    const { data: stepsData } = await supabase
      .from("steps")
      .select("id, number, title, unit_id")
      .in("unit_id", unitIds)
      .order("number", { ascending: true });

    if (!stepsData) { setLoading(false); return; }

    const stepIds = stepsData.map(s => s.id);

    const [{ data: statusData }, { data: submissionsData }] = await Promise.all([
      (supabase as any)
        .from("step_completion_status")
        .select("step_id, has_slide, has_exercises, is_complete")
        .in("step_id", stepIds),
      (supabase as any)
        .from("content_submissions")
        .select("id, step_id, status, admin_comment")
        .eq("teacher_id", teacherId)
        .in("step_id", stepIds),
    ]);

    const statusMap = new Map((statusData || []).map((s: any) => [s.step_id, s]));
    const submissionMap = new Map((submissionsData || []).map((s: any) => [s.step_id, s]));

    const enriched: StepInfo[] = stepsData.map(s => {
      const cs: any = statusMap.get(s.id);
      const sub: any = submissionMap.get(s.id);
      let status: StepInfo["status"] = "empty";
      if (cs?.is_complete) status = "complete";
      else if (cs?.has_slide || cs?.has_exercises) status = "partial";
      return {
        id: s.id,
        number: s.number,
        title: s.title,
        unitId: (s as any).unit_id || null,
        status,
        submissionId: sub?.id || null,
        submissionStatus: sub?.status || null,
        adminComment: sub?.admin_comment || null,
      };
    });

    setSteps(enriched);
    setLoading(false);
  }, [teacherId, languageId, levelId]);

  useEffect(() => { loadSteps(); }, [loadSteps]);

  // ── Open step drawer ────────────────────────────────────────────────────────

  const openStep = async (step: StepInfo) => {
    setSelectedStep(step);
    setFiles([]);
    setCurrentSubmissionId(step.submissionId);
    setSlideMaterialId(null);
    setSlideVersions([]);

    if (step.submissionId) {
      const { data: sfData } = await (supabase as any)
        .from("submission_files")
        .select("id, material_type, file_url, filename, status, exercises, ai_conversion_status")
        .eq("submission_id", step.submissionId);

      if (sfData) {
        const loaded: FileEntry[] = (sfData as any[]).map(sf => {
          const raw = sf.exercises;
          let exercises: ExerciseItem[] = [];
          let aiVocabulary: VocabItem[] | undefined;
          let aiGrammar: GrammarItem[] | undefined;
          let aiGenerate: GenerateType[] | undefined;

          if (Array.isArray(raw)) {
            exercises = raw.map(e => ({ ...e, localId: newLocalId() }));
          } else if (raw && typeof raw === "object") {
            exercises = (raw.exercises || []).map((e: any) => ({ ...e, localId: newLocalId() }));
            aiVocabulary = (raw.vocabulary || []).map((v: any) => ({ ...v, localId: newLocalId() }));
            aiGrammar = (raw.grammar || []).map((g: any) => ({ ...g, localId: newLocalId() }));
            aiGenerate = [
              ...(exercises.length > 0 ? ["exercises" as GenerateType] : []),
              ...(aiVocabulary && aiVocabulary.length > 0 ? ["vocabulary" as GenerateType] : []),
              ...(aiGrammar && aiGrammar.length > 0 ? ["grammar" as GenerateType] : []),
            ];
          }

          const aiStatus = sf.ai_conversion_status === "done" ? "confirmed" :
            sf.ai_conversion_status === "failed" ? "error" : "idle";

          return {
            localId: sf.id,
            materialType: sf.material_type as FileEntry["materialType"],
            file: null,
            filename: sf.filename || "",
            previewUrl: sf.file_url,
            uploadedFileUrl: sf.file_url,
            exercises,
            aiVocabulary,
            aiGrammar,
            aiGenerate,
            aiStatus,
            aiReviewTab: aiGenerate?.[0] || "exercises",
          };
        });
        setFiles(loaded);
      }
    }

    await loadSlideVersions(step.id);
    setSheetOpen(true);
  };

  // ── File management ─────────────────────────────────────────────────────────

  const addFileEntry = (type: FileEntry["materialType"]) => {
    setFiles(prev => [
      ...prev,
      {
        localId: newLocalId(),
        materialType: type,
        file: null,
        filename: "",
        previewUrl: null,
        exercises: type === "exercise" ? [] : undefined,
        aiStatus: type === "exercise" ? "idle" : undefined,
        aiGenerate: type === "exercise" ? ["exercises", "vocabulary", "grammar"] : undefined,
      },
    ]);
  };

  const updateFile = (localId: string, patch: Partial<FileEntry>) =>
    setFiles(prev => prev.map(f => f.localId === localId ? { ...f, ...patch } : f));

  const removeFile = (localId: string) => setFiles(prev => prev.filter(f => f.localId !== localId));

  const handleFileSelect = async (localId: string, file: File) => {
    const url = URL.createObjectURL(file);
    // Limpa uploadedFileUrl: novo arquivo selecionado, URL anterior não é mais válida
    updateFile(localId, { file, filename: file.name, previewUrl: url, uploadedFileUrl: null });

    // Slides: upload automático em background para habilitar IA sem precisar salvar rascunho
    const entryType = files.find(f => f.localId === localId)?.materialType;
    if (entryType !== "slide" || !selectedStep) return;

    updateFile(localId, { uploading: true });
    try {
      const folder = `submissions/${teacherId}/${selectedStep.id}/slide`;
      const ext = file.name.split(".").pop() || "pdf";
      const path = `${folder}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("materials").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("materials").getPublicUrl(path);
      updateFile(localId, { uploadedFileUrl: urlData.publicUrl, uploading: false });
      await upsertSlideVersion(selectedStep.id, urlData.publicUrl, file.name);
    } catch (e: any) {
      console.warn("Auto-upload do slide falhou:", e.message);
      updateFile(localId, { uploading: false });
      // Não mostra toast de erro — professor ainda pode salvar o rascunho manualmente
    }
  };

  const handleAudioRecorded = (localId: string, blob: Blob, url: string) => {
    const f = new File([blob], `audio_${Date.now()}.webm`, { type: "audio/webm" });
    updateFile(localId, { file: f, filename: f.name, previewUrl: url });
  };

  // Suporta seleção de múltiplos arquivos de áudio de uma vez
  const handleAudioFilesSelect = (localId: string, fileList: FileList) => {
    const fileArr = Array.from(fileList);
    if (fileArr.length === 0) return;
    setFiles(prev => {
      // Atualiza o card atual com o primeiro arquivo
      let result = prev.map(f =>
        f.localId !== localId ? f : {
          ...f,
          file: fileArr[0],
          filename: fileArr[0].name,
          previewUrl: URL.createObjectURL(fileArr[0]),
          uploadedFileUrl: null,
        }
      );
      // Adiciona novos cards para os arquivos subsequentes
      for (let i = 1; i < fileArr.length; i++) {
        result = [...result, {
          localId: newLocalId(),
          materialType: "audio" as const,
          file: fileArr[i],
          filename: fileArr[i].name,
          previewUrl: URL.createObjectURL(fileArr[i]),
          uploadedFileUrl: null,
        }];
      }
      return result;
    });
  };

  // ── AI generation ────────────────────────────────────────────────────────────

  const gerarConteudoIA = async (entry: FileEntry) => {
    const slideUrl = entry.aiFonte === "slide"
      ? files.find(f => f.materialType === "slide" && f.uploadedFileUrl)?.uploadedFileUrl ?? null
      : null;
    const rawDocUrl = entry.aiFonte === "documento" ? (entry.uploadedFileUrl ?? null) : null;

    if (entry.aiFonte === "slide" && !slideUrl) {
      toast({ title: "Slide não encontrado. Adicione e salve o slide primeiro.", variant: "destructive" });
      return;
    }
    if (entry.aiFonte === "documento" && !rawDocUrl) {
      toast({ title: "Salve o rascunho primeiro para que o documento seja enviado.", variant: "destructive" });
      return;
    }

    updateFile(entry.localId, { aiStatus: "converting" });
    try {
      const generate = (entry.aiGenerate?.length ? entry.aiGenerate : ["exercises"]) as string[];
      const { data, error } = await supabase.functions.invoke("convert-exercises-ai", {
        body: {
          slide_url: slideUrl,
          raw_document_url: rawDocUrl,
          teacher_instructions: entry.aiInstrucoes || null,
          submissionFileId: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.localId)
            ? entry.localId : undefined,
          generate,
          step_id: selectedStep?.id,
          level_id: levelId,
          unit_id: selectedStep?.unitId,
        },
      });
      if (error) throw new Error(error?.message || "Sem resultado");

      const aiExs: ExerciseItem[] = ((data?.exercises || []) as any[]).map(e => ({
        localId: newLocalId(),
        type: (["fill_blank","association","rewrite","dialogue","production"].includes(e.type) ? e.type : "production") as ExerciseItem["type"],
        question: e.question || "",
        options: Array.isArray(e.options)
          ? e.options.map((o: any) =>
              typeof o === "object" && o.left ? `${o.left}=${o.right}` : String(o)
            ).join(",")
          : (e.options || ""),
        answer: e.answer || "",
        explanation: e.explanation || "",
      }));

      const aiVocab: VocabItem[] = ((data?.vocabulary || []) as any[]).map(v => ({
        localId: newLocalId(),
        word: v.word || "",
        translation: v.translation || "",
        example_sentence: v.example_sentence || "",
        part_of_speech: (v.part_of_speech || "other") as VocabItem["part_of_speech"],
        difficulty: (v.difficulty || 1) as 1 | 2 | 3,
        distractors: (v.distractors?.slice(0, 3) || ["", "", ""]) as [string, string, string],
      }));

      const aiGram: GrammarItem[] = ((data?.grammar || []) as any[]).map(g => ({
        localId: newLocalId(),
        title: g.title || "",
        explanation: g.explanation || "",
        examples: (g.examples || []).map((ex: any) => ({
          sentence: ex.sentence || "",
          translation: ex.translation || "",
          highlight: ex.highlight || "",
        })),
        tip: g.tip || "",
      }));

      const firstTab: GenerateType = generate.includes("exercises") ? "exercises"
        : generate.includes("vocabulary") ? "vocabulary" : "grammar";

      updateFile(entry.localId, {
        aiStatus: "done",
        exercises: aiExs,
        aiVocabulary: aiVocab,
        aiGrammar: aiGram,
        aiReviewTab: firstTab,
        aiGenerate: generate as GenerateType[],
      });
      toast({ title: `IA gerou o conteúdo! Revise as ${generate.length} seção${generate.length > 1 ? "ões" : "ão"} antes de publicar.` });
    } catch (e: any) {
      updateFile(entry.localId, { aiStatus: "error" });
      toast({ title: "Erro na geração de conteúdo", description: e.message, variant: "destructive" });
    }
  };

  // ── Slide version helpers ────────────────────────────────────────────────────

  const loadSlideVersions = async (stepId: string) => {
    const { data: mat } = await (supabase as any)
      .from("materials")
      .select("id")
      .eq("step_id", stepId)
      .eq("type", "slide")
      .maybeSingle();
    if (!mat) { setSlideMaterialId(null); setSlideVersions([]); return; }
    setSlideMaterialId(mat.id);
    const { data: versions } = await (supabase as any)
      .from("material_versions")
      .select("id, file_url, filename, version_number, replaced_at")
      .eq("material_id", mat.id)
      .order("version_number", { ascending: false });
    setSlideVersions(versions || []);
  };

  const upsertSlideVersion = async (stepId: string, newFileUrl: string, newFilename: string) => {
    const { data: existing } = await (supabase as any)
      .from("materials")
      .select("id, file_url, filename")
      .eq("step_id", stepId)
      .eq("type", "slide")
      .maybeSingle();

    if (existing) {
      const { data: latestVer } = await (supabase as any)
        .from("material_versions")
        .select("version_number")
        .eq("material_id", existing.id)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      await (supabase as any).from("material_versions").insert({
        material_id: existing.id,
        file_url: existing.file_url,
        filename: existing.filename,
        version_number: (latestVer?.version_number ?? 0) + 1,
        replaced_at: new Date().toISOString(),
        replaced_by: teacherId,
      });

      await (supabase as any)
        .from("materials")
        .update({ file_url: newFileUrl, filename: newFilename })
        .eq("id", existing.id);

      setSlideMaterialId(existing.id);
    } else {
      const { data: newMat } = await (supabase as any)
        .from("materials")
        .insert({
          step_id: stepId,
          type: "slide",
          delivery: "before",
          title: newFilename,
          file_url: newFileUrl,
          filename: newFilename,
          active: true,
        })
        .select("id")
        .single();
      if (newMat) setSlideMaterialId(newMat.id);
    }

    await loadSlideVersions(stepId);
  };

  // ── Upload single file ──────────────────────────────────────────────────────

  const uploadFile = async (entry: FileEntry): Promise<string | null> => {
    if (!entry.file) return entry.uploadedFileUrl || null;
    // Slide já foi enviado pelo auto-upload — evita re-upload desnecessário
    if (entry.uploadedFileUrl) return entry.uploadedFileUrl;
    const bucket = entry.materialType === "audio" ? "audios" : "materials";
    const folder = entry.materialType === "audio"
      ? `audios/submissions/${teacherId}/${selectedStep!.id}`
      : `submissions/${teacherId}/${selectedStep!.id}/${entry.materialType}`;
    const ext = entry.file.name.split(".").pop();
    const path = `${folder}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, entry.file, { upsert: true });
    if (error) throw new Error(`Upload falhou: ${error.message}`);
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
    return urlData.publicUrl;
  };

  // ── Save draft ──────────────────────────────────────────────────────────────

  const saveDraft = async () => {
    if (!selectedStep) return;
    setSaving(true);
    try {
      let submissionId = currentSubmissionId;

      if (!submissionId) {
        const { data: sub, error } = await supabase
          .from("content_submissions")
          .insert({ teacher_id: teacherId, step_id: selectedStep.id, status: "draft" })
          .select("id")
          .single();
        if (error || !sub) throw new Error(error?.message || "Erro ao criar submissão");
        submissionId = sub.id;
        setCurrentSubmissionId(submissionId);
      }

      for (const entry of files) {
        const fileUrl = await uploadFile(entry);
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.localId);

        const aiPayload = entry.materialType === "exercise" && entry.aiStatus === "done"
          ? {
              exercises: {
                exercises: entry.exercises || [],
                vocabulary: entry.aiVocabulary || [],
                grammar: entry.aiGrammar || [],
              },
              ai_conversion_status: "done",
            }
          : {};

        const payload: any = {
          submission_id: submissionId,
          material_type: entry.materialType,
          file_url: fileUrl,
          filename: entry.filename,
          status: "pending",
          ...aiPayload,
        };

        if (isUuid) {
          await supabase.from("submission_files").update(payload).eq("id", entry.localId);
        } else {
          const { data: sf } = await supabase.from("submission_files").insert(payload).select("id").single();
          if (sf) updateFile(entry.localId, { localId: sf.id, uploadedFileUrl: fileUrl ?? undefined });
        }
        if (fileUrl) updateFile(entry.localId, { uploadedFileUrl: fileUrl });

        // Slide versioning: upsert materials + save previous to material_versions
        if (entry.materialType === "slide" && entry.file && fileUrl) {
          await upsertSlideVersion(selectedStep.id, fileUrl, entry.filename);
        }
      }

      toast({ title: "Rascunho salvo!" });
      await loadSteps();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Publish all ─────────────────────────────────────────────────────────────

  const publishAll = async () => {
    if (!selectedStep) return;
    setPublishing(true);
    try {
      // 1. Ensure submission exists
      let submissionId = currentSubmissionId;
      if (!submissionId) {
        const { data: sub, error } = await supabase
          .from("content_submissions")
          .insert({ teacher_id: teacherId, step_id: selectedStep.id, status: "draft" })
          .select("id")
          .single();
        if (error || !sub) throw new Error(error?.message || "Erro ao criar submissão");
        submissionId = sub.id;
        setCurrentSubmissionId(submissionId);
      }

      // 2. Upload pending files
      for (const entry of files) {
        if (!entry.file && entry.uploadedFileUrl) continue; // already uploaded
        const fileUrl = await uploadFile(entry);
        if (fileUrl) {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.localId);
          const payload = {
            submission_id: submissionId,
            material_type: entry.materialType,
            file_url: fileUrl,
            filename: entry.filename,
            status: "approved",
          };
          if (isUuid) {
            await supabase.from("submission_files").update({ file_url: fileUrl, status: "approved" }).eq("id", entry.localId);
          } else {
            const { data: sf } = await supabase.from("submission_files").insert(payload).select("id").single();
            if (sf) updateFile(entry.localId, { localId: sf.id, uploadedFileUrl: fileUrl });
          }
          updateFile(entry.localId, { uploadedFileUrl: fileUrl });

          // Slide versioning on publish
          if (entry.materialType === "slide" && fileUrl) {
            await upsertSlideVersion(selectedStep.id, fileUrl, entry.filename);
          }
        }
      }

      // 3. Find AI content entry
      const aiEntry = files.find(f => f.materialType === "exercise" && f.aiStatus === "done");

      if (aiEntry) {
        // 4. Insert exercises → lesson_exercises + exercise_bank
        const exercises = aiEntry.exercises || [];
        if (exercises.length > 0) {
          // Remove previous exercises for this step before inserting the new set
          await (supabase as any).from("lesson_exercises").delete().eq("step_id", selectedStep.id);

          const VALID_EX_TYPES = ["fill_blank","association","rewrite","dialogue","production"];
          const lessonExInserts = exercises.map((ex, i) => ({
            step_id: selectedStep.id,
            type: VALID_EX_TYPES.includes(ex.type) ? ex.type : "production",
            question: ex.question,
            options: formatOptionsForDb(ex),
            answer: ex.answer,
            explanation: ex.explanation || null,
            order_index: i + 1,
            active: true,
          }));
          const { error: leErr } = await (supabase as any).from("lesson_exercises").insert(lessonExInserts);
          if (leErr) console.error("lesson_exercises insert:", leErr);

          if (levelId) {
            const langId = levels.find(l => l.id === levelId)?.language_id || null;
            const bankInserts = exercises.map(ex => ({
              language_id: langId,
              level_id: levelId,
              created_by: teacherId,
              type: ex.type,
              question: ex.question,
              options: formatOptionsForDb(ex),
              answer: ex.answer,
              explanation: ex.explanation || null,
              tags: [],
              active: true,
              times_used: 0,
            }));
            await (supabase as any).from("exercise_bank").insert(bankInserts);
          }
        }

        // 5. Insert vocabulary + distractors
        const vocab = aiEntry.aiVocabulary || [];
        for (const v of vocab) {
          if (!v.word.trim()) continue;
          const { data: vocabRow } = await (supabase as any).from("vocabulary").insert({
            level_id: levelId,
            unit_id: selectedStep.unitId || null,
            word: v.word,
            translation: v.translation,
            example_sentence: v.example_sentence || null,
            part_of_speech: v.part_of_speech,
            difficulty: v.difficulty,
            active: true,
          }).select("id").single();

          if (vocabRow?.id) {
            const distractors = v.distractors.filter(Boolean).map(d => ({
              vocabulary_id: vocabRow.id,
              distractor: d,
            }));
            if (distractors.length > 0) {
              await (supabase as any).from("vocabulary_distractors").insert(distractors);
            }
          }
        }

        // 6. Insert grammar rules
        const grammar = aiEntry.aiGrammar || [];
        for (let i = 0; i < grammar.length; i++) {
          const g = grammar[i];
          if (!g.title.trim()) continue;
          await (supabase as any).from("step_grammar").insert({
            step_id: selectedStep.id,
            title: g.title,
            explanation: g.explanation,
            examples: g.examples,
            tip: g.tip || null,
            order_index: i + 1,
            active: true,
            created_by: teacherId,
          });
        }
      }

      // 7. Mark submission as approved
      await supabase
        .from("content_submissions")
        .update({ status: "approved", submitted_at: new Date().toISOString() })
        .eq("id", submissionId);

      toast({ title: "Conteúdo publicado com sucesso! Os alunos já podem acessar." });
      setPublishDialogOpen(false);
      setSheetOpen(false);
      await loadSteps();
    } catch (e: any) {
      toast({ title: "Erro ao publicar", description: e.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  // ── Derived for dialog ──────────────────────────────────────────────────────

  const aiEntry = files.find(f => f.materialType === "exercise" && f.aiStatus === "done");
  const dialogExercises = aiEntry?.exercises || [];
  const dialogVocab = aiEntry?.aiVocabulary || [];
  const dialogGrammar = aiEntry?.aiGrammar || [];
  const hasSlide = files.some(f => f.materialType === "slide" && !!f.uploadedFileUrl);
  const hasAudio = files.some(f => f.materialType === "audio" && !!f.uploadedFileUrl);

  // ── Render ──────────────────────────────────────────────────────────────────

  const filteredLevels = levels.filter(l => !languageId || l.language_id === languageId);

  return (
    <div className="space-y-4">
      {/* Level selector — language is auto-detected from teacher's students */}
      <Select value={levelId || ""} onValueChange={v => setLevelId(v || null)} disabled={!languageId}>
        <SelectTrigger className="h-9 text-xs">
          <SelectValue placeholder="Selecione o nível" />
        </SelectTrigger>
        <SelectContent>
          {filteredLevels.map(l => <SelectItem key={l.id} value={l.id}>{l.name} ({l.code})</SelectItem>)}
        </SelectContent>
      </Select>

      {!levelId ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Globe className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          Selecione um nível para ver os passos.
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : (
        <>
          {/* Step list */}
          <div className="space-y-1.5">
            {steps.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum passo encontrado para este nível.</p>
            )}
            {steps.map(step => {
              const sub = step.submissionStatus;
              const statusInfo = sub ? statusLabel[sub] : null;
              return (
                <button
                  key={step.id}
                  onClick={() => openStep(step)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border bg-card hover:border-primary/30 hover:bg-muted/30 transition-colors text-left"
                >
                  {/* Number badge */}
                  <div className={cn(
                    "h-7 w-7 rounded-md shrink-0 flex items-center justify-center text-xs font-bold",
                    STATUS_BADGE[step.status]
                  )}>
                    {step.number}
                  </div>

                  {/* Title (blank if none) */}
                  <span className="flex-1 text-sm truncate min-w-0">
                    {step.title ?? ""}
                  </span>

                  {/* Submission status badge */}
                  {statusInfo && (
                    <Badge variant={statusInfo.variant} className="shrink-0 gap-1 text-[10px] py-0 px-1.5">
                      {statusInfo.icon}
                      <span className="hidden sm:inline">{statusInfo.label}</span>
                    </Badge>
                  )}

                  {step.adminComment && sub === "rejected" && (
                    <span className="text-xs text-destructive truncate max-w-[100px] hidden sm:block">"{step.adminComment}"</span>
                  )}

                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>

          {/* Exercise Bank Picker */}
          <ExerciseBankPicker
            open={bankPickerEntryId !== null}
            onOpenChange={open => { if (!open) setBankPickerEntryId(null); }}
            levelId={levelId}
            onSelect={exs => {
              if (!bankPickerEntryId) return;
              const entry = files.find(f => f.localId === bankPickerEntryId);
              if (entry) updateFile(bankPickerEntryId, { exercises: [...(entry.exercises || []), ...exs] });
              setBankPickerEntryId(null);
            }}
          />

          {/* Publish Dialog */}
          <PublishDialog
            open={publishDialogOpen}
            onOpenChange={setPublishDialogOpen}
            exercises={dialogExercises}
            vocabulary={dialogVocab}
            grammar={dialogGrammar}
            hasSlide={hasSlide}
            hasAudio={hasAudio}
            onPublish={publishAll}
            publishing={publishing}
          />

          {/* Step drawer */}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col overflow-y-auto">
              <SheetHeader>
                <SheetTitle>
                  Passo {selectedStep?.number}{selectedStep?.title ? ` — ${selectedStep.title}` : ""}
                </SheetTitle>
              </SheetHeader>

              {selectedStep?.submissionStatus === "rejected" && selectedStep.adminComment && (
                <div className="mx-4 mt-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-xs text-destructive">
                  <strong>Comentário do admin:</strong> {selectedStep.adminComment}
                </div>
              )}
              {selectedStep?.submissionStatus === "approved" && (
                <div className="mx-4 mt-2 p-3 rounded-lg border border-lime/30 bg-lime/5 text-xs text-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-lime-600" />
                  Conteúdo publicado e disponível para os alunos.
                </div>
              )}

              <div className="flex-1 space-y-4 p-4 overflow-y-auto">
                {/* File entries */}
                {(() => {
                  // Slide "presente": arquivo selecionado (mesmo sem upload ainda)
                  const slidePresente = files.some(f => f.materialType === "slide" && (!!f.file || !!f.uploadedFileUrl || !!f.previewUrl));
                  // Slide "enviado": já foi feito upload ao servidor
                  const slideEnviado = files.some(f => f.materialType === "slide" && !!f.uploadedFileUrl);
                  // Áudios: para numerar quando há mais de um
                  const audioEntries = files.filter(f => f.materialType === "audio");
                  return files.map((entry) => (
                    <div key={entry.localId} className="border rounded-lg p-3 space-y-3 bg-muted/20">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-bold">
                          {TYPE_ICONS[entry.materialType]}
                          {entry.materialType === "audio" && audioEntries.length > 1
                            ? `Áudio ${audioEntries.findIndex(f => f.localId === entry.localId) + 1}`
                            : TYPE_LABELS[entry.materialType]}
                        </div>
                        <button onClick={() => removeFile(entry.localId)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {/* ── Audio ── */}
                      {entry.materialType === "audio" ? (
                        <div className="space-y-2">
                          <AudioRecorder onRecorded={(blob, url) => handleAudioRecorded(entry.localId, blob, url)} />
                          <div className="text-xs text-muted-foreground">ou</div>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {entry.filename || "Selecionar arquivo(s) de áudio"}
                            </span>
                            <input
                              type="file"
                              accept="audio/*"
                              multiple
                              className="hidden"
                              onChange={e => e.target.files?.length && handleAudioFilesSelect(entry.localId, e.target.files)}
                            />
                          </label>
                          {entry.previewUrl && <audio controls src={entry.previewUrl} className="w-full h-8" />}
                        </div>

                      ) : entry.materialType === "exercise" ? (
                        // ── AI Content entry ──
                        <div className="space-y-3">

                          {/* Idle / Error: generation form */}
                          {(entry.aiStatus === "idle" || entry.aiStatus === "error") && (
                            <div className="space-y-3 border rounded-lg p-3 bg-muted/10">
                              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Gerar com IA</p>

                              {/* Source selector */}
                              <div>
                                <p className="text-[10px] text-muted-foreground mb-1.5">Fonte do conteúdo</p>
                                <div className="grid grid-cols-2 gap-1.5">
                                  <Button
                                    size="sm"
                                    variant={entry.aiFonte === "slide" ? "default" : "outline"}
                                    onClick={() => updateFile(entry.localId, { aiFonte: "slide" })}
                                    disabled={!slidePresente}
                                    className="text-xs h-8"
                                    title={!slidePresente ? "Adicione um slide primeiro" : undefined}
                                  >
                                    Slide da aula
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={entry.aiFonte === "documento" ? "default" : "outline"}
                                    onClick={() => updateFile(entry.localId, { aiFonte: "documento" })}
                                    className="text-xs h-8"
                                  >
                                    Upload de documento
                                  </Button>
                                </div>
                                {/* Aviso: slide presente mas upload ainda não concluído */}
                                {entry.aiFonte === "slide" && !slideEnviado && slidePresente && !files.find(f => f.materialType === "slide")?.uploading && (
                                  <p className="text-[10px] text-amber-600 mt-1">
                                    ⚠️ O envio do slide falhou. Salve o rascunho para tentar novamente.
                                  </p>
                                )}
                              </div>

                              {/* Document upload */}
                              {entry.aiFonte === "documento" && (
                                <label className="flex items-center gap-2 cursor-pointer border border-dashed rounded p-2 hover:bg-muted/30">
                                  <Upload className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate">{entry.filename || "Enviar PDF / DOCX"}</p>
                                    {entry.file && !entry.uploadedFileUrl && (
                                      <p className="text-[10px] text-amber-500">Salve o rascunho antes de gerar</p>
                                    )}
                                  </div>
                                  <input type="file" accept=".pdf,.doc,.docx" className="hidden"
                                    onChange={e => e.target.files?.[0] && handleFileSelect(entry.localId, e.target.files[0])} />
                                </label>
                              )}

                              {/* What to generate */}
                              <div>
                                <p className="text-[10px] text-muted-foreground mb-1.5">O que gerar</p>
                                <div className="flex gap-2 flex-wrap">
                                  {(["exercises", "vocabulary", "grammar"] as GenerateType[]).map(type => {
                                    const active = entry.aiGenerate?.includes(type) ?? false;
                                    return (
                                      <button
                                        key={type}
                                        onClick={() => {
                                          const current = entry.aiGenerate || [];
                                          const next = active
                                            ? current.filter(t => t !== type)
                                            : [...current, type];
                                          updateFile(entry.localId, { aiGenerate: next });
                                        }}
                                        className={cn(
                                          "px-2.5 py-1 rounded-md text-xs border font-medium transition-colors",
                                          active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted/50"
                                        )}
                                      >
                                        {GENERATE_LABELS[type]}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Teacher instructions */}
                              <Textarea
                                placeholder="Instruções para a IA (opcional): ex. criar 5 exercícios de lacuna, foco em verbos irregulares…"
                                value={entry.aiInstrucoes || ""}
                                onChange={e => updateFile(entry.localId, { aiInstrucoes: e.target.value })}
                                rows={2}
                                className="text-xs"
                              />

                              {entry.aiStatus === "error" && (
                                <p className="text-xs text-destructive">Falha na geração. Verifique as configurações e tente novamente.</p>
                              )}

                              <Button
                                size="sm"
                                onClick={() => gerarConteudoIA(entry)}
                                disabled={
                                  !entry.aiFonte ||
                                  !entry.aiGenerate?.length ||
                                  (entry.aiFonte === "slide" && !slideEnviado) ||
                                  (entry.aiFonte === "documento" && !entry.file && !entry.uploadedFileUrl)
                                }
                                className="w-full text-xs gap-1.5"
                              >
                                Gerar conteúdo com IA
                              </Button>
                            </div>
                          )}

                          {/* Converting: skeleton */}
                          {entry.aiStatus === "converting" && (
                            <div className="border rounded-lg p-3 space-y-2 bg-muted/10">
                              <Skeleton className="h-3 w-2/5" />
                              <Skeleton className="h-3 w-full" />
                              <Skeleton className="h-3 w-3/4" />
                              <Skeleton className="h-3 w-full" />
                              <Skeleton className="h-3 w-1/2" />
                              <Skeleton className="h-3 w-4/5" />
                              <p className="text-xs text-muted-foreground text-center pt-1">
                                Analisando o slide e gerando conteúdo…
                              </p>
                            </div>
                          )}

                          {/* Done: review tabs */}
                          {entry.aiStatus === "done" && (
                            <div className="space-y-2">
                              {/* Header row */}
                              <div className="flex items-center justify-between px-0.5">
                                <div className="flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3 text-lime-600" />
                                  <span className="text-[10px] text-muted-foreground">Conteúdo gerado — revise e edite antes de publicar</span>
                                </div>
                                <button
                                  onClick={() => updateFile(entry.localId, { aiStatus: "idle", aiResult: undefined })}
                                  className="text-[10px] text-muted-foreground hover:text-foreground underline"
                                >
                                  Gerar novamente
                                </button>
                              </div>

                              {/* Tab bar */}
                              <div className="flex gap-0 border-b">
                                {(["exercises", "vocabulary", "grammar"] as GenerateType[]).filter(t =>
                                  entry.aiGenerate?.includes(t)
                                ).map(tab => {
                                  const count = tab === "exercises" ? (entry.exercises || []).length
                                    : tab === "vocabulary" ? (entry.aiVocabulary || []).length
                                    : (entry.aiGrammar || []).length;
                                  const active = (entry.aiReviewTab ?? "exercises") === tab;
                                  return (
                                    <button
                                      key={tab}
                                      onClick={() => updateFile(entry.localId, { aiReviewTab: tab })}
                                      className={cn(
                                        "flex-1 px-2 py-1.5 text-xs font-bold transition-colors",
                                        active
                                          ? "border-b-2 border-primary text-foreground"
                                          : "text-muted-foreground hover:text-foreground"
                                      )}
                                    >
                                      {GENERATE_LABELS[tab]} ({count})
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Tab content */}
                              <div className="pt-1">
                                {(entry.aiReviewTab ?? "exercises") === "exercises" && entry.aiGenerate?.includes("exercises") && (
                                  <>
                                    <ExerciseEditor
                                      exercises={entry.exercises || []}
                                      onChange={exs => updateFile(entry.localId, { exercises: exs })}
                                    />
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setBankPickerEntryId(entry.localId)}
                                      className="w-full gap-1.5 text-xs mt-2"
                                    >
                                      <Library className="h-3.5 w-3.5" />
                                      Buscar no banco de exercícios
                                    </Button>
                                  </>
                                )}
                                {entry.aiReviewTab === "vocabulary" && entry.aiGenerate?.includes("vocabulary") && (
                                  <VocabEditor
                                    vocab={entry.aiVocabulary || []}
                                    onChange={vocab => updateFile(entry.localId, { aiVocabulary: vocab })}
                                  />
                                )}
                                {entry.aiReviewTab === "grammar" && entry.aiGenerate?.includes("grammar") && (
                                  <GrammarEditor
                                    grammar={entry.aiGrammar || []}
                                    onChange={grammar => updateFile(entry.localId, { aiGrammar: grammar })}
                                  />
                                )}
                              </div>
                            </div>
                          )}

                          {/* Confirmed (already published) */}
                          {entry.aiStatus === "confirmed" && (
                            <div className="flex items-center gap-1.5 px-1">
                              <CheckCircle2 className="h-3 w-3 text-lime-600 shrink-0" />
                              <span className="text-[10px] text-muted-foreground">Conteúdo publicado pela IA</span>
                            </div>
                          )}
                        </div>

                      ) : (
                        // ── Slide / Grammar PDF / Vocab PDF ──
                        <div className="space-y-1.5">
                          <label className="flex items-center gap-2 cursor-pointer border border-dashed rounded p-2 hover:bg-muted/30">
                            <Upload className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs">{entry.filename || "Selecionar arquivo"}</span>
                            <input
                              type="file"
                              accept={entry.materialType === "slide" ? ".pdf,.ppt,.pptx" : ".pdf,.doc,.docx"}
                              className="hidden"
                              onChange={e => e.target.files?.[0] && handleFileSelect(entry.localId, e.target.files[0])}
                            />
                          </label>

                          {/* Auto-upload em progresso */}
                          {entry.materialType === "slide" && entry.uploading && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-0.5">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Enviando slide…
                            </div>
                          )}

                          {/* Versão atual + histórico (apenas slides) */}
                          {entry.materialType === "slide" && slideMaterialId && (
                            <div className="flex items-center justify-between px-0.5">
                              <span className="text-[10px] text-muted-foreground">
                                {slideVersions.length === 0 ? "Versão atual" : `v${slideVersions.length + 1} (atual)`}
                              </span>
                              {slideVersions.length > 0 && (
                                <button
                                  className="flex items-center gap-1 text-[10px] text-muted-foreground underline hover:text-foreground"
                                  onClick={() => setVersionDialogOpen(true)}
                                >
                                  <History className="h-3 w-3" />
                                  Ver histórico ({slideVersions.length})
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ));
                })()}

                {/* Add content buttons */}
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Adicionar conteúdo</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["slide", "audio", "grammar", "vocab", "exercise"] as const).map(type => (
                      <Button
                        key={type}
                        variant="outline"
                        size="sm"
                        onClick={() => addFileEntry(type)}
                        className="justify-start gap-1.5 text-xs h-9"
                      >
                        {TYPE_ICONS[type]}
                        {TYPE_LABELS[type]}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t flex gap-2">
                <Button
                  variant="outline"
                  onClick={saveDraft}
                  disabled={saving || publishing}
                  className="flex-1 gap-1.5"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar rascunho
                </Button>
                <Button
                  onClick={() => setPublishDialogOpen(true)}
                  disabled={saving || publishing || files.length === 0}
                  className="flex-1 gap-1.5"
                >
                  <Rocket className="h-4 w-4" />
                  Revisar e publicar
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}

      {/* ── Version history dialog ─────────────────────────────────────────── */}
      <Dialog open={versionDialogOpen} onOpenChange={setVersionDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Histórico de versões</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {slideVersions.length === 0 ? (
              <p className="text-sm text-muted-foreground font-light py-2">Nenhuma versão anterior.</p>
            ) : (
              slideVersions.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">v{v.version_number}</p>
                    <p className="text-xs text-muted-foreground truncate">{v.filename || "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(v.replaced_at).toLocaleString("pt-BR", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 text-xs gap-1.5"
                    onClick={() => window.open(v.file_url, "_blank")}
                  >
                    Baixar
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeacherContentTab;
