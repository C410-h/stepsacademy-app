import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, ClipboardList, CheckCircle2 } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface StudentOption {
  id: string;
  name: string;
}

interface LanguageOption {
  id: string;
  name: string;
}

interface LevelOption {
  id: string;
  name: string;
  code: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const NIVEL_OPTIONS = ["A1", "A2", "B1", "B2", "Sem contato anterior"] as const;
type NivelOption = typeof NIVEL_OPTIONS[number];

const SLIDER_LABELS: Record<number, string> = {
  1: "Nenhuma",
  2: "Básica",
  3: "Intermediária",
  4: "Boa",
  5: "Avançada",
};

const TOPICOS_MAP: Record<string, string[]> = {
  English: [
    "Present Simple",
    "Present Continuous",
    "Past Simple",
    "Vocabulary A1-A2",
    "Pronunciation",
  ],
  Inglês: [
    "Present Simple",
    "Present Continuous",
    "Past Simple",
    "Vocabulary A1-A2",
    "Pronunciation",
  ],
  Spanish: [
    "Presente",
    "Pasado",
    "Vocabulario",
    "Pronunciación",
    "Verbos irregulares",
  ],
  Espanhol: [
    "Presente",
    "Pasado",
    "Vocabulario",
    "Pronunciación",
    "Verbos irregulares",
  ],
  Libras: [
    "Datilologia",
    "Vocabulário básico",
    "Frases simples",
    "Números",
    "Expressões faciais",
  ],
};

const GENERIC_TOPICOS = ["Grammar", "Vocabulary", "Pronunciation", "Comprehension"];

function getTopicos(languageName: string): string[] {
  return TOPICOS_MAP[languageName] ?? GENERIC_TOPICOS;
}

// ─── Slider helper ────────────────────────────────────────────────────────────

interface SliderFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
}

