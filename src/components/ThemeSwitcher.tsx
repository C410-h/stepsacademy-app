import { useTheme } from "@/contexts/ThemeContext";
import { ThemeKey } from "@/lib/themes";

const ThemeSwitcher = () => {
  const { theme: activeTheme, setTheme, themes } = useTheme();

  const entries = (Object.entries(themes) as [ThemeKey, typeof themes[ThemeKey]][]).filter(([key]) => key !== 'ola');

  return (
    <div className="bg-card border rounded-2xl p-4">
      <div className="mb-3">
        <p className="text-sm font-semibold text-foreground">Meu tema</p>
        <p className="text-xs text-muted-foreground">Personalize as cores da plataforma</p>
      </div>

      <div className="flex flex-wrap gap-3 justify-start">
        {entries.map(([key, t]) => {
          const isActive = activeTheme === key;
          return (
            <button
              key={key}
              onClick={() => setTheme(key)}
              className="flex flex-col items-center gap-1.5 p-1 rounded-xl transition-colors hover:bg-muted/40"
              title={t.name}
            >
              <div
                style={{
                  position: "relative",
                  width: 64,
                  height: 64,
                  borderRadius: 16,
                  overflow: "hidden",
                  border: isActive ? `2px solid ${t.primary}` : "2px solid transparent",
                  outline: isActive ? `2px solid ${t.primary}30` : "2px solid transparent",
                  transition: "border-color 0.2s, transform 0.15s, outline-color 0.2s",
                  transform: isActive ? "scale(1.08)" : "scale(1)",
                  cursor: "pointer",
                }}
              >
                {/* Primary half (full background) */}
                <div style={{ position: "absolute", inset: 0, background: t.primary }} />
                {/* Accent half (lower-right triangle) */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: t.accent,
                    clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
                  }}
                />
                {/* Check mark when active */}
                {isActive && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path
                        d="M4 9l4 4 6-6"
                        stroke="white"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">{t.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ThemeSwitcher;
