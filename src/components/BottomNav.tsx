import { Home, BookOpen, Zap, Trophy, User } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

// ── Side nav items ─────────────────────────────────────────────────────────────

const LEFT_ITEMS = [
  { to: "/", icon: Home, label: "Início", end: true },
  { to: "/aula", icon: BookOpen, label: "Aula", end: false },
];

const RIGHT_ITEMS = [
  { to: "/ranking", icon: Trophy, label: "Ranking", end: false },
  { to: "/perfil", icon: User, label: "Perfil", end: false },
];

// ── Component ──────────────────────────────────────────────────────────────────

const BottomNav = () => {
  const location = useLocation();
  const stepActive = location.pathname.startsWith("/step-by-step");

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-card"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div
        className="flex items-center max-w-lg mx-auto"
        style={{ height: 64 }}
      >
        {/* ── Left group: Dashboard + Aula ── */}
        <div className="flex items-center justify-around" style={{ width: "40%" }}>
          {LEFT_ITEMS.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 py-2 px-3 min-w-[44px] min-h-[44px] justify-center",
                  "text-[10px] font-light transition-colors",
                  isActive ? "text-[var(--theme-primary)]" : "text-muted-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className="shrink-0"
                    style={{
                      width: 22,
                      height: 22,
                      color: isActive ? "var(--theme-primary)" : undefined,
                    }}
                  />
                  <span className="leading-tight">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* ── Centre: Step by Step FAB ── */}
        <div
          className="flex items-center justify-center"
          style={{ width: "20%" }}
        >
          <NavLink
            to="/step-by-step"
            aria-label="Step by Step"
            style={{ transform: "translateY(-16px)" }}
          >
            <div
              className="flex items-center justify-center rounded-full transition-all"
              style={{
                width: 56,
                height: 56,
                background: "var(--theme-accent)",
                boxShadow: stepActive
                  ? "0 0 0 3px var(--theme-accent), 0 4px 12px rgba(0,0,0,0.15)"
                  : "0 4px 12px rgba(0,0,0,0.15)",
                outline: stepActive
                  ? "2px solid var(--theme-accent)"
                  : "none",
                outlineOffset: 3,
              }}
            >
              <Zap
                fill="white"
                stroke="white"
                style={{ width: 24, height: 24 }}
              />
            </div>
          </NavLink>
        </div>

        {/* ── Right group: Ranking + Perfil ── */}
        <div className="flex items-center justify-around" style={{ width: "40%" }}>
          {RIGHT_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 py-2 px-3 min-w-[44px] min-h-[44px] justify-center",
                  "text-[10px] font-light transition-colors",
                  isActive ? "text-[var(--theme-primary)]" : "text-muted-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className="shrink-0"
                    style={{
                      width: 22,
                      height: 22,
                      color: isActive ? "var(--theme-primary)" : undefined,
                    }}
                  />
                  <span className="leading-tight">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
};

export default BottomNav;
