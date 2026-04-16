import { useEnrollments } from "@/hooks/useEnrollments";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const FLAG: Record<string, string> = {
  en: "🇺🇸",
  es: "🇦🇷",
  pt: "🇧🇷",
};

export const LanguageSwitcher = () => {
  const { profile } = useAuth();
  const { enrollments, loading, switchLanguage } = useEnrollments();

  // Só renderiza para alunos com mais de 1 idioma ativo
  if (loading || profile?.role !== "student" || enrollments.length <= 1) return null;

  // Descobre qual é o ativo
  const active = enrollments.find((e) => e.active) ?? enrollments[0];
  const other = enrollments.find((e) => e.id !== active.id);

  if (!other) return null;

  return (
    <button
      onClick={() => switchLanguage(other)}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-full border-2 border-border",
        "bg-card hover:border-primary hover:bg-primary/5 transition-all",
        "text-xs font-bold"
      )}
      title={`Trocar para ${other.language_name}`}
    >
      <span>{FLAG[active.language_code] ?? "🌐"}</span>
      <span className="text-muted-foreground font-light">→</span>
      <span>{FLAG[other.language_code] ?? "🌐"}</span>
    </button>
  );
};
