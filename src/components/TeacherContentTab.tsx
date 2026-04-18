import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Upload, Plus, Trash2, Send, Save, ChevronRight,
  CheckCircle2, AlertCircle, Clock, XCircle, Loader2, Globe,
  Library, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StepInfo {
  id: string;
  number: number;
  title: string | null;
  status: "complete" | "partial" | "empty";
  submissionId: string | null;
  submissionStatus: string | null;
  adminComment: string | null;
}

interface ExerciseItem {
  localId: string;
  type: "fill_blank" | "association" | "open_answer";
  question: string;
  options: string; // comma-separated for association
  answer: string;
  explanation: string;
}

interface FileEntry {
  localId: string;
  materialType: "slide" | "audio" | "grammar" | "vocab" | "exercise";
  file: File | null;
  filename: string;
  previewUrl: string | null;
  // for audio recording
  isRecording?: boolean;
  // exercises attached to this file entry (for exercise type)
  exercises?: ExerciseItem[];
  // AI conversion
  aiStatus?: "idle" | "converting" | "done" | "confirmed" | "error";
  aiResult?: ExerciseItem[];
  aiFonte?: "slide" | "documento";
  aiInstrucoes?: string;
  uploadedFileUrl?: string | null;
}

interface Props {
  teacherId: string;
}

interface LangOption { id: string; name: string; }
interface LevelOption { id: string; name: string; code: string; language_id: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  complete: "bg-lime/80",
  partial: "bg-yellow-400/80",
  empty: "bg-muted",
};

const statusLabel: Record<string, { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Rascunho", icon: <Save className="h-3 w-3" />, variant: "secondary" },
  pending: { label: "Aguardando aprovação", icon: <Clock className="h-3 w-3" />, variant: "default" },
  approved: { label: "Aprovado", icon: <CheckCircle2 className="h-3 w-3" />, variant: "outline" },
  rejected: { label: "Rejeitado", icon: <XCircle className="h-3 w-3" />, variant: "destructive" },
  partial: { label: "Parcialmente aprovado", icon: <AlertCircle className="h-3 w-3" />, variant: "secondary" },
};

const TYPE_LABELS: Record<string, string> = {
  slide: "Slide / Apresentação",
  audio: "Áudio",
  grammar: "Gramática (PDF)",
  vocab: "Vocabulário (PDF)",
  exercise: "Exercícios",
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  slide: <FileText className="h-4 w-4" />,
  audio: <Headphones className="h-4 w-4" />,
  grammar: <FileText className="h-4 w-4" />,
  vocab: <BookOpen className="h-4 w-4" />,
  exercise: <PenLine className="h-4 w-4" />,
};

