import { ReactNode } from "react";
import BottomNav from "./BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { useGamification } from "@/contexts/GamificationContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Zap, Home, GraduationCap, BarChart3, CircleHelp } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const navItems = [
  { to: "/", icon: Home, label: "Início" },
  { to: "/aula", icon: GraduationCap, label: "Aula" },
  { to: "/step-by-step", icon: Zap, label: "Step by Step" },
  { to: "/progresso", icon: BarChart3, label: "Progresso" },
  { to: "/ajuda", icon: CircleHelp, label: "Ajuda" },
];

const StudentLayout = ({ children }: { children: ReactNode }) => {
  const { profile } = useAuth();
  const { gamification } = useGamification();
  const initials = profile?.name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <div className="min-h-screen bg-background">

      {/* ── Desktop Sidebar ─────────────────────────────────────── */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-56 flex-col border-r bg-card z-40">
        {/* Logo */}
        <div className="px-5 py-4 border-b">
          <Link to="/">
            <img src="/brand/logo-reto-darkpurple.webp" alt="steps academy" className="h-7 w-auto object-contain" />
          </Link>
        </div>

        {/* Nav links */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground font-normal hover:text-foreground hover:bg-muted"
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User card at bottom */}
        <div className="p-3 border-t space-y-2">
          <LanguageSwitcher />
          <Link
            to="/perfil"
            className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted transition-colors"
          >
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate leading-tight">{profile?.name?.split(" ")[0] || "Perfil"}</p>
              {gamification.studentId && (
                <div className="flex items-center gap-0.5 mt-0.5">
                  <Zap className="h-3 w-3 shrink-0" style={{ fill: "var(--theme-accent)", color: "var(--theme-accent)" }} />
                  <span className="text-xs font-semibold" style={{ color: "var(--theme-primary)" }}>
                    {gamification.xp_total.toLocaleString("pt-BR")} XP
                  </span>
                </div>
              )}
            </div>
          </Link>
        </div>
      </aside>


      {/* ── Mobile Top Header ───────────────────────────────────── */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-background border-b">
        <Link to="/"><img src="/brand/logo-reto-darkpurple.webp" alt="steps academy" className="h-7 w-auto object-contain" /></Link>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          {gamification.studentId && (
            <div className="flex items-center gap-1 rounded-full px-2.5 py-1" style={{ backgroundColor: "color-mix(in srgb, var(--theme-primary) 12%, transparent)" }}>
              <Zap className="h-3.5 w-3.5" style={{ fill: "var(--theme-accent)", color: "var(--theme-accent)" }} />
              <span className="text-xs font-bold" style={{ color: "var(--theme-primary)" }}>{gamification.xp_total} XP</span>
            </div>
          )}
          <Link to="/perfil">
            <Avatar className="h-8 w-8 cursor-pointer hover:opacity-80 transition-opacity">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </header>

      {/* ── Main Content ────────────────────────────────────────── */}
      <main className="pb-20 lg:pb-0 lg:pl-56">
        <div className="px-4 py-4 lg:px-10 lg:py-8 max-w-lg lg:max-w-4xl mx-auto">
          {children}
        </div>
      </main>

      {/* ── Mobile Bottom Nav ───────────────────────────────────── */}
      <BottomNav />
    </div>
  );
};

export default StudentLayout;
