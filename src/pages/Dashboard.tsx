import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Video, BookOpen, Headphones, FileText, PenLine, ExternalLink } from "lucide-react";
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

    // Materiais liberados do aluno (todos, sem filtrar por step)
    const { data: mats } = await supabase
      .from("student_materials")
      .select("material_id, materials(id, title, type, delivery, file_url)")
      .eq("student_id", s.id);

    if (mats) {
      const flatMats = mats
        .map((m: any) => m.materials)
        .filter(Boolean) as MaterialItem[];
      setMaterials(flatMats);
    }

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
  const afterClass = materials.filter(m => m.delivery === "after");

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

        {/* Materials */}
        {beforeClass.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide">Antes da aula</h3>
            {beforeClass.map(m => (
              <Card key={m.id} className="cursor-pointer hover:border-primary/30 transition-colors">
                <CardContent className="flex items-center gap-3 py-3 px-4">
                  <div className="text-primary">{typeIcons[m.type] || <FileText className="h-5 w-5" />}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{m.title}</p>
                    <p className="text-xs text-muted-foreground font-light">{typeLabels[m.type] || m.type}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-primary text-xs"
                    onClick={() => m.file_url && window.open(m.file_url, "_blank")}
                  >
                    Abrir
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {afterClass.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide">Após a aula</h3>
            {afterClass.map(m => (
              <Card key={m.id} className="cursor-pointer hover:border-primary/30 transition-colors">
                <CardContent className="flex items-center gap-3 py-3 px-4">
                  <div className="text-primary">{typeIcons[m.type] || <FileText className="h-5 w-5" />}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{m.title}</p>
                    <p className="text-xs text-muted-foreground font-light">{typeLabels[m.type] || m.type}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-primary text-xs"
                    onClick={() => m.file_url && window.open(m.file_url, "_blank")}
                  >
                    Abrir
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {materials.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center">
              <img src="/steppie/steppie-comendo.svg" alt="" aria-hidden="true" className="w-20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum material disponível ainda.</p>
              <p className="text-xs text-muted-foreground font-light mt-1">Seus materiais aparecerão aqui quando forem liberados.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </StudentLayout>
  );
};

export default Dashboard;
