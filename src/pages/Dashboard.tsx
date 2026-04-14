import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Video, BookOpen, Headphones, FileText, PenLine, ExternalLink, GraduationCap, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Navigate } from "react-router-dom";

interface StudentData {
  id: string;
  current_step_id: string | null;
  onboarding_completed: boolean | null;
  level: { name: string; code: string; total_steps: number } | null;
  language: { name: string } | null;
  currentStepNumber: number;
  meetLink: string | null;
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
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

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
        id, current_step_id, onboarding_completed,
        levels!students_level_id_fkey(name, code, total_steps),
        languages!students_language_id_fkey(name),
        steps!students_current_step_id_fkey(number)
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
      meetLink,
    });

    if (s.onboarding_completed === false) setShowOnboarding(true);

    // Materiais do step atual + materiais pessoais
    const [stepRes, personalRes] = await Promise.all([
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

    setLoading(false);
  };

  const completeOnboarding = async () => {
    if (!studentData) return;
    await supabase.from("students").update({ onboarding_completed: true }).eq("id", studentData.id);
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
          <img src="/steppie/steppie-apontando.svg" alt="" aria-hidden="true" className="w-24 mb-2" />
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
      <Dialog open={showOnboarding} onOpenChange={setShowOnboarding}>
        <DialogContent className="max-w-md mx-auto h-[90vh] flex flex-col items-center justify-center gap-6 p-6">
          <h2 className="text-2xl font-bold text-primary text-center">Bem-vindo à steps academy! 🎉</h2>
          <div className="w-full aspect-video bg-muted rounded-lg flex items-center justify-center">
            <Video className="h-12 w-12 text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Vídeo de boas-vindas</span>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            Aqui você encontra seus materiais, acompanha seu progresso e acessa suas aulas ao vivo.
          </p>
          <Button onClick={completeOnboarding} className="w-full bg-lime text-steps-black hover:bg-lime/90 font-bold">
            Começar minha jornada
          </Button>
        </DialogContent>
      </Dialog>

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

        {/* Progress */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold">Seu progresso</span>
              <span className="text-xs text-muted-foreground">
                Passo {studentData.currentStepNumber} de {totalSteps}
              </span>
            </div>
            <Progress value={progressPercent} className="h-3" />
          </CardContent>
        </Card>

        {/* Join class */}
        {studentData.meetLink && (
          <Button
            className="w-full font-bold h-14 text-base"
            style={{ background: 'var(--theme-accent)', color: 'var(--theme-text-on-accent)' }}
            onClick={() => window.open(studentData.meetLink!, "_blank")}
          >
            <ExternalLink className="h-5 w-5 mr-2" />
            Entrar na aula
          </Button>
        )}

        {/* Aula atual */}
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
                  <p className="text-sm font-bold">Aula atual</p>
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
                {beforeClass.slice(0, 3).map(m => (
                  <div key={m.id} className="flex items-center gap-2 text-xs py-1">
                    <div className="text-primary shrink-0">{typeIcons[m.type] || <FileText className="h-3.5 w-3.5" />}</div>
                    <span className="truncate text-foreground">{m.title}</span>
                  </div>
                ))}
                {beforeClass.length > 3 && (
                  <p className="text-xs text-muted-foreground font-light">+{beforeClass.length - 3} mais…</p>
                )}
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
      </div>
    </StudentLayout>
  );
};

export default Dashboard;