function newLocalId() {
  return Math.random().toString(36).slice(2);
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Enunciado / Frase com ___ para lacuna"
            value={ex.question}
            onChange={e => updateEx(ex.localId, { question: e.target.value })}
            rows={2}
            className="text-xs"
          />
          {ex.type === "association" && (
            <Input
              placeholder="Opções separadas por vírgula (ex: cat,dog,bird)"
              value={ex.options}
              onChange={e => updateEx(ex.localId, { options: e.target.value })}
              className="text-xs h-8"
            />
          )}
          <Input
            placeholder={ex.type === "fill_blank" ? "Resposta correta" : ex.type === "association" ? "Pares corretos (ex: cat=gato,dog=cachorro)" : "Resposta esperada / critério"}
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

function AudioRecorder({
  onRecorded,
}: {
  onRecorded: (blob: Blob, url: string) => void;
}) {
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

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

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

// ── Exercise Bank Picker ──────────────────────────────────────────────────────

interface BankExercise {
  id: string;
  type: string;
  question: string;
  options: any;
  answer: string;
  explanation: string | null;
}

function ExerciseBankPicker({
  open,
  onOpenChange,
  levelId,
  onSelect,
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
      options: Array.isArray(e.options) ? e.options.join(",") : (e.options || ""),
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
          <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); }}>
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
            <p className="text-xs text-muted-foreground text-center py-8">
              Nenhum exercício encontrado.
            </p>
          ) : results.map(ex => (
            <button
              key={ex.id}
              onClick={() => toggle(ex.id)}
              className={cn(
                "w-full text-left p-3 rounded-lg border text-xs transition-colors",
                selected.has(ex.id)
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/30"
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
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={confirm}
            disabled={selected.size === 0}
          >
            Adicionar {selected.size > 0 ? `(${selected.size})` : "selecionados"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const TeacherContentTab = ({ teacherId }: Props) => {
  const { toast } = useToast();
  const [languages, setLanguages] = useState<LangOption[]>([]);
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [languageId, setLanguageId] = useState<string | null>(null);
  const [levelId, setLevelId] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStep, setSelectedStep] = useState<StepInfo | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentSubmissionId, setCurrentSubmissionId] = useState<string | null>(null);
  const [bankPickerEntryId, setBankPickerEntryId] = useState<string | null>(null);

  // Load languages and levels once
  useEffect(() => {
    const loadOptions = async () => {
      const [{ data: langs }, { data: lvls }] = await Promise.all([
        supabase.from("languages").select("id, name").order("name"),
        supabase.from("levels").select("id, name, code, language_id").order("code"),
      ]);
      setLanguages(langs || []);
      setLevels(lvls || []);
    };
    loadOptions();
  }, []);

  // ── Load steps ──────────────────────────────────────────────────────────────

  const loadSteps = useCallback(async () => {
    if (!languageId || !levelId) { setLoading(false); return; }
    setLoading(true);

    // Get all steps for this level via units join
    // steps → unit_id → units.level_id → levels.language_id
    const { data: unitsData } = await supabase
      .from("units")
      .select("id")
      .eq("level_id", levelId);

    const unitIds = (unitsData || []).map(u => u.id);
    if (unitIds.length === 0) { setSteps([]); setLoading(false); return; }

    const { data: stepsData } = await supabase
      .from("steps")
      .select("id, number, title")
      .in("unit_id", unitIds)
      .order("number", { ascending: true });

    if (!stepsData) { setLoading(false); return; }

    // Get completion status view
    const stepIds = stepsData.map(s => s.id);
    const { data: statusData } = await (supabase as any)
      .from("step_completion_status")
      .select("step_id, has_slide, has_exercises, is_complete")
      .in("step_id", stepIds);

    // Get teacher submissions for these steps
    const { data: submissionsData } = await (supabase as any)
      .from("content_submissions")
      .select("id, step_id, status, admin_comment")
      .eq("teacher_id", teacherId)
      .in("step_id", stepIds);

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

    if (step.submissionId) {
      // Load existing submission files
      const { data: sfData } = await (supabase as any)
        .from("submission_files")
        .select("id, material_type, file_url, filename, status, exercises, ai_conversion_status")
        .eq("submission_id", step.submissionId);

      if (sfData) {
        const loaded: FileEntry[] = (sfData as any[]).map(sf => ({
          localId: sf.id,
          materialType: sf.material_type as FileEntry["materialType"],
          file: null,
          filename: sf.filename || "",
          previewUrl: sf.file_url,
          uploadedFileUrl: sf.file_url,
          exercises: sf.exercises
            ? (sf.exercises as any[]).map(e => ({ ...e, localId: newLocalId() }))
            : [],
          aiStatus: sf.ai_conversion_status === "done" ? "confirmed" : "idle",
        }));
        setFiles(loaded);
      }
    }

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
      },
    ]);
  };

  const updateFile = (localId: string, patch: Partial<FileEntry>) =>
    setFiles(prev => prev.map(f => (f.localId === localId ? { ...f, ...patch } : f)));

  const removeFile = (localId: string) =>
    setFiles(prev => prev.filter(f => f.localId !== localId));

  const handleFileSelect = (localId: string, file: File) => {
    const url = URL.createObjectURL(file);
    updateFile(localId, { file, filename: file.name, previewUrl: url });
  };

  const handleAudioRecorded = (localId: string, blob: Blob, url: string) => {
    const f = new File([blob], `audio_${Date.now()}.webm`, { type: "audio/webm" });
    updateFile(localId, { file: f, filename: f.name, previewUrl: url });
  };

  // ── AI generation ────────────────────────────────────────────────────────────

  const gerarExerciciosIA = async (entry: FileEntry) => {
    const slideUrl = entry.aiFonte === "slide"
      ? files.find(f => f.materialType === "slide" && f.uploadedFileUrl)?.uploadedFileUrl ?? null
      : null;
    const rawDocUrl = entry.aiFonte === "documento" ? (entry.uploadedFileUrl ?? null) : null;

    if (entry.aiFonte === "slide" && !slideUrl) {
      toast({ title: "Slide não encontrado. Adicione e salve um slide primeiro.", variant: "destructive" });
      return;
    }
    if (entry.aiFonte === "documento" && !rawDocUrl) {
      toast({ title: "Salve o rascunho primeiro para que o documento seja enviado.", variant: "destructive" });
      return;
    }

    updateFile(entry.localId, { aiStatus: "converting" });
    try {
      const { data, error } = await supabase.functions.invoke("convert-exercises-ai", {
        body: {
          slide_url: slideUrl,
          raw_document_url: rawDocUrl,
          teacher_instructions: entry.aiInstrucoes || null,
          submissionFileId: entry.localId,
        },
      });
      if (error || !data?.exercises) throw new Error(error?.message || "Sem resultado");
      const aiExs: ExerciseItem[] = (data.exercises as any[]).map(e => ({
        localId: newLocalId(),
        type: e.type || "open_answer",
        question: e.question || "",
        options: Array.isArray(e.options) ? e.options.join(",") : (e.options || ""),
        answer: e.answer || "",
        explanation: e.explanation || "",
      }));
      updateFile(entry.localId, { aiStatus: "done", aiResult: aiExs, exercises: aiExs });
      toast({ title: "IA gerou os exercícios! Revise e confirme." });
    } catch (e: any) {
      updateFile(entry.localId, { aiStatus: "error" });
      toast({ title: "Erro na geração de exercícios", description: e.message, variant: "destructive" });
    }
  };

  const confirmExercises = async (localId: string) => {
    const entry = files.find(f => f.localId === localId);
    if (!entry || !entry.exercises?.length) return;
    // Persist to DB if this is an existing row (UUID format)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(localId)) {
      await (supabase as any)
        .from("submission_files")
        .update({ exercises: entry.exercises, ai_conversion_status: "done" })
        .eq("id", localId);
    }
    updateFile(localId, { aiStatus: "confirmed" });
    toast({ title: "Exercícios confirmados!" });
  };

  // ── Upload single file to storage ───────────────────────────────────────────

  const uploadFile = async (entry: FileEntry): Promise<string | null> => {
    if (!entry.file) return entry.uploadedFileUrl || null;
    const bucket = entry.materialType === "audio" ? "audios" : "materials";
    const folder =
      entry.materialType === "audio"
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

      // Upload files and upsert submission_files
      for (const entry of files) {
        const fileUrl = await uploadFile(entry);
        const payload = {
          submission_id: submissionId,
          material_type: entry.materialType,
          file_url: fileUrl,
          filename: entry.filename,
          status: "pending",
          exercises: entry.exercises && entry.exercises.length > 0 ? entry.exercises.map(e => ({
            type: e.type, question: e.question, options: e.options, answer: e.answer, explanation: e.explanation,
          })) : null,
          ai_conversion_status: entry.aiStatus === "done" ? "done" : null,
        };

        if (entry.localId.length === 36 && /^[0-9a-f-]+$/.test(entry.localId)) {
          // Existing DB row — update
          await supabase.from("submission_files").update(payload).eq("id", entry.localId);
        } else {
          // New row — insert
          const { data: sf } = await supabase.from("submission_files").insert(payload).select("id").single();
          if (sf) updateFile(entry.localId, { localId: sf.id, uploadedFileUrl: fileUrl ?? undefined });
        }
        if (fileUrl) updateFile(entry.localId, { uploadedFileUrl: fileUrl });
      }

      toast({ title: "Rascunho salvo!" });
      await loadSteps();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Submit for approval ─────────────────────────────────────────────────────

  const submitForApproval = async () => {
    if (!selectedStep || files.length === 0) {
      toast({ title: "Adicione pelo menos um arquivo antes de enviar.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await saveDraft();
      if (!currentSubmissionId) throw new Error("Submissão não criada");
      await supabase
        .from("content_submissions")
        .update({ status: "pending", submitted_at: new Date().toISOString() })
        .eq("id", currentSubmissionId);
      toast({ title: "Enviado para aprovação!", description: "O admin será notificado." });
      setSheetOpen(false);
      await loadSteps();
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const filteredLevels = levels.filter(l => !languageId || l.language_id === languageId);

  return (
    <div className="space-y-4">
      {/* Language / Level selectors */}
      <div className="flex gap-2">
        <Select value={languageId || ""} onValueChange={v => { setLanguageId(v || null); setLevelId(null); setSteps([]); }}>
          <SelectTrigger className="flex-1 h-9 text-xs">
            <SelectValue placeholder="Idioma" />
          </SelectTrigger>
          <SelectContent>
            {languages.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={levelId || ""} onValueChange={v => setLevelId(v || null)} disabled={!languageId}>
          <SelectTrigger className="flex-1 h-9 text-xs">
            <SelectValue placeholder="Nível" />
          </SelectTrigger>
          <SelectContent>
            {filteredLevels.map(l => <SelectItem key={l.id} value={l.id}>{l.name} ({l.code})</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!languageId || !levelId ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Globe className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          Selecione um idioma e nível para ver os passos.
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
              className="w-full flex items-center gap-3 p-3 rounded-lg border bg-card hover:border-primary/30 hover:bg-muted/30 transition-colors text-left"
            >
              {/* Semaphore dot */}
              <div className={cn("h-3 w-3 rounded-full shrink-0", STATUS_COLORS[step.status])} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">Passo {step.number}{step.title ? ` — ${step.title}` : ""}</p>
                {statusInfo && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-muted-foreground">{statusInfo.icon}</span>
                    <span className="text-xs text-muted-foreground">{statusInfo.label}</span>
                  </div>
                )}
                {step.adminComment && sub === "rejected" && (
                  <p className="text-xs text-destructive mt-0.5 truncate">"{step.adminComment}"</p>
                )}
              </div>
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
          if (entry) {
            updateFile(bankPickerEntryId, { exercises: [...(entry.exercises || []), ...exs] });
          }
          setBankPickerEntryId(null);
        }}
      />

      {/* Step drawer */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              Passo {selectedStep?.number}{selectedStep?.title ? ` — ${selectedStep.title}` : ""}
            </SheetTitle>
          </SheetHeader>

          {/* Rejection comment */}
          {selectedStep?.submissionStatus === "rejected" && selectedStep.adminComment && (
            <div className="mx-4 mt-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-xs text-destructive">
              <strong>Comentário do admin:</strong> {selectedStep.adminComment}
            </div>
          )}

          {/* Already approved */}
          {selectedStep?.submissionStatus === "approved" && (
            <div className="mx-4 mt-2 p-3 rounded-lg border border-lime/30 bg-lime/5 text-xs text-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-lime-600" />
              Conteúdo aprovado e publicado.
            </div>
          )}

          {/* Pending */}
          {selectedStep?.submissionStatus === "pending" && (
            <div className="mx-4 mt-2 p-3 rounded-lg border bg-muted text-xs text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Aguardando revisão do admin. Você ainda pode editar o rascunho.
            </div>
          )}

          <div className="flex-1 space-y-4 p-4 overflow-y-auto">
            {/* Existing file entries */}
            {(() => {
              const slideDisponivel = files.some(f => f.materialType === "slide" && !!f.uploadedFileUrl);
              return files.map((entry, i) => (
              <div key={entry.localId} className="border rounded-lg p-3 space-y-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    {TYPE_ICONS[entry.materialType]}
                    {TYPE_LABELS[entry.materialType]}
                  </div>
                  <button onClick={() => removeFile(entry.localId)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Audio: record or upload */}
                {entry.materialType === "audio" ? (
                  <div className="space-y-2">
                    <AudioRecorder onRecorded={(blob, url) => handleAudioRecorded(entry.localId, blob, url)} />
                    <div className="text-xs text-muted-foreground">ou</div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{entry.filename || "Selecionar arquivo de áudio"}</span>
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={e => e.target.files?.[0] && handleFileSelect(entry.localId, e.target.files[0])}
                      />
                    </label>
                    {entry.previewUrl && <audio controls src={entry.previewUrl} className="w-full h-8" />}
                  </div>
                ) : entry.materialType === "exercise" ? (
                  <div className="space-y-3">

                    {/* ── IA: fonte + instruções + gerar ── */}
                    {(entry.aiStatus === "idle" || entry.aiStatus === "error") && (
                      <div className="space-y-2 border rounded-lg p-3 bg-muted/10">
                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Gerar com IA</p>

                        {/* Source selector */}
                        <div className="grid grid-cols-2 gap-1.5">
                          <Button
                            size="sm"
                            variant={entry.aiFonte === "slide" ? "default" : "outline"}
                            onClick={() => updateFile(entry.localId, { aiFonte: "slide" })}
                            disabled={!slideDisponivel}
                            className="text-xs h-8"
                            title={!slideDisponivel ? "Adicione e salve um slide primeiro" : undefined}
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

                        {/* Document upload when "documento" selected */}
                        {entry.aiFonte === "documento" && (
                          <label className="flex items-center gap-2 cursor-pointer border border-dashed rounded p-2 hover:bg-muted/30">
                            <Upload className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{entry.filename || "Enviar PDF / DOCX"}</p>
                              {entry.file && !entry.uploadedFileUrl && (
                                <p className="text-[10px] text-amber-500">Salve o rascunho antes de gerar</p>
                              )}
                            </div>
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx"
                              className="hidden"
                              onChange={e => e.target.files?.[0] && handleFileSelect(entry.localId, e.target.files[0])}
                            />
                          </label>
                        )}

                        {/* Teacher instructions */}
                        <Textarea
                          placeholder="Instruções para a IA (opcional): ex. criar 5 exercícios de lacuna, focar em verbos irregulares…"
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
                          onClick={() => gerarExerciciosIA(entry)}
                          disabled={!entry.aiFonte || (entry.aiFonte === "documento" && !entry.file && !entry.uploadedFileUrl)}
                          className="w-full text-xs gap-1.5"
                        >
                          Gerar exercícios com IA
                        </Button>
                      </div>
                    )}

                    {/* ── Converting: skeleton ── */}
                    {entry.aiStatus === "converting" && (
                      <div className="border rounded-lg p-3 space-y-2 bg-muted/10">
                        <Skeleton className="h-3 w-2/5" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-3/4" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-1/2" />
                        <p className="text-xs text-muted-foreground text-center pt-1">
                          Analisando o conteúdo e criando exercícios…
                        </p>
                      </div>
                    )}

                    {/* ── Done: review banner ── */}
                    {entry.aiStatus === "done" && (
                      <div className="flex items-center gap-2 px-1">
                        <Badge variant="secondary" className="text-[10px] gap-1 py-0.5">
                          <CheckCircle2 className="h-3 w-3 text-lime-600" />
                          {(entry.exercises || []).length} exercícios gerados
                        </Badge>
                        <button
                          onClick={() => updateFile(entry.localId, { aiStatus: "idle", aiResult: undefined })}
                          className="ml-auto text-[10px] text-muted-foreground hover:text-foreground underline"
                        >
                          Gerar novamente
                        </button>
                      </div>
                    )}

                    {/* ── Confirmed: small indicator ── */}
                    {entry.aiStatus === "confirmed" && (
                      <div className="flex items-center gap-1.5 px-1">
                        <CheckCircle2 className="h-3 w-3 text-lime-600 shrink-0" />
                        <span className="text-[10px] text-muted-foreground">Exercícios confirmados pela IA</span>
                        <button
                          onClick={() => updateFile(entry.localId, { aiStatus: "idle" })}
                          className="ml-auto text-[10px] text-muted-foreground hover:text-foreground underline"
                        >
                          Gerar novamente
                        </button>
                      </div>
                    )}

                    {/* ── Bank picker button ── */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setBankPickerEntryId(entry.localId)}
                      className="w-full gap-1.5 text-xs"
                    >
                      <Library className="h-3.5 w-3.5" />
                      Buscar no banco de exercícios
                    </Button>

                    {/* ── Editable exercise list ── */}
                    <ExerciseEditor
                      exercises={entry.exercises || []}
                      onChange={exs => updateFile(entry.localId, { exercises: exs })}
                    />

                    {/* ── Confirm button (visible only in "done" state) ── */}
                    {entry.aiStatus === "done" && (entry.exercises || []).length > 0 && (
                      <Button
                        size="sm"
                        onClick={() => confirmExercises(entry.localId)}
                        className="w-full text-xs gap-1.5"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Confirmar exercícios
                      </Button>
                    )}
                  </div>
                ) : (
                  /* slide / grammar / vocab — file upload */
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
                )}
              </div>
              ));
            })()}

            {/* Add type buttons */}
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

          {/* Footer actions */}
          <div className="p-4 border-t flex gap-2">
            <Button
              variant="outline"
              onClick={saveDraft}
              disabled={saving || submitting}
              className="flex-1 gap-1.5"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar rascunho
            </Button>
            <Button
              onClick={submitForApproval}
              disabled={saving || submitting || files.length === 0}
              className="flex-1 gap-1.5"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar para aprovação
            </Button>
          </div>
        </SheetContent>
      </Sheet>
        </>
      )}
    </div>
  );
};

export default TeacherContentTab;
