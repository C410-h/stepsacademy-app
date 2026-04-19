import { useState } from "react";
import { useEnrollments, Enrollment } from "@/hooks/useEnrollments";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const FLAG: Record<string, string> = {
  en: "🇺🇸",
  es: "🇪🇸",
  pt: "🇧🇷",
  ja: "🇯🇵",
};

const CODE: Record<string, string> = {
  en: "EN",
  es: "ES",
  pt: "LIBRAS",
  ja: "JP",
};

// ── Sidebar compact switcher ──────────────────────────────────────────────────

export const LanguageSwitcher = () => {
  const { profile } = useAuth();
  const { enrollments, loading, switchLanguage } = useEnrollments();
  const [open, setOpen] = useState(false);

  if (loading || profile?.role !== "student" || enrollments.length <= 1) return null;

  const active = (enrollments as any[]).find(e => e.active) ?? enrollments[0];

  return (
    <div className="relative">
      {/* Trigger — pill showing flag + code */}
      <button
        onClick={() => setOpen(prev => !prev)}
        className={cn(
          "flex items-center gap-1.5 h-8 px-2.5 rounded-full border-2 text-xs font-bold transition-all",
          "bg-card hover:bg-primary/5",
          open ? "border-primary" : "border-border"
        )}
        title="Trocar idioma"
      >
        <span className="text-sm leading-none">{FLAG[active.language_code] ?? "🌐"}</span>
        <span className="leading-none">{CODE[active.language_code] ?? active.language_code.toUpperCase()}</span>
      </button>

      {/* Dropdown — opens upward */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 bottom-full mb-2 z-50 flex flex-col gap-1.5 p-2 rounded-2xl border bg-card shadow-lg min-w-[140px]">
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
                <span className="text-base leading-none">{FLAG[e.language_code] ?? "🌐"}</span>
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

// ── Profile page inline list ──────────────────────────────────────────────────

export const LanguageSwitcherList = () => {
  const { profile } = useAuth();
  const { enrollments, loading, switchLanguage } = useEnrollments();

  if (loading || profile?.role !== "student" || enrollments.length <= 1) return null;

  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
      <div className="px-4 pt-4 pb-2">
        <p className="text-sm font-bold">Idioma ativo</p>
        <p className="text-xs text-muted-foreground font-light mt-0.5">
          Escolha o idioma que deseja praticar agora
        </p>
      </div>
      <div className="px-4 pb-4 pt-1 space-y-2">
        {(enrollments as any[]).map(e => (
          <button
            key={e.id}
            onClick={() => !e.active && switchLanguage(e)}
            disabled={e.active}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all border-2",
              e.active ? "cursor-default" : "border-transparent bg-muted/50 hover:bg-muted"
            )}
            style={e.active ? {
              borderColor: "color-mix(in srgb, var(--theme-accent) 50%, transparent)",
              backgroundColor: "color-mix(in srgb, var(--theme-accent) 10%, transparent)",
            } : {}}
          >
            <span className="text-xl leading-none">{FLAG[e.language_code] ?? "🌐"}</span>
            <span className="font-medium text-sm flex-1">{e.language_name}</span>
            {e.active && (
              <span
                className="text-[10px] font-bold uppercase tracking-wide"
                style={{ color: "var(--theme-accent)" }}
              >
                ativo
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