const SliderField = ({ label, value, onChange }: SliderFieldProps) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <Label className="text-sm font-medium">{label}</Label>
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#520A70]/10 text-[#520A70]">
        {value} — {SLIDER_LABELS[value]}
      </span>
    </div>
    <input
      type="range"
      min={1}
      max={5}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-[#520A70] h-2 cursor-pointer"
    />
    <div className="flex justify-between text-[10px] text-muted-foreground select-none">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n}>{n}</span>
      ))}
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const Nivelamento = () => {
  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Data lists
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [languages, setLanguages] = useState<LanguageOption[]>([]);
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Step 1 selects
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedLanguageId, setSelectedLanguageId] = useState("");

  // Fase 1
  const [nivelEstimado, setNivelEstimado] = useState<string>("");
  const [fluencia, setFluencia] = useState(1);
  const [vocabulario, setVocabulario] = useState(1);
  const [compreensao, setCompreensao] = useState(1);
  const [observacoes, setObservacoes] = useState("");
  const [decisao, setDecisao] = useState<"fase2" | "direto" | "">("");
  const [directLevelId, setDirectLevelId] = useState("");

  // Fase 2
  const [confirmacaoNivel, setConfirmacaoNivel] = useState("");
  const [topicosChecked, setTopicosChecked] = useState<Set<string>>(new Set());
  const [nivelFinal, setNivelFinal] = useState("");
  const [recomendacoes, setRecomendacoes] = useState("");

  // Save state
  const [saving, setSaving] = useState(false);

  // ── Access guard (non-blocking, wait for auth) ─────────────────────────────
  const allowedRoles = ["teacher", "admin"];
  if (!authLoading && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    loadInitialData();
  }, [profile]);

  const loadInitialData = async () => {
    setLoadingData(true);
    try {
      // Students with role='student'
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, name")
        .eq("role", "student")
        .order("name");

      if (profileRows && profileRows.length > 0) {
        const profileIds = profileRows.map((p) => p.id);

        // Get student records (user_id matches profile id)
        const { data: studentRows } = await supabase
          .from("students")
          .select("id, user_id")
          .in("user_id", profileIds);

        if (studentRows) {
          const mapped: StudentOption[] = studentRows.map((s) => ({
            id: s.id,
            name:
              profileRows.find((p) => p.id === s.user_id)?.name || "Aluno",
          }));
          setStudents(mapped.sort((a, b) => a.name.localeCompare(b.name)));
        }
      }

      // Languages active
      const { data: langRows } = await supabase
        .from("languages")
        .select("id, name")
        .eq("active", true)
        .order("name");

      setLanguages(langRows || []);
    } catch {
      toast({ title: "Erro ao carregar dados.", variant: "destructive" });
    } finally {
      setLoadingData(false);
    }
  };

  // ── Load levels when language changes ─────────────────────────────────────
  useEffect(() => {
    if (!selectedLanguageId) {
      setLevels([]);
      setDirectLevelId("");
      setTopicosChecked(new Set());
      return;
    }
    loadLevels(selectedLanguageId);
  }, [selectedLanguageId]);

  const loadLevels = async (langId: string) => {
    const { data } = await supabase
      .from("levels")
      .select("id, name, code")
      .eq("language_id", langId)
      .order("name");
    setLevels(data || []);
  };

  // ── Reset fase2 fields when decision changes ───────────────────────────────
  useEffect(() => {
    if (decisao !== "fase2") {
      setConfirmacaoNivel("");
      setTopicosChecked(new Set());
      setNivelFinal("");
      setRecomendacoes("");
    }
    if (decisao !== "direto") {
      setDirectLevelId("");
    }
  }, [decisao]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedLanguage = languages.find((l) => l.id === selectedLanguageId);
  const showFase1 = !!selectedStudentId && !!selectedLanguageId;
  const showFase2 = showFase1 && decisao === "fase2";
  const topicosOptions = selectedLanguage
    ? getTopicos(selectedLanguage.name)
    : GENERIC_TOPICOS;

  const toggleTopico = (t: string) => {
    setTopicosChecked((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  // ── Back path ─────────────────────────────────────────────────────────────
  const backPath = profile?.role === "admin" ? "/admin" : "/teacher";

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!profile) return;
    if (!selectedStudentId || !selectedLanguageId) {
      toast({
        title: "Selecione o aluno e o idioma antes de salvar.",
        variant: "destructive",
      });
      return;
    }
    if (!nivelEstimado) {
      toast({
        title: "Informe o nível estimado (Fase 1).",
        variant: "destructive",
      });
      return;
    }
    if (!decisao) {
      toast({ title: "Informe a decisão da Fase 1.", variant: "destructive" });
      return;
    }
    if (decisao === "direto" && !directLevelId) {
      toast({
        title: "Selecione o nível para matrícula direta.",
        variant: "destructive",
      });
      return;
    }
    if (decisao === "fase2" && !nivelFinal) {
      toast({
        title: "Informe o nível final definido na Fase 2.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      // Build responses JSONB
      const responses: Record<string, unknown> = {
        fase1: {
          nivel_estimado: nivelEstimado,
          fluencia_oral: fluencia,
          vocabulario,
          compreensao,
          observacoes,
          decisao,
        },
      };

      if (decisao === "fase2") {
        responses.fase2 = {
          confirmacao_nivel: confirmacaoNivel,
          topicos_testados: Array.from(topicosChecked),
          nivel_final: nivelFinal,
          recomendacoes,
        };
      }

      // Determine test_type and assigned_level
      const testType: "experimental" | "placement" =
        decisao === "fase2" && nivelFinal ? "placement" : "experimental";

      const assignedLevel: string | null =
        decisao === "fase2"
          ? nivelFinal
          : decisao === "direto"
          ? (levels.find((l) => l.id === directLevelId)?.code ?? null)
          : null;

      // Get teacher record (null for admin)
      let conductedBy: string | null = null;
      if (profile.role === "teacher") {
        const { data: teacherRow } = await supabase
          .from("teachers")
          .select("id")
          .eq("user_id", profile.id)
          .maybeSingle();
        conductedBy = teacherRow?.id ?? null;
      }

      // Insert placement_test
      const { error: insertError } = await (supabase as any)
        .from("placement_tests")
        .insert({
          student_id: selectedStudentId,
          conducted_by: conductedBy,
          language_id: selectedLanguageId,
          test_type: testType,
          responses,
          assigned_level: assignedLevel,
          completed_at: new Date().toISOString(),
        });

      if (insertError) throw insertError;

      // If direct enrollment, update student level_id
      if (decisao === "direto" && directLevelId) {
        await supabase
          .from("students")
          .update({ level_id: directLevelId })
          .eq("id", selectedStudentId);
      }

      toast({ title: "Ficha salva com sucesso!" });
      navigate(backPath);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Erro ao salvar a ficha.";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-10 w-64" />
      </div>
    );
  }

  if (!profile) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-10 border-b px-4 py-3 flex items-center gap-3"
        style={{ background: "#520A70" }}
      >
        <button
          onClick={() => navigate(backPath)}
          className="text-white/80 hover:text-white transition-colors"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-[#C1FE00]" />
          <h1 className="text-white font-bold text-base">
            Ficha de Nivelamento
          </h1>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="max-w-lg mx-auto px-4 py-6 space-y-5 pb-20">

        {/* ── Seleção de aluno e idioma ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-[#520A70]">
              Informações Básicas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Aluno */}
            <div className="space-y-1.5">
              <Label htmlFor="student-select">Aluno</Label>
              {loadingData ? (
                <Skeleton className="h-10 w-full rounded-md" />
              ) : (
                <Select
                  value={selectedStudentId}
                  onValueChange={setSelectedStudentId}
                >
                  <SelectTrigger id="student-select">
                    <SelectValue placeholder="Selecione o aluno" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Idioma */}
            <div className="space-y-1.5">
              <Label htmlFor="language-select">Idioma</Label>
              {loadingData ? (
                <Skeleton className="h-10 w-full rounded-md" />
              ) : (
                <Select
                  value={selectedLanguageId}
                  onValueChange={setSelectedLanguageId}
                >
                  <SelectTrigger id="language-select">
                    <SelectValue placeholder="Selecione o idioma" />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Fase 1 ── */}
        {showFase1 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-[#520A70]">
                Fase 1 — Aula Experimental
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Nível estimado */}
              <div className="space-y-1.5">
                <Label>Nível estimado</Label>
                <Select value={nivelEstimado} onValueChange={setNivelEstimado}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o nível estimado" />
                  </SelectTrigger>
                  <SelectContent>
                    {NIVEL_OPTIONS.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Fluência oral */}
              <SliderField
                label="Fluência oral"
                value={fluencia}
                onChange={setFluencia}
              />

              {/* Vocabulário */}
              <SliderField
                label="Vocabulário"
                value={vocabulario}
                onChange={setVocabulario}
              />

              {/* Compreensão */}
              <SliderField
                label="Compreensão"
                value={compreensao}
                onChange={setCompreensao}
              />

              {/* Observações */}
              <div className="space-y-1.5">
                <Label>Observações</Label>
                <Textarea
                  placeholder="Anotações livres sobre a aula experimental..."
                  rows={3}
                  className="resize-none text-sm font-light"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                />
              </div>

              {/* Decisão */}
              <div className="space-y-2">
                <Label>Decisão</Label>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="decisao"
                      value="fase2"
                      checked={decisao === "fase2"}
                      onChange={() => setDecisao("fase2")}
                      className="mt-0.5 accent-[#520A70]"
                    />
                    <span className="text-sm leading-snug group-hover:text-[#520A70] transition-colors">
                      Avançar para aula de nivelamento (Fase 2)
                    </span>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="decisao"
                      value="direto"
                      checked={decisao === "direto"}
                      onChange={() => setDecisao("direto")}
                      className="mt-0.5 accent-[#520A70]"
                    />
                    <span className="text-sm leading-snug group-hover:text-[#520A70] transition-colors">
                      Matricular direto
                    </span>
                  </label>
                </div>

                {decisao === "direto" && (
                  <div className="mt-2 space-y-1.5">
                    <Label>Nível para matrícula</Label>
                    {levels.length === 0 ? (
                      <p className="text-xs text-muted-foreground font-light">
                        Nenhum nível encontrado para este idioma.
                      </p>
                    ) : (
                      <Select
                        value={directLevelId}
                        onValueChange={setDirectLevelId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o nível" />
                        </SelectTrigger>
                        <SelectContent>
                          {levels.map((l) => (
                            <SelectItem key={l.id} value={l.id}>
                              {l.code} — {l.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Fase 2 ── */}
        {showFase2 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-[#520A70]">
                Fase 2 — Aula de Nivelamento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Confirmação do nível de entrada */}
              <div className="space-y-1.5">
                <Label>Confirmação do nível de entrada</Label>
                <Select
                  value={confirmacaoNivel}
                  onValueChange={setConfirmacaoNivel}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {["A1", "A2", "B1", "B2"].map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tópicos testados */}
              <div className="space-y-2">
                <Label>Tópicos testados</Label>
                <div className="grid grid-cols-1 gap-2">
                  {topicosOptions.map((t) => (
                    <label
                      key={t}
                      className="flex items-center gap-2.5 cursor-pointer"
                    >
                      <Checkbox
                        checked={topicosChecked.has(t)}
                        onCheckedChange={() => toggleTopico(t)}
                        className="border-[#520A70] data-[state=checked]:bg-[#520A70] data-[state=checked]:border-[#520A70]"
                      />
                      <span className="text-sm">{t}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Nível final definido */}
              <div className="space-y-1.5">
                <Label>Nível final definido</Label>
                <Select value={nivelFinal} onValueChange={setNivelFinal}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {["A1", "A2", "B1", "B2"].map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Recomendações */}
              <div className="space-y-1.5">
                <Label>Recomendações ao professor titular</Label>
                <Textarea
                  placeholder="Pontos de atenção, ritmo de aprendizado, foco recomendado..."
                  rows={4}
                  className="resize-none text-sm font-light"
                  value={recomendacoes}
                  onChange={(e) => setRecomendacoes(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Save button ── */}
        {showFase1 && (
          <Button
            className="w-full font-bold text-[#1D1D1B]"
            style={{ background: "#C1FE00" }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              "Salvando..."
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Salvar Ficha
              </>
            )}
          </Button>
        )}
      </main>
    </div>
  );
};

export default Nivelamento;
