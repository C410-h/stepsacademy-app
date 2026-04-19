import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import StudentLayout from "@/components/StudentLayout";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Search, HelpCircle } from "lucide-react";
import { HELP_CONTENT } from "@/data/helpContent";

// ── Component ─────────────────────────────────────────────────────────────────

const Help = () => {
  const { profile } = useAuth();
  const [search, setSearch] = useState("");

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
    </StudentLayout>
  );
};

export default Help;
