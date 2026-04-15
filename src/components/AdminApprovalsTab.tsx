import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, XCircle, FileText, Headphones, BookOpen,
  PenLine, Clock, ChevronDown, ChevronUp, Loader2, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubmissionFile {
  id: string;
  material_type: string;
  file_url: string | null;
  filename: string | null;
  status: string;
  comment: string | null;
  exercises: any[] | null;
  ai_conversion_status: string | null;
}

interface Submission {
  id: string;
  status: string;
  admin_comment: string | null;
  submitted_at: string | null;
  teacherName: string;
  stepNumber: number;
  stepId: string;
  languageName: string;
  levelCode: string;
  files: SubmissionFile[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  slide: "Slide",
  audio: "Áudio",
  grammar: "Gramática",
  vocab: "Vocabulário",
  exercise: "Exercícios",
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  slide: <FileText className="h-4 w-4" />,
  audio: <Headphones className="h-4 w-4" />,
  grammar: <FileText className="h-4 w-4" />,
  vocab: <BookOpen className="h-4 w-4" />,
  exercise: <PenLine className="h-4 w-4" />,
};

// Delivery mapping for approve action (materialType → delivery)
const DELIVERY_MAP: Record<string, string> = {
  slide: "during",
  audio: "before",
  vocab: "before",
  grammar: "after",
  exercise: "after",
};

// ── Main Component ────────────────────────────────────────────────────────────

const AdminApprovalsTab = () => {
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [fileComments, setFileComments] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);

    const { data } = await (supabase as any)
      .from("content_submissions")
      .select(`
        id, status, admin_comment, submitted_at,
        teachers!content_submissions_teacher_id_fkey(
          profiles!teachers_user_id_fkey(name)
        ),
        steps!content_submissions_step_id_fkey(
          id, number,
          units!steps_unit_id_fkey(
            levels!units_level_id_fkey(
              code,
              languages!levels_language_id_fkey(name)
            )
          )
        ),
        submission_files(id, material_type, file_url, filename, status, comment, exercises, ai_conversion_status)
      `)
      .in("status", ["pending", "partial"])
      .order("submitted_at", { ascending: true });

    if (data) {
      const mapped: Submission[] = (data as any[]).map(s => ({
        id: s.id,
        status: s.status,
        admin_comment: s.admin_comment,
        submitted_at: s.submitted_at,
        teacherName: s.teachers?.profiles?.name || "Professor",
        stepNumber: s.steps?.number || 0,
        stepId: s.steps?.id || "",
        languageName: s.steps?.units?.levels?.languages?.name || "",
        levelCode: s.steps?.units?.levels?.code || "",
        files: s.submission_files || [],
      }));
      setSubmissions(mapped);
    }

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Approve single file ─────────────────────────────────────────────────────

