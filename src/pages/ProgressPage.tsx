import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepProgress {
  number: number;
  status: "locked" | "available" | "done";
}

const ProgressPage = () => {
  const { profile } = useAuth();
  const [steps, setSteps] = useState<StepProgress[]>([]);
  const [levelName, setLevelName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    loadProgress();
  }, [profile]);

  const loadProgress = async () => {
    if (!profile) return;
    const { data: student } = await supabase
      .from("students")
      .select("id, level_id, current_step_id")
      .eq("user_id", profile.id)
      .single();

    if (!student || !student.level_id) { setLoading(false); return; }

    const { data: level } = await supabase.from("levels").select("name, code, total_steps").eq("id", student.level_id).single();
    if (level) setLevelName(`${level.name} · ${level.code}`);

    const totalSteps = level?.total_steps || 40;

    // Get progress records
    const { data: progressRecords } = await supabase
      .from("student_progress")
      .select("step_id, status, steps(number)")
      .eq("student_id", student.id);

    const progressMap: Record<number, string> = {};
    if (progressRecords) {
      progressRecords.forEach((p: any) => {
        if (p.steps?.number) {
          progressMap[p.steps.number] = p.status;
        }
      });
    }

    const stepsArray: StepProgress[] = [];
    for (let i = 1; i <= totalSteps; i++) {
      const status = progressMap[i];
      if (status === "done") {
        stepsArray.push({ number: i, status: "done" });
      } else if (status === "available" || status === "in_progress") {
        stepsArray.push({ number: i, status: "available" });
      } else {
        stepsArray.push({ number: i, status: "locked" });
      }
    }

    setSteps(stepsArray);
    setLoading(false);
  };

  const doneCount = steps.filter(s => s.status === "done").length;
  const total = steps.length || 40;
  const percent = Math.round((doneCount / total) * 100);

  return (
    <StudentLayout>
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">Progresso</CardTitle>
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
          <div className="grid grid-cols-5 gap-2">
            {steps.map(step => (
              <div
                key={step.number}
                className={cn(
                  "aspect-square rounded-lg flex flex-col items-center justify-center text-sm transition-colors",
                  step.status === "done" && "bg-primary text-primary-foreground",
                  step.status === "available" && "border-2 border-primary text-primary bg-card",
                  step.status === "locked" && "bg-muted text-muted-foreground"
                )}
              >
                {step.status === "done" ? (
                  <>
                    <Check className="h-4 w-4 text-lime" />
                    <span className="text-xs font-bold mt-0.5">{step.number}</span>
                  </>
                ) : step.status === "locked" ? (
                  <>
                    <Lock className="h-3 w-3" />
                    <span className="text-xs mt-0.5">{step.number}</span>
                  </>
                ) : (
                  <span className="text-base font-bold">{step.number}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </StudentLayout>
  );
};

export default ProgressPage;
