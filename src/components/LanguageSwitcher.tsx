import { useState } from "react";
import { useEnrollments } from "@/hooks/useEnrollments";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const LANGUAGE_FLAGS: Record<string, string> = {
  'inglês': 'us',
  'english': 'us',
  'espanhol': 'es',
  'español': 'es',
  'libras': 'br',
  'japonês': 'jp',
  'japanese': 'jp',
}

const Flag = ({ code, size = 20 }: { code: string; size?: number }) => (
  <img
    src={`https://flagcdn.com/w${size}/${code}.png`}
    width={size}
    height={Math.round(size * 0.75)}
    alt=""
    style={{ borderRadius: 2, objectFit: 'cover' }}
  />
)

const getFlagCode = (languageName: string) =>
  LANGUAGE_FLAGS[languageName.toLowerCase()] ?? null

const CODE: Record<string, string> = {
  en: "EN",
  es: "ES",
  pt: "LIBRAS",
  ja: "JP",
}

// ── Sidebar / header compact switcher ────────────────────────────────────────

interface LanguageSwitcherProps {
  direction?: 'up' | 'down'
}

export const LanguageSwitcher = ({ direction = 'up' }: LanguageSwitcherProps) => {
  const { profile } = useAuth();
  const { enrollments, loading, switchLanguage } = useEnrollments();
  const [open, setOpen] = useState(false);

  if (loading || profile?.role !== "student" || enrollments.length <= 1) return null;

  const active = (enrollments as any[]).find(e => e.active) ?? enrollments[0];
  const flagCode = getFlagCode(active.language_name)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(prev => !prev)}
        className={cn(
          "flex items-center gap-1.5 h-8 px-2.5 rounded-full border-2 text-xs font-bold transition-all",
          "bg-card hover:bg-primary/5",
          open ? "border-primary" : "border-border"
        )}
        title="Trocar idioma"
      >
        {flagCode
          ? <Flag code={flagCode} size={20} />
          : <span className="text-sm leading-none">🌐</span>
        }
        <span className="leading-none">{CODE[active.language_code] ?? active.language_code.toUpperCase()}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={cn(
              "absolute right-0 z-50 flex flex-col gap-1.5 p-2 rounded-2xl border bg-card shadow-lg min-w-[140px]",
              direction === 'up' ? "bottom-full mb-2" : "top-full mt-2"
            )}
          >
            {(enrollments as any[]).map(e => {
              const fc = getFlagCode(e.language_name)
              return (
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
                  {fc
                    ? <Flag code={fc} size={20} />
                    : <span className="text-base leading-none">🌐</span>
                  }
                  <span>{e.language_name}</span>
                  {e.active && <span className="ml-auto text-[10px] font-light text-primary">ativo</span>}
                </button>
              )
            })}
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
        {(enrollments as any[]).map(e => {
          const fc = getFlagCode(e.language_name)
          return (
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
              {fc
                ? <Flag code={fc} size={20} />
                : <span className="text-xl leading-none">🌐</span>
              }
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
          )
        })}
      </div>
    </div>
  );
};
