import { Home, BookOpen, Zap, Gift } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// ── Side nav items ─────────────────────────────────────────────────────────────

const LEFT_ITEMS = [
  { to: "/", icon: Home, label: "Início", end: true },
  { to: "/aula", icon: BookOpen, label: "Aula", end: false },
];

const RIGHT_ITEMS = [
  { to: "/recompensas", icon: Gift, label: "Recompensas", end: false },
];

// ── Component ──────────────────────────────────────────────────────────────────

const BottomNav = () => {
  const location = useLocation();
  const { profile } = useAuth();
  const stepActive = location.pathname.startsWith("/step-by-step");
  const perfilActive = location.pathname.startsWith("/perfil");

  const initials = profile?.name
    ?.split(" ")
    .map(n => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

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
                background: "var(--theme-primary)",
                boxShadow: stepActive
                  ? "0 0 0 3px var(--theme-primary), 0 4px 12px rgba(0,0,0,0.15)"
                  : "0 4px 12px rgba(0,0,0,0.15)",
              }}
            >
              <Zap
                style={{
                  width: 24,
                  height: 24,
                  fill: "var(--theme-accent)",
                  stroke: "var(--theme-accent)",
                }}
              />
            </div>
          </NavLink>
        </div>

        {/* ── Right group: Progresso + Perfil ── */}
        <div className="flex items-center justify-around" style={{ width: "40%" }}>
          {/* Progresso */}
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

          {/* Perfil — avatar do usuário */}
          <NavLink
            to="/perfil"
            className="flex flex-col items-center gap-0.5 py-2 px-3 min-w-[44px] min-h-[44px] justify-center text-[10px] font-light transition-colors"
          >
            <Avatar
              className="shrink-0 transition-all"
              style={{
                width: 26,
                height: 26,
                outline: perfilActive ? "2px solid var(--theme-primary)" : "2px solid transparent",
                outlineOffset: 1,
              }}
            >
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback
                className="text-[9px] font-bold"
                style={{
                  background: "var(--theme-primary)",
                  color: "var(--theme-text-on-primary)",
                }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            <span
              className="leading-tight"
              style={{ color: perfilActive ? "var(--theme-primary)" : undefined }}
            >
              Perfil
            </span>
          </NavLink>
        </div>
      </div>
    </nav>
  );
};

export default BottomNav;
