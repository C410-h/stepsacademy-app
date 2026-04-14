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
      .select("id")
      .eq("user_id", profile.id)
      .single();

    if (!student) { setLoading(false); return; }
    setStudentId(student.id);

    const { data: sm } = await supabase
      .from("student_materials")
      .select("material_id, accessed_at, materials(id, title, type, delivery, file_url)")
      .eq("student_id", student.id);

    if (sm) {
      const mats = sm
        .map((s: any) => ({ ...s.materials, accessed: !!s.accessed_at }))
        .filter(Boolean) as Material[];
      setMaterials(mats);
    }
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
      await supabase
        .from("student_materials")
        .update({ accessed_at: new Date().toISOString() })
        .eq("student_id", studentId)
        .eq("material_id", m.id);

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
