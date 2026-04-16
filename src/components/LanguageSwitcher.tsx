import { useState } from "react";
import { useEnrollments, Enrollment } from "@/hooks/useEnrollments";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const FLAG: Record<string, string> = {
  en: "🇺🇸",
  es: "🇪🇸",
  pt: "🇧🇷",
};

export const LanguageSwitcher = () => {
  const { profile } = useAuth();
  const { enrollments, loading, switchLanguage } = useEnrollments();
  const [open, setOpen] = useState(false);

  if (loading || profile?.role !== "student" || enrollments.length <= 1) return null;

  const active = (enrollments as any[]).find(e => e.active) ?? enrollments[0];

  return (
    <div className="relative">
      {/* Bolha principal — mostra idioma ativo */}
      <button
        onClick={() => setOpen(prev => !prev)}
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all",
          "bg-card hover:bg-primary/5",
          open ? "border-primary" : "border-border"
        )}
        title="Trocar idioma"
      >
        <span className="text-base leading-none">{FLAG[active.language_code] ?? "🌐"}</span>
      </button>

      {/* Dropdown com todos os idiomas */}
      {open && (
        <>
          {/* Overlay transparente para fechar ao clicar fora */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-10 z-50 flex flex-col gap-1.5 p-2 rounded-2xl border bg-card shadow-lg min-w-[120px]">
            {(enrollments as any[]).map(e => (
              <button
                key={e.id}
                onClick={() => { setOpen(false); if (!e.active) switchLanguage(e); }}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all text-left",
                  e.active
                    ? "bg-primary/10 text-primary border border-primary/20 cursor-default"
                    : "hover:bg-muted text-foreground"
                )}
              >
                <span className="text-base">{FLAG[e.language_code] ?? "🌐"}</span>
                <span>{e.language_name}</span>
                {e.active && <span className="ml-auto text-[10px] font-light text-primary">ativo</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
