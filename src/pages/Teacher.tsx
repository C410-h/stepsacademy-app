import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import TeacherLayout from "@/components/TeacherLayout";
import TeacherContentTab from "@/components/TeacherContentTab";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, ChevronDown, ChevronUp, BookOpen, Users, Mic, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecordingRow {
  id: string;
  student_id: string;
  step_id: string | null;
  audio_url: string;
  status: string;
  recorded_at: string;
  studentName: string;
  stepNumber: number | null;
}

interface StudentCard {
  studentId: string;
  userId: string;
  name: string;
  languageName: string;
  levelName: string;
  levelCode: string;
  currentStepNumber: number;
  currentStepId: string | null;
  status: string;
  recentClassId: string | null;
  recentNotes: string | null;
}

const statusLabel: Record<string, string> = {
  active: "Ativo",
  paused: "Pausado",
  completed: "Concluído",
};

const statusVariant: Record<string, "default" | "secondary" | "outline"> = {
  active: "default",
  paused: "secondary",
  completed: "outline",
};

const Teacher = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<string | null>(null);
  const [expandedMaterials, setExpandedMaterials] = useState<Set<string>>(new Set());
  const [studentMaterials, setStudentMaterials] = useState<Record<string, { step: any[]; personal: any[] }>>({});
  const [recordings, setRecordings] = useState<RecordingRow[]>([]);
  const [reviewScore, setReviewScore] = useState<Record<string, number>>({});
  const [reviewFeedback, setReviewFeedback] = useState<Record<string, string>>({});
  const [submittingReview, setSubmittingReview] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    loadData();
  }, [profile]);

  const loadData = async () => {
    if (!profile) return;
    setLoading(true);

    // Buscar teacher record
    const { data: teacher } = await supabase
      .from("teachers")
      .select("id")
      .eq("user_id", profile.id)
      .maybeSingle();

    if (!teacher) {
      setLoading(false);
      return;
    }

    setTeacherId(teacher.id);

    // Buscar alunos vinculados ao professor
    const { data: rows } = await supabase
      .from("teacher_students")
      .select(`
        student_id,
        students!inner(
          id,
          user_id,
          current_step_id,
          status,
          level_id,
          levels!students_level_id_fkey(name, code, total_steps),
          languages!students_language_id_fkey(name),
          steps!students_current_step_id_fkey(id, number)
        )
      `)
      .eq("teacher_id", teacher.id);

    if (!rows) { setLoading(false); return; }

    // Para cada aluno, buscar profile e última aula
    const studentCards: StudentCard[] = await Promise.all(
      rows.map(async (row: any) => {
        const s = row.students;

        const { data: prof } = await supabase
          .from("profiles")
          .select("name")
          .eq("id", s.user_id)
          .maybeSingle();

        const { data: lastClass } = await supabase
          .from("classes")
          .select("id, teacher_notes")
          .eq("student_id", s.id)
          .eq("teacher_id", teacher.id)
          .order("scheduled_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        return {
          studentId: s.id,
          userId: s.user_id,
          name: prof?.name || "Aluno",
          languageName: s.languages?.name || "—",
          levelName: s.levels?.name || "—",
          levelCode: s.levels?.code || "",
          currentStepNumber: s.steps?.number || 0,
          currentStepId: s.current_step_id || null,
          status: s.status || "active",
          recentClassId: lastClass?.id || null,
          recentNotes: lastClass?.teacher_notes || null,
        };
      })
    );

    setStudents(studentCards);

    // Pre-preencher notas com os valores atuais
    const initialNotes: Record<string, string> = {};
    studentCards.forEach(s => {
      initialNotes[s.studentId] = s.recentNotes || "";
    });
    setNotes(initialNotes);

    // Fetch pending recordings for this teacher's students
    const studentIds = studentCards.map(s => s.studentId);
    if (studentIds.length > 0) {
      const { data: recs } = await (supabase as any)
        .from("speaking_recordings")
        .select("id, student_id, step_id, audio_url, status, recorded_at")
        .in("student_id", studentIds)
        .eq("status", "pending")
        .order("recorded_at", { ascending: false });

      const enriched: RecordingRow[] = await Promise.all(
        (recs || []).map(async (r: any) => {
          const sc = studentCards.find(s => s.studentId === r.student_id);
          let stepNumber: number | null = null;
          if (r.step_id) {
            const { data: step } = await supabase
              .from("steps")
              .select("number")
              .eq("id", r.step_id)
              .maybeSingle();
            stepNumber = step?.number ?? null;
          }
          return { ...r, studentName: sc?.name || "Aluno", stepNumber };
        })
      );
      setRecordings(enriched);
    }

    setLoading(false);
  };

  const submitReview = async (recordingId: string) => {
    if (!teacherId) return;
    setSubmittingReview(recordingId);
    try {
      await (supabase as any)
        .from("speaking_recordings")
        .update({
          status: "reviewed",
          teacher_feedback: reviewFeedback[recordingId] || null,
          teacher_score: reviewScore[recordingId] || null,
          reviewed_by: teacherId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", recordingId);
      toast({ title: "Avaliação enviada com sucesso!" });
      setRecordings(prev => prev.filter(r => r.id !== recordingId));
    } catch {
      toast({ title: "Erro ao enviar avaliação.", variant: "destructive" });
    } finally {
      setSubmittingReview(null);
    }
  };

  const markClassDone = async (student: StudentCard) => {
    if (!teacherId || !student.currentStepId) {
      toast({ title: "Aluno sem passo atual definido.", variant: "destructive" });
      return;
    }

    setCompleting(student.studentId);

    try {
      // 1. Marcar student_progress do step atual como done
      await supabase
        .from("student_progress")
        .update({ status: "done", done_at: new Date().toISOString() })
        .eq("student_id", student.studentId)
        .eq("step_id", student.currentStepId);

      // 2. Buscar step atual para saber o número e level_id
      const { data: currentStep } = await supabase
        .from("steps")
        .select("id, number, units!inner(level_id)")
        .eq("id", student.currentStepId)
        .maybeSingle();

      const levelId = (currentStep as any)?.units?.level_id;

      // 3. Buscar próximo step (mesmo nível, número seguinte)
      let nextStepId: string | null = null;
      if (levelId && currentStep) {
        const { data: nextStep } = await supabase
          .from("steps")
          .select("id, number, units!inner(level_id)")
          .eq("units.level_id", levelId)
          .gt("number", currentStep.number)
          .order("number", { ascending: true })
          .limit(1)
          .maybeSingle();

        nextStepId = nextStep?.id || null;
      }

      if (nextStepId) {
        // 4a. Upsert student_progress do próximo step como available
        await supabase
          .from("student_progress")
          .upsert(
            {
              student_id: student.studentId,
              step_id: nextStepId,
              status: "available",
              unlocked_at: new Date().toISOString(),
            },
            { onConflict: "student_id,step_id" }
          );

        // 4b. Atualizar current_step_id
        await supabase
          .from("students")
          .update({ current_step_id: nextStepId })
          .eq("id", student.studentId);

      } else {
        // 5. Sem próximo step: aluno concluiu o nível
        await supabase
          .from("students")
          .update({ status: "completed" })
          .eq("id", student.studentId);
      }

      // 6. Registrar a aula concluída
      await supabase.from("classes").insert({
        student_id: student.studentId,
        teacher_id: teacherId,
        step_id: student.currentStepId,
        status: "completed",
        scheduled_at: new Date().toISOString(),
      });

      // 7. Dar XP ao aluno pela aula (+30 XP +15 coins)
      const { data: gami } = await supabase
        .from("student_gamification")
        .select("xp_total, coins")
        .eq("student_id", student.studentId)
        .maybeSingle();

      if (gami) {
        await supabase
          .from("student_gamification")
          .update({
            xp_total: (gami.xp_total ?? 0) + 30,
            coins: (gami.coins ?? 0) + 15,
            updated_at: new Date().toISOString(),
          })
          .eq("student_id", student.studentId);

        await supabase.from("xp_events").insert({
          student_id: student.studentId,
          event_type: "class_attended",
          xp: 30,
          coins: 15,
          description: `Aula concluída — Passo ${student.currentStepNumber}`,
        });
      }

      toast({
        title: nextStepId
          ? `Aula concluída! Passo ${student.currentStepNumber + 1} desbloqueado.`
          : "Aula concluída! Aluno finalizou o nível. 🎉",
      });

      await loadData();
    } catch (err) {
      toast({ title: "Erro ao concluir aula.", variant: "destructive" });
    } finally {
      setCompleting(null);
    }
  };

  const toggleMaterials = async (student: StudentCard) => {
    const sid = student.studentId;
    setExpandedMaterials(prev => {
      const next = new Set(prev);
      if (next.has(sid)) { next.delete(sid); return next; }
      next.add(sid);
      return next;
    });
    // Fetch on first open
    if (!studentMaterials[sid]) {
      const [stepRes, personalRes] = await Promise.all([
        student.currentStepId
          ? supabase.from("materials").select("id, title, type, delivery").eq("step_id", student.currentStepId).eq("active", true)
          : Promise.resolve({ data: [] }),
        supabase.from("student_materials").select("material_id, materials(id, title, type, delivery)").eq("student_id", sid).eq("is_personal", true),
      ]);
      const stepMats = (stepRes.data || []) as any[];
      const personalMats: any[] = ((personalRes.data || []) as any[]).map((sm: any) => sm.materials).filter(Boolean);
      setStudentMaterials(prev => ({ ...prev, [sid]: { step: stepMats, personal: personalMats } }));
    }
  };

  const toggleNotes = (studentId: string) => {
    setExpandedNotes(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const saveNotes = async (student: StudentCard) => {
    if (!teacherId) return;
    setSavingNotes(student.studentId);

    // Buscar última aula deste aluno com este professor
    const { data: lastClass } = await supabase
      .from("classes")
      .select("id")
      .eq("student_id", student.studentId)
      .eq("teacher_id", teacherId)
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastClass) {
      await supabase
        .from("classes")
        .update({ teacher_notes: notes[student.studentId] || null })
        .eq("id", lastClass.id);
    }

    setSavingNotes(null);
    toast({ title: "Observações salvas!" });
  };

  if (loading) {
    return (
      <TeacherLayout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </TeacherLayout>
    );
  }

  if (!teacherId) {
    return (
      <TeacherLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <Users className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-bold">Perfil de professor não encontrado</h2>
          <p className="text-sm text-muted-foreground font-light">
            Entre em contato com a administração para configurar sua conta.
          </p>
        </div>
      </TeacherLayout>
    );
  }

  return (
    <TeacherLayout>
      <div className="space-y-4">
        <Tabs defaultValue="students">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="students" className="gap-1.5">
              <Users className="h-4 w-4" />Meus Alunos
            </TabsTrigger>
            <TabsTrigger value="content" className="gap-1.5">
              <FileText className="h-4 w-4" />Conteúdo
            </TabsTrigger>
          </TabsList>

          {/* ── Tab: Alunos ──────────────────────────────────────────────── */}
          <TabsContent value="students" className="space-y-6 mt-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Meus Alunos</h1>
          <p className="text-sm text-muted-foreground font-light mt-1">
            {students.length} {students.length === 1 ? "aluno vinculado" : "alunos vinculados"}
          </p>
        </div>

        {/* Empty state */}
        {students.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-bold">Nenhum aluno vinculado ainda.</p>
              <p className="text-xs text-muted-foreground font-light mt-1">
                Peça ao administrador para vincular alunos à sua conta.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Student cards — 2-col grid on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {students.map(student => {
          const isCompleting = completing === student.studentId;
          const notesOpen = expandedNotes.has(student.studentId);
          const isSaving = savingNotes === student.studentId;

          return (
            <Card key={student.studentId} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{student.name}</CardTitle>
                    <p className="text-xs text-muted-foreground font-light mt-0.5">
                      {student.languageName} · {student.levelName} · {student.levelCode}
                    </p>
                    <p className="text-xs text-muted-foreground font-light">
                      Passo atual: <span className="font-bold text-foreground">{student.currentStepNumber || "—"}</span>
                    </p>
                  </div>
                  <Badge variant={statusVariant[student.status] ?? "outline"}>
                    {statusLabel[student.status] ?? student.status}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 pt-0">
                {/* Marcar aula concluída */}
                <Button
                  className="w-full bg-lime text-steps-black hover:bg-lime/90 font-bold"
                  onClick={() => markClassDone(student)}
                  disabled={isCompleting || student.status === "completed" || !student.currentStepId}
                >
                  {isCompleting ? (
                    "Processando..."
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Marcar aula concluída
                    </>
                  )}
                </Button>

                {/* Toggle materiais */}
                <button
                  onClick={() => toggleMaterials(student)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                >
                  {expandedMaterials.has(student.studentId) ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  Materiais do passo atual
                </button>

                {expandedMaterials.has(student.studentId) && (
                  <div className="space-y-1.5">
                    {!studentMaterials[student.studentId] ? (
                      <p className="text-xs text-muted-foreground">Carregando…</p>
                    ) : (
                      <>
                        {studentMaterials[student.studentId].step.length === 0 && studentMaterials[student.studentId].personal.length === 0 ? (
                          <p className="text-xs text-muted-foreground font-light">Nenhum material neste passo.</p>
                        ) : (
                          <>
                            {studentMaterials[student.studentId].step.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Da aula</p>
                                {studentMaterials[student.studentId].step.map((m: any) => (
                                  <div key={m.id} className="flex items-center gap-2 p-1.5 rounded bg-muted text-xs">
                                    <BookOpen className="h-3 w-3 shrink-0 text-muted-foreground" />
                                    <span className="truncate">{m.title}</span>
                                    <span className="ml-auto text-muted-foreground shrink-0">{m.delivery}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {studentMaterials[student.studentId].personal.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Pessoais</p>
                                {studentMaterials[student.studentId].personal.map((m: any) => (
                                  <div key={m.id} className="flex items-center gap-2 p-1.5 rounded bg-muted text-xs">
                                    <BookOpen className="h-3 w-3 shrink-0 text-primary" />
                                    <span className="truncate">{m.title}</span>
                                    <span className="ml-auto text-muted-foreground shrink-0">{m.delivery}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Toggle observações */}
                <button
                  onClick={() => toggleNotes(student.studentId)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                >
                  {notesOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  Observações do professor
                </button>

                {notesOpen && (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Anotações sobre o aluno, dificuldades, pontos de atenção..."
                      className="text-sm resize-none font-light"
                      rows={3}
                      value={notes[student.studentId] || ""}
                      onChange={e =>
                        setNotes(prev => ({ ...prev, [student.studentId]: e.target.value }))
                      }
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs"
                      onClick={() => saveNotes(student)}
                      disabled={isSaving}
                    >
                      {isSaving ? "Salvando..." : "Salvar observações"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        </div>{/* end student cards grid */}

        {/* ── Gravações pendentes ── */}
        {recordings.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Mic className="h-5 w-5 text-primary" /> Gravações pendentes
              <Badge variant="secondary">{recordings.length}</Badge>
            </h2>
            {recordings.map(rec => (
              <Card key={rec.id}>
                <CardContent className="pt-5 pb-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-sm">{rec.studentName}</p>
                      <p className="text-xs text-muted-foreground font-light">
                        {rec.stepNumber ? `Passo ${rec.stepNumber}` : "Passo —"} · {new Date(rec.recorded_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <Badge variant="secondary">Pendente</Badge>
                  </div>
                  <audio controls src={rec.audio_url} className="w-full h-10" />
                  {/* Star rating */}
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-light">Nota (1–5 estrelas)</p>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(s => (
                        <button
                          key={s}
                          onClick={() => setReviewScore(prev => ({ ...prev, [rec.id]: s }))}
                          className={cn(
                            "text-xl transition-transform hover:scale-110",
                            (reviewScore[rec.id] || 0) >= s ? "text-yellow-400" : "text-muted-foreground/30"
                          )}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </div>
                  <Textarea
                    placeholder="Feedback para o aluno..."
                    value={reviewFeedback[rec.id] || ""}
                    onChange={e => setReviewFeedback(prev => ({ ...prev, [rec.id]: e.target.value }))}
                    rows={3}
                    className="text-sm"
                  />
                  <Button
                    className="w-full bg-primary text-primary-foreground font-bold"
                    disabled={!reviewScore[rec.id] || submittingReview === rec.id}
                    onClick={() => submitReview(rec.id)}
                  >
                    {submittingReview === rec.id ? "Enviando..." : "Enviar avaliação"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
          </TabsContent>

          {/* ── Tab: Conteúdo ─────────────────────────────────────────────── */}
          <TabsContent value="content" className="mt-4">
            {teacherId ? (
              <TeacherContentTab teacherId={teacherId} />
            ) : (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Carregando...
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </TeacherLayout>
  );
};

export default Teacher;
