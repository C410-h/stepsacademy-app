import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BookOpen, Headphones, FileText, PenLine, ExternalLink, GraduationCap, ChevronRight, AlertTriangle, Trophy, HelpCircle, History } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Navigate } from "react-router-dom";
import UpcomingClasses from "@/components/UpcomingClasses";
import RescheduleSheet, { type RescheduleSessionData } from "@/components/RescheduleSheet";

interface StudentData {
  id: string;
  current_step_id: string | null;
  onboarding_completed: boolean | null;
  level: { name: string; code: string; total_steps: number } | null;
  language: { name: string } | null;
  currentStepNumber: number;
  currentStepTitle: string | null;
  meetLink: string | null;
}

interface LastStep {
  id: string;
  number: number;
  title: string | null;
}

interface RankInfo {
  position: number;
  total: number;
  xp: number;
  languageName: string;
}

interface MaterialItem {
  id: string;
  title: string;
  type: string;
  delivery: string;
  file_url: string | null;
}

const typeIcons: Record<string, React.ReactNode> = {
  vocab: <BookOpen className="h-5 w-5" />,
  audio: <Headphones className="h-5 w-5" />,
  grammar: <FileText className="h-5 w-5" />,
  exercise: <PenLine className="h-5 w-5" />,
  slide: <FileText className="h-5 w-5" />,
};

const typeLabels: Record<string, string> = {
  vocab: "Vocabulário",
  audio: "Áudio",
  grammar: "Gramática",
  exercise: "Exercício",
  slide: "Slide",
};

