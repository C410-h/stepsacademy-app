import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import PDFViewer from "@/components/PDFViewer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Headphones, FileText, PenLine, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const deliveryFilters = [
  { value: "before", label: "Antes da aula" },
  { value: "during", label: "Durante" },
  { value: "after", label: "Após a aula" },
];

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

interface Material {
  id: string;
  title: string;
  type: string;
  delivery: string;
  file_url: string | null;
  accessed: boolean;
}

const Materials = () => {
  const { profile } = useAuth();
  const [studentId, setStudentId] = useState<string | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [filter, setFilter] = useState("before");
  const [loading, setLoading] = useState(true);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfTitle, setPdfTitle] = useState<string>("");

  useEffect(() => {
    if (!profile) return;
    loadMaterials();
  }, [profile]);

  const loadMaterials = async () => {
    if (!profile) return;
    const { data: student } = await supabase
      .from("students")
      .select("id, current_step_id")
      .eq("user_id", profile.id)
      .single();

    if (!student) { setLoading(false); return; }
    setStudentId(student.id);

    const s = student as any;

    // 3-query pattern: step materials + personal materials + accesses
    const [stepRes, personalRes, accessRes] = await Promise.all([
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
      supabase
        .from("material_accesses")
        .select("material_id")
        .eq("student_id", s.id),
    ]);

    const accessedIds = new Set((accessRes.data || []).map((a: any) => a.material_id));

    const stepMats: Material[] = ((stepRes.data || []) as any[]).map((m: any) => ({
      ...m,
      accessed: accessedIds.has(m.id),
    }));

    const personalMats: Material[] = ((personalRes.data || []) as any[])
      .map((sm: any) => sm.materials)
      .filter(Boolean)
      .map((m: any) => ({ ...m, accessed: accessedIds.has(m.id) }));

    // Deduplicate by id (personal mat could overlap with step mat)
    const seen = new Set<string>();
    const combined: Material[] = [];
    for (const m of [...stepMats, ...personalMats]) {
      if (!seen.has(m.id)) { seen.add(m.id); combined.push(m); }
    }

    setMaterials(combined);
    setLoading(false);
  };

  const filtered = materials.filter(m => m.delivery === filter);

  const openMaterial = async (m: Material) => {
    if (!m.file_url) return;

    if (m.type === "audio") {
      setAudioUrl(m.file_url);
    } else {
      // Open all non-audio files in the embedded PDFViewer
      setPdfTitle(m.title);
      setPdfUrl(m.file_url);
    }

    // Registrar acesso se ainda não foi acessado
    if (studentId && !m.accessed) {
      await (supabase as any)
        .from("material_accesses")
        .upsert({ student_id: studentId, material_id: m.id, accessed_at: new Date().toISOString() }, { onConflict: "student_id,material_id" });

      setMaterials(prev =>
        prev.map(mat => mat.id === m.id ? { ...mat, accessed: true } : mat)
      );
    }
  };

  return (
    <StudentLayout>
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Materiais</h2>

        {/* Filters */}
        <div className="flex gap-2">
          {deliveryFilters.map(f => (
            <Button
              key={f.value}
              variant={filter === f.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f.value)}
              className={cn("text-xs", filter === f.value && "bg-primary text-primary-foreground")}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum material nesta seção.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map(m => (
              <Card
                key={m.id}
                className="cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => openMaterial(m)}
              >
                <CardContent className="flex items-center gap-3 py-3 px-4">
                  <div className="text-primary">{typeIcons[m.type] || <FileText className="h-5 w-5" />}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{m.title}</p>
                    <p className="text-xs text-muted-foreground font-light">{typeLabels[m.type] || m.type}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.accessed ? (
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
            ))}
          </div>
        )}

        {/* Áudio inline player */}
        {audioUrl && (
          <Card>
            <CardContent className="py-4">
              <audio controls className="w-full" src={audioUrl}>
                Seu navegador não suporta áudio.
              </audio>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-xs"
                onClick={() => setAudioUrl(null)}
              >
                Fechar player
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* PDF / Slide embedded viewer */}
      <PDFViewer url={pdfUrl} title={pdfTitle} onClose={() => setPdfUrl(null)} />
    </StudentLayout>
  );
};

export default Materials;