  const approveFile = async (submission: Submission, file: SubmissionFile) => {
    setProcessing(file.id);
    try {
      const delivery = DELIVERY_MAP[file.material_type] || "during";

      if (file.material_type === "exercise" && file.exercises && file.exercises.length > 0) {
        // Insert exercises into lesson_exercises
        const exerciseRows = file.exercises.map((e: any) => ({
          step_id: submission.stepId,
          type: e.type,
          question: e.question,
          options: e.type === "association" && e.options
            ? (typeof e.options === "string" ? e.options.split(",") : e.options)
            : null,
          answer: e.answer,
          explanation: e.explanation || null,
          active: true,
        }));
        const { error: exErr } = await supabase.from("lesson_exercises").insert(exerciseRows);
        if (exErr) throw new Error(`Erro ao inserir exercícios: ${exErr.message}`);
      } else if (file.file_url) {
        // Check for existing material of same type in this step → version history
        const { data: existing } = await supabase
          .from("materials")
          .select("id, file_url, title")
          .eq("step_id", submission.stepId)
          .eq("type", file.material_type)
          .eq("active", true)
          .maybeSingle();

        if (existing) {
          // Save version history
          await (supabase as any).from("material_versions").insert({
            material_id: existing.id,
            file_url: existing.file_url,
            filename: file.filename,
            replaced_at: new Date().toISOString(),
          });
          // Update existing material
          await supabase
            .from("materials")
            .update({ file_url: file.file_url, title: file.filename || TYPE_LABELS[file.material_type] })
            .eq("id", existing.id);
        } else {
          // Insert new material
          await supabase.from("materials").insert({
            step_id: submission.stepId,
            title: file.filename || TYPE_LABELS[file.material_type],
            type: file.material_type,
            delivery,
            file_url: file.file_url,
            active: true,
          });
        }
      }

      // Update submission_file status
      await (supabase as any)
        .from("submission_files")
        .update({ status: "approved", comment: null })
        .eq("id", file.id);

      toast({ title: `${TYPE_LABELS[file.material_type]} aprovado!` });
      await checkSubmissionCompletion(submission);
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao aprovar", description: e.message, variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  // ── Reject single file ──────────────────────────────────────────────────────

  const rejectFile = async (submission: Submission, file: SubmissionFile) => {
    const comment = fileComments[file.id];
    if (!comment?.trim()) {
      toast({ title: "Adicione um comentário antes de rejeitar.", variant: "destructive" });
      return;
    }
    setProcessing(file.id);
    try {
      await (supabase as any)
        .from("submission_files")
        .update({ status: "rejected", comment })
        .eq("id", file.id);

      toast({ title: "Arquivo rejeitado com feedback." });
      await checkSubmissionCompletion(submission);
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao rejeitar", description: e.message, variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  // ── Approve / reject whole submission ───────────────────────────────────────

  const approveAll = async (submission: Submission) => {
    setProcessing(submission.id);
    try {
      for (const file of submission.files.filter(f => f.status === "pending")) {
        await approveFile(submission, file);
      }
      await (supabase as any)
        .from("content_submissions")
        .update({ status: "approved" })
        .eq("id", submission.id);
      toast({ title: "Submissão aprovada por completo!" });
      await load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  const rejectAll = async (submission: Submission) => {
    const comment = fileComments[submission.id];
    if (!comment?.trim()) {
      toast({ title: "Adicione um comentário geral antes de rejeitar tudo.", variant: "destructive" });
      return;
    }
    setProcessing(submission.id);
    try {
      await (supabase as any)
        .from("content_submissions")
        .update({ status: "rejected", admin_comment: comment })
        .eq("id", submission.id);
      await (supabase as any)
        .from("submission_files")
        .update({ status: "rejected", comment })
        .eq("submission_id", submission.id)
        .eq("status", "pending");
      toast({ title: "Submissão rejeitada." });
      await load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  // After each file action, recalculate submission status
  const checkSubmissionCompletion = async (submission: Submission) => {
    const { data: files } = await (supabase as any)
      .from("submission_files")
      .select("status")
      .eq("submission_id", submission.id);

    if (!files) return;
    const statuses = files.map(f => f.status);
    const allApproved = statuses.every(s => s === "approved");
    const anyRejected = statuses.some(s => s === "rejected");
    const anyPending = statuses.some(s => s === "pending");

    let newStatus = "partial";
    if (allApproved) newStatus = "approved";
    else if (!anyPending && anyRejected) newStatus = "rejected";

    if (!anyPending || allApproved) {
      await (supabase as any).from("content_submissions").update({ status: newStatus }).eq("id", submission.id);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="py-16 text-center">
        <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-bold">Nenhuma submissão pendente</p>
        <p className="text-xs text-muted-foreground font-light mt-1">As submissões dos professores aparecerão aqui.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {submissions.map(sub => {
        const isExpanded = expandedId === sub.id;
        return (
          <Card key={sub.id} className="overflow-hidden">
            <CardContent className="p-0">
              {/* Header */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
              >
                <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">
                    {sub.teacherName} — Passo {sub.stepNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {sub.languageName} · {sub.levelCode}
                    {sub.submitted_at && ` · ${new Date(sub.submitted_at).toLocaleDateString("pt-BR")}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="shrink-0 text-xs">
                    {sub.files.filter(f => f.status === "pending").length} pendente(s)
                  </Badge>
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t space-y-3 p-4">
                  {/* Per-file review */}
                  {sub.files.map(file => (
                    <div
                      key={file.id}
                      className={cn(
                        "rounded-lg border p-3 space-y-2",
                        file.status === "approved" && "border-lime/30 bg-lime/5",
                        file.status === "rejected" && "border-destructive/30 bg-destructive/5",
                        file.status === "pending" && "border-border bg-muted/20",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-bold">
                          {TYPE_ICONS[file.material_type]}
                          {TYPE_LABELS[file.material_type] || file.material_type}
                        </div>
                        {file.status === "approved" && <Badge variant="outline" className="text-xs text-lime-700 border-lime-300">Aprovado</Badge>}
                        {file.status === "rejected" && <Badge variant="destructive" className="text-xs">Rejeitado</Badge>}
                      </div>

                      {file.filename && (
                        <p className="text-xs text-muted-foreground">{file.filename}</p>
                      )}

                      {/* Preview link */}
                      {file.file_url && (
                        <a
                          href={file.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />Ver arquivo
                        </a>
                      )}

                      {/* Exercises preview */}
                      {file.material_type === "exercise" && file.exercises && file.exercises.length > 0 && (
                        <div className="space-y-1 bg-muted/30 rounded p-2">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            {file.exercises.length} exercício(s)
                          </p>
                          {file.exercises.slice(0, 3).map((ex: any, i: number) => (
                            <p key={i} className="text-xs text-foreground truncate">
                              {i + 1}. {ex.question}
                            </p>
                          ))}
                          {file.exercises.length > 3 && (
                            <p className="text-xs text-muted-foreground">+{file.exercises.length - 3} mais…</p>
                          )}
                        </div>
                      )}

                      {/* Reject comment from previous round */}
                      {file.status === "rejected" && file.comment && (
                        <p className="text-xs text-destructive">Motivo: {file.comment}</p>
                      )}

                      {/* Actions for pending files */}
                      {file.status === "pending" && (
                        <div className="space-y-2 pt-1">
                          <Textarea
                            placeholder="Comentário (obrigatório para rejeitar)..."
                            value={fileComments[file.id] || ""}
                            onChange={e => setFileComments(prev => ({ ...prev, [file.id]: e.target.value }))}
                            rows={2}
                            className="text-xs"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1 bg-lime text-steps-black hover:bg-lime/90 gap-1.5 text-xs"
                              onClick={() => approveFile(sub, file)}
                              disabled={processing === file.id}
                            >
                              {processing === file.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <CheckCircle2 className="h-3.5 w-3.5" />}
                              Aprovar
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="flex-1 gap-1.5 text-xs"
                              onClick={() => rejectFile(sub, file)}
                              disabled={processing === file.id}
                            >
                              {processing === file.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <XCircle className="h-3.5 w-3.5" />}
                              Rejeitar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Bulk actions */}
                  {sub.files.some(f => f.status === "pending") && (
                    <div className="pt-2 space-y-2 border-t">
                      <p className="text-xs font-bold text-muted-foreground">Ação em massa</p>
                      <Textarea
                        placeholder="Comentário geral (para rejeitar tudo)..."
                        value={fileComments[sub.id] || ""}
                        onChange={e => setFileComments(prev => ({ ...prev, [sub.id]: e.target.value }))}
                        rows={2}
                        className="text-xs"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 bg-lime text-steps-black hover:bg-lime/90 gap-1.5 text-xs"
                          onClick={() => approveAll(sub)}
                          disabled={!!processing}
                        >
                          {processing === sub.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Aprovar tudo
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="flex-1 gap-1.5 text-xs"
                          onClick={() => rejectAll(sub)}
                          disabled={!!processing}
                        >
                          {processing === sub.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <XCircle className="h-3.5 w-3.5" />}
                          Rejeitar tudo
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default AdminApprovalsTab;
