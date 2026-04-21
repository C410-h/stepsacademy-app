import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Search, HelpCircle, Lightbulb, CheckCircle2 } from "lucide-react";
import { HELP_CONTENT } from "@/data/helpContent";

// ── Component ─────────────────────────────────────────────────────────────────

const Help = () => {
  const { profile } = useAuth();
  const [search, setSearch] = useState("");

  // ── Sugestões ─────────────────────────────────────────────────────────────
  const [studentId, setStudentId] = useState<string | null>(null);
  const [category, setCategory] = useState("geral");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from("students")
      .select("id")
      .eq("user_id", profile.id)
      .maybeSingle()
      .then(({ data }) => setStudentId(data?.id ?? null));
  }, [profile]);

  const handleSubmit = async () => {
    if (!message.trim() || !profile) return;
    setSubmitting(true);
    try {
      await (supabase as any).from("suggestions").insert({
        student_id: studentId,
        profile_id: profile.id,
        message: message.trim(),
        category,
      });
      setSubmitted(true);
      setMessage("");
      toast({ title: "✅ Sugestão enviada!", description: "Obrigado! Nossa equipe vai analisar em breve." });
    } catch {
      toast({ title: "Erro ao enviar sugestão", description: "Tente novamente.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const role = (profile?.role as keyof typeof HELP_CONTENT) ?? "student";
  const sections = HELP_CONTENT[role] ?? HELP_CONTENT.student;

  // Flat list for search results
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return null;
    const results: (HelpItem & { section: string })[] = [];
    for (const sec of sections) {
      for (const item of sec.items) {
        if (
          item.question.toLowerCase().includes(term) ||
          item.answer.toLowerCase().includes(term)
        ) {
          results.push({ ...item, section: sec.section });
        }
      }
    }
    return results;
  }, [search, sections]);

  return (
    <StudentLayout>
      <div className="space-y-6 max-w-2xl">

        {/* ── Header ── */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Central de Ajuda</h1>
          <p className="text-sm text-muted-foreground font-light">
            Encontre respostas para as principais dúvidas sobre a plataforma.
          </p>
        </div>

        {/* ── Search ── */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar pergunta ou palavra-chave…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* ── Search results ── */}
        {filtered !== null && (
          filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <HelpCircle className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground font-light">
                Nenhum resultado para{" "}
                <span className="font-medium text-foreground">"{search}"</span>.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-light uppercase tracking-wide">
                {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
              </p>
              <Accordion type="multiple">
                {filtered.map((item, i) => (
                  <AccordionItem key={i} value={`search-${i}`}>
                    <AccordionTrigger className="text-sm font-semibold text-left gap-3">
                      <span className="flex-1">{item.question}</span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className="text-sm text-muted-foreground font-light leading-relaxed">
                        {item.answer}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 mt-2 uppercase tracking-wide">
                        {item.section}
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )
        )}

        {/* ── Sections (normal view) ── */}
        {filtered === null && (
          <div className="space-y-8">
            {sections.map((sec, si) => (
              <div key={si} className="space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-0.5">
                  {sec.section}
                </h2>
                <Accordion type="multiple">
                  {sec.items.map((item, ii) => (
                    <AccordionItem key={ii} value={`${si}-${ii}`}>
                      <AccordionTrigger className="text-sm font-semibold text-left">
                        {item.question}
                      </AccordionTrigger>
                      <AccordionContent>
                        <p className="text-sm text-muted-foreground font-light leading-relaxed">
                          {item.answer}
                        </p>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* ── Caixa de sugestões ── */}
      {profile?.role === "student" && (
        <Card className="mt-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-yellow-500" />
              Tem uma sugestão?
            </CardTitle>
            <p className="text-xs text-muted-foreground font-light">
              Sugira novos minigames, funções, atividades ou qualquer ideia para melhorar a plataforma.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {submitted ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
                <p className="text-sm font-medium">Sugestão enviada!</p>
                <p className="text-xs text-muted-foreground font-light">Nossa equipe vai analisar em breve.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 text-xs"
                  onClick={() => setSubmitted(false)}
                >
                  Enviar outra sugestão
                </Button>
              </div>
            ) : (
              <>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minigame">🎮 Minigame</SelectItem>
                    <SelectItem value="funcao">⚙️ Função da plataforma</SelectItem>
                    <SelectItem value="atividade">📚 Atividade de aula</SelectItem>
                    <SelectItem value="geral">💬 Geral</SelectItem>
                  </SelectContent>
                </Select>

                <Textarea
                  placeholder="Escreva sua sugestão aqui…"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={4}
                  className="text-sm resize-none"
                  maxLength={1000}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground font-light">
                    {message.length}/1000 caracteres
                  </span>
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={submitting || !message.trim()}
                    className="font-bold"
                  >
                    {submitting ? "Enviando…" : "Enviar sugestão"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

    </StudentLayout>
  );
};

export default Help;