const Dashboard = () => {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [lastStep, setLastStep] = useState<LastStep | null>(null);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [missedSessions, setMissedSessions] = useState<RescheduleSessionData[]>([]);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleSession, setRescheduleSession] = useState<RescheduleSessionData | null>(null);
  const [rankInfo, setRankInfo] = useState<RankInfo | null>(null);

  useEffect(() => {
    if (!profile) return;
    loadStudentData();
  }, [profile]);

  const loadStudentData = async () => {
    if (!profile) return;

    // Query única com joins — substitui 4 queries sequenciais
    const { data: student } = await supabase
      .from("students")
      .select(`
        id, current_step_id, onboarding_completed, language_id,
        levels!students_level_id_fkey(name, code, total_steps),
        languages!students_language_id_fkey(name),
        steps!students_current_step_id_fkey(number, title)
      `)
      .eq("user_id", profile.id)
      .single();

    if (!student) { setLoading(false); return; }

    const s = student as any;

    // Meet link: tenta aula individual, depois grupo (2 queries, inevitável)
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
      const { data: gs } = await supabase
        .from("group_students")
        .select("group_id")
        .eq("student_id", s.id)
        .limit(1)
        .maybeSingle();

      if (gs) {
        const { data: groupClass } = await supabase
          .from("classes")
          .select("meet_link")
          .eq("group_id", gs.group_id)
          .eq("status", "scheduled")
          .order("scheduled_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        meetLink = groupClass?.meet_link || null;
      }
    }

    setStudentData({
      id: s.id,
      current_step_id: s.current_step_id,
      onboarding_completed: s.onboarding_completed,
      level: s.levels || null,
      language: s.languages || null,
      currentStepNumber: s.steps?.number || 0,
      currentStepTitle: s.steps?.title || null,
      meetLink,
    });

    // Última aula concluída (para o botão "Última Aula")
    if (s.id) {
      const { data: doneRows } = await supabase
        .from("student_progress")
        .select("step_id")
        .eq("student_id", s.id)
        .eq("status", "done");
      const doneIds = (doneRows || []).map((r: any) => r.step_id).filter(Boolean);
      if (doneIds.length > 0) {
        const { data: lastStepData } = await supabase
          .from("steps")
          .select("id, number, title")
          .in("id", doneIds)
          .order("number", { ascending: false })
          .limit(1)
          .maybeSingle();
        setLastStep(lastStepData ? { id: lastStepData.id, number: (lastStepData as any).number, title: (lastStepData as any).title ?? null } : null);
      } else {
        setLastStep(null);
      }
    }

    if (s.onboarding_completed === false) setShowOnboarding(true);

    // Aulas com falta pendente (missed_pending)
    const { data: missedRows } = await (supabase as any)
      .from("class_sessions")
      .select("id, google_event_id, scheduled_at, ends_at, teacher_id")
      .eq("student_id", s.id)
      .eq("status", "missed_pending")
      .order("scheduled_at", { ascending: false })
      .limit(5);
    setMissedSessions(((missedRows || []) as any[]).map((r: any) => ({ ...r, scheduled_ends_at: r.ends_at })) as RescheduleSessionData[]);

    // Materiais do step atual + materiais pessoais + co-alunos do mesmo idioma
    const [stepRes, personalRes, coStudentsRes] = await Promise.all([
      s.current_step_id
        ? supabase
            .from("materials")
            .select("id, title, type, delivery, file_url")
            .eq("step_id", s.current_step_id)
            .eq("active", true)
        : Promise.resolve({ data: [] }),
      supabase
        .from("student_materials")
        .select("material_id, materials(id, title, type, delivery, file_url)")
        .eq("student_id", s.id)
        .eq("is_personal", true),
      s.language_id
        ? supabase.from("students").select("id").eq("language_id", s.language_id)
        : Promise.resolve({ data: [] }),
    ]);

    const stepMats = (stepRes.data || []) as MaterialItem[];
    const personalMats: MaterialItem[] = ((personalRes.data || []) as any[])
      .map((sm: any) => sm.materials)
      .filter(Boolean);

    const seen = new Set<string>();
    const combined: MaterialItem[] = [];
    for (const m of [...stepMats, ...personalMats]) {
      if (!seen.has(m.id)) { seen.add(m.id); combined.push(m); }
    }
    setMaterials(combined);

    // Posição no ranking do idioma
    const coIds = ((coStudentsRes.data || []) as any[]).map((x: any) => x.id);
    if (coIds.length > 0) {
      const { data: rankData } = await (supabase as any)
        .from("student_gamification")
        .select("student_id, xp_total")
        .in("student_id", coIds)
        .order("xp_total", { ascending: false });

      if (rankData && (rankData as any[]).length > 0) {
        const pos = (rankData as any[]).findIndex((r: any) => r.student_id === s.id) + 1;
        const myXp = (rankData as any[]).find((r: any) => r.student_id === s.id)?.xp_total ?? 0;
        if (pos > 0) {
          setRankInfo({
            position: pos,
            total: (rankData as any[]).length,
            xp: myXp,
            languageName: s.languages?.name || "seu idioma",
          });
        }
      }
    }

    setLoading(false);
  };

  const completeOnboarding = async () => {
    if (!studentData) return;
    await supabase.from("students").update({ onboarding_completed: true }).eq("id", studentData.id);
    // Notify admin of first login
    await (supabase as any).from("admin_notifications").insert({
      type: "first_login",
      user_id: profile?.id,
      user_name: profile?.name ?? null,
      user_email: user?.email ?? null,
    });

    // Send push notification to admin (best-effort)
    supabase.functions.invoke("notify-admin-push", {
      body: {
        title: "Primeiro acesso 🎉",
        body: `${profile?.name ?? "Novo aluno"} acabou de fazer o primeiro login.`,
        url: "/admin",
      },
    }).catch(() => {/* non-blocking */});

    setShowOnboarding(false);
  };

  if (profile?.role === "admin") return <Navigate to="/admin" replace />;

  if (loading) {
    return (
      <StudentLayout>
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </StudentLayout>
    );
  }

  if (!studentData) {
    return (
      <StudentLayout>
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
          <img src="/steppie/steppie-apontando.webp" alt="" aria-hidden="true" className="w-24 mb-2" />
          <h2 className="text-lg font-bold">Sua jornada começa aqui!</h2>
          <p className="text-sm text-muted-foreground">Entre em contato com a administração para configurar sua conta.</p>
        </div>
      </StudentLayout>
    );
  }

  const totalSteps = studentData.level?.total_steps || 40;
  const progressPercent = (studentData.currentStepNumber / totalSteps) * 100;
  const beforeClass = materials.filter(m => m.delivery === "before");

  return (
    <StudentLayout>
      {/* Onboarding Modal */}
      <Dialog open={showOnboarding}>
        <DialogContent
          className="max-w-md mx-auto h-[90vh] flex flex-col items-center justify-center gap-6 p-6"
          onInteractOutside={e => e.preventDefault()}
          onEscapeKeyDown={e => e.preventDefault()}
        >
          <h2 className="text-2xl font-bold text-primary text-center">Bem-vindo à steps academy! 🎉</h2>
          <p className="text-center text-sm text-muted-foreground">
            Aqui você encontra seus materiais, acompanha seu progresso e acessa suas aulas ao vivo.
          </p>
          {/* Help center link — video will be added once recorded */}
          <a
            href="/ajuda"
            className="w-full flex items-center gap-4 rounded-xl border bg-muted/50 hover:bg-muted transition-colors p-4 text-left"
          >
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <HelpCircle className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">Central de ajuda</p>
              <p className="text-xs text-muted-foreground mt-0.5">Veja nossos guias e tutoriais para aproveitar ao máximo a plataforma.</p>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
          </a>
          <Button onClick={completeOnboarding} className="w-full bg-lime text-steps-black hover:bg-lime/90 font-bold">
            Começar minha jornada
          </Button>
        </DialogContent>
      </Dialog>

      {/* Missed sessions banner */}
      {missedSessions.length > 0 && (
        <Card className="border-amber-400/60 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                {missedSessions.length === 1
                  ? "Você tem 1 aula com falta pendente."
                  : `Você tem ${missedSessions.length} aulas com falta pendente.`}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
              onClick={() => {
                setRescheduleSession(missedSessions[0]);
                setRescheduleOpen(true);
              }}
            >
              Remarcar
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">

        {/* ── Column 1: Welcome + Progress + Join ── */}
        <div className="space-y-4">
          {/* Welcome */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Olá, {profile?.name?.split(" ")[0]} 👋</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground font-light">
                {studentData.language?.name || "Idioma"} · {studentData.level?.name || "Nível"} · {studentData.level?.code || ""}
              </p>
            </CardContent>
          </Card>

          {/* Ranking card */}
          {rankInfo && (
            <Card
              className="cursor-pointer transition-colors hover:border-primary/30"
              style={{ borderColor: "color-mix(in srgb, var(--theme-accent) 35%, transparent)" }}
              onClick={() => navigate("/recompensas?tab=ranking")}
            >
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "color-mix(in srgb, var(--theme-accent) 15%, transparent)" }}
                >
                  <Trophy className="h-5 w-5" style={{ color: "var(--theme-accent)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold">
                    Você está em{" "}
                    <span style={{ color: "var(--theme-accent)" }}>{rankInfo.position}º lugar</span>
                  </p>
                  <p className="text-xs text-muted-foreground font-light">
                    entre {rankInfo.total} alunos de {rankInfo.languageName}
                  </p>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <p className="text-sm font-bold" style={{ color: "var(--theme-accent)" }}>
                    {rankInfo.xp.toLocaleString("pt-BR")} XP
                  </p>
                  <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Progress */}
          <Card
            className="cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => navigate("/aula?tab=all")}
          >
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p className="text-sm text-muted-foreground font-light">
                    {studentData.language?.name} · {studentData.level?.name} · {studentData.level?.code}
                  </p>
                  <p className="text-2xl font-bold text-primary mt-0.5">
                    {Math.round(progressPercent)}% concluído
                  </p>
                  <p className="text-xs text-muted-foreground font-light mt-0.5">
                    {studentData.currentStepNumber} de {totalSteps} aulas
                  </p>
                </div>
                <img
                  src="/steppie/steppie-orgulhoso.webp"
                  alt=""
                  aria-hidden="true"
                  className="w-14 shrink-0 self-end"
                />
              </div>
              <Progress value={progressPercent} className="h-2.5 mt-3" />
            </CardContent>
          </Card>


          {/* Join class */}
          {studentData.meetLink && (
            <Button
              className="w-full font-bold h-14 text-base"
              style={{ background: "var(--theme-accent)", color: "var(--theme-text-on-accent)" }}
              onClick={() => window.open(studentData.meetLink!, "_blank")}
            >
              <ExternalLink className="h-5 w-5 mr-2" />
              Entrar na aula
            </Button>
          )}

          {/* Próximas aulas via Google Calendar */}
          <UpcomingClasses />
        </div>

        {/* ── Column 2: Próxima aula + Última aula ── */}
        <div className="mt-4 lg:mt-0 flex flex-col gap-3">
          <Card
            className="cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => navigate("/aula")}
          >
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <GraduationCap className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">Próxima aula</p>
                    <p className="text-xs text-muted-foreground font-light">
                      Passo {studentData.currentStepNumber}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>

              {beforeClass.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Antes da aula</p>
                  {beforeClass.map(m => (
                    <div key={m.id} className="flex items-center gap-2 text-xs py-1">
                      <div className="text-primary shrink-0">{typeIcons[m.type] || <FileText className="h-3.5 w-3.5" />}</div>
                      <span className="truncate text-foreground">{m.title}</span>
                    </div>
                  ))}
                </div>
              )}

              {materials.filter(m => m.delivery === "during").length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Durante a aula</p>
                  {materials.filter(m => m.delivery === "during").map(m => (
                    <div key={m.id} className="flex items-center gap-2 text-xs py-1">
                      <div className="text-primary shrink-0">{typeIcons[m.type] || <FileText className="h-3.5 w-3.5" />}</div>
                      <span className="truncate text-foreground">{m.title}</span>
                    </div>
                  ))}
                </div>
              )}

              <Button
                size="sm"
                className="w-full text-xs font-bold gap-1.5"
                style={{ background: "var(--theme-accent)", color: "var(--theme-text-on-accent)" }}
                onClick={e => { e.stopPropagation(); navigate("/aula"); }}
              >
                <GraduationCap className="h-3.5 w-3.5" />
                Ver aula completa
              </Button>
            </CardContent>
          </Card>

          {/* Última aula concluída */}
          {lastStep && (
            <Card
              className="cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => navigate(`/aula?step_id=${lastStep.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <History className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">Última aula</p>
                      <p className="text-xs text-muted-foreground font-light">
                        Passo {lastStep.number}{lastStep.title ? ` · ${lastStep.title}` : ""}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

      </div>
      <RescheduleSheet
        open={rescheduleOpen}
        onOpenChange={(open) => {
          setRescheduleOpen(open);
          if (!open) setRescheduleSession(null);
        }}
        session={rescheduleSession}
        onSuccess={loadStudentData}
      />
    </StudentLayout>
  );
};

export default Dashboard;
