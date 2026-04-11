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

    const { data: student } = await supabase
      .from("students")
      .select("id, current_step_id, onboarding_completed, level_id, language_id")
      .eq("user_id", profile.id)
      .single();

    if (!student) { setLoading(false); return; }

    let level = null;
    let language = null;
    let currentStepNumber = 0;
    let meetLink: string | null = null;

    if (student.level_id) {
      const { data: l } = await supabase.from("levels").select("name, code, total_steps").eq("id", student.level_id).single();
      level = l;
    }
    if (student.language_id) {
      const { data: la } = await supabase.from("languages").select("name").eq("id", student.language_id).single();
      language = la;
    }
    if (student.current_step_id) {
      const { data: step } = await supabase.from("steps").select("number").eq("id", student.current_step_id).single();
      currentStepNumber = step?.number || 0;
    }

    // Get meet link from next scheduled class
    const { data: nextClass } = await supabase
      .from("classes")
      .select("meet_link")
      .eq("student_id", student.id)
      .eq("status", "scheduled")
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .single();

    meetLink = nextClass?.meet_link || null;

    // If no individual class, try group
    if (!meetLink) {
      const { data: gs } = await supabase.from("group_students").select("group_id").eq("student_id", student.id).limit(1).single();
      if (gs) {
        const { data: groupClass } = await supabase
          .from("classes")
          .select("meet_link")
          .eq("group_id", gs.group_id)
          .eq("status", "scheduled")
          .order("scheduled_at", { ascending: true })
          .limit(1)
          .single();
        meetLink = groupClass?.meet_link || null;
      }
    }

    setStudentData({
      id: student.id,
      current_step_id: student.current_step_id,
      onboarding_completed: student.onboarding_completed,
      level,
      language,
      currentStepNumber,
      meetLink,
    });

    if (student.onboarding_completed === false) {
      setShowOnboarding(true);
    }

    // Load materials for current step
    if (student.current_step_id) {
      const { data: mats } = await supabase
        .from("student_materials")
        .select("material_id, materials(id, title, type, delivery, file_url)")
        .eq("student_id", student.id);

      if (mats) {
        const flatMats = mats
          .map((m: any) => m.materials)
          .filter(Boolean) as MaterialItem[];
        setMaterials(flatMats);
      }
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
          <BookOpen className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-bold">Nenhum registro encontrado</h2>
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
            className="w-full bg-lime text-steps-black hover:bg-lime/90 font-bold h-14 text-base"
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
                  <Button variant="ghost" size="sm" className="text-primary text-xs" onClick={() => m.file_url && window.open(m.file_url, "_blank")}>
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
                  <Button variant="ghost" size="sm" className="text-primary text-xs" onClick={() => m.file_url && window.open(m.file_url, "_blank")}>
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
              <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
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
