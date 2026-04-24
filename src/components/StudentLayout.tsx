import { ReactNode, useEffect, useState } from "react";
import BottomNav from "./BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { useGamification } from "@/contexts/GamificationContext";
import { usePaymentAlert } from "@/contexts/PaymentAlertContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Zap, Home, GraduationCap, BarChart3, User, X, CircleHelp, Coins, Gift } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import CompleteProfileModal, { MissingField } from "@/components/CompleteProfileModal";
import PushNotificationModal from "@/components/PushNotificationModal";
import { supabase } from "@/integrations/supabase/client";

const navItems = [
  { to: "/", icon: Home, label: "Início" },
  { to: "/aula", icon: GraduationCap, label: "Aula" },
  { to: "/step-by-step", icon: Zap, label: "Step by Step" },
  { to: "/progresso", icon: BarChart3, label: "Progresso" },
  { to: "/recompensas", icon: Gift, label: "Recompensas" },
  { to: "/perfil", icon: User, label: "Perfil" },
];

const StudentLayout = ({ children }: { children: ReactNode }) => {
  const { profile } = useAuth();
  const { gamification } = useGamification();
  const { showPaymentAlert, diasOverdue, isCorporate } = usePaymentAlert();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [missingFields, setMissingFields] = useState<MissingField[]>([]);
  const initials = profile?.name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "?";

  // Verifica campos faltando no perfil — apenas para alunos
  useEffect(() => {
    if (!profile || profile.role !== "student") return;

    (supabase as any)
      .from("profiles")
      .select("name, phone, cpf, birth_date")
      .eq("id", profile.id)
      .single()
      .then(({ data, error }: { data: any; error: any }) => {
        if (error) {
          console.error("[StudentLayout] profile check:", error.message);
          return;
        }
        if (!data) return;
        const missing: MissingField[] = [];
        if (!data.name?.trim())   missing.push("name");
        if (!data.cpf?.trim())    missing.push("cpf");
        if (!data.phone?.trim())  missing.push("phone");
        if (!data.birth_date)     missing.push("birth_date");
        setMissingFields(missing);
      });
  }, [profile?.id]);

  return (
    <div className="min-h-screen bg-background">

      {/* ── Desktop Sidebar ─────────────────────────────────────── */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-56 flex-col border-r bg-card z-40">
        {/* Logo */}
        <div className="px-5 py-4 border-b">
          <Link to="/">
            <img src="/brand/logo-reto-darkpurple.webp" alt="steps academy" className="h-16 w-auto object-contain -my-3" />
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
          <LanguageSwitcher direction="up" />
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
        <Link to="/"><img src="/brand/logo-reto-darkpurple.webp" alt="steps academy" className="h-16 w-auto object-contain -my-3" /></Link>
        <div className="flex items-center gap-1.5">
          <LanguageSwitcher direction="down" />
          {gamification.studentId && (
            <>
              {/* Coins pill */}
              <div className="flex items-center gap-1 rounded-full px-2 py-1 bg-yellow-500">
                <Coins className="h-3.5 w-3.5 text-white shrink-0" />
                <span className="text-xs font-bold text-white">
                  {gamification.coins.toLocaleString("pt-BR")}
                </span>
              </div>
              {/* XP pill */}
              <div className="flex items-center gap-1 rounded-full px-2 py-1" style={{ backgroundColor: "var(--theme-primary)" }}>
                <Zap className="h-3.5 w-3.5 shrink-0" style={{ fill: "var(--theme-accent)", color: "var(--theme-accent)" }} />
                <span className="text-xs font-bold" style={{ color: "var(--theme-text-on-primary)" }}>
                  {gamification.xp_total.toLocaleString("pt-BR")} XP
                </span>
              </div>
            </>
          )}
          <Link
            to="/ajuda"
            aria-label="Ajuda"
            className="flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <CircleHelp className="h-5 w-5" />
          </Link>
        </div>
      </header>

      {/* ── Payment Alert Banner ────────────────────────────────── */}
      {showPaymentAlert && !isCorporate && !bannerDismissed && (
        <div className="lg:pl-56">
          <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 flex items-center gap-3">
            <span className="text-sm text-destructive flex-1">
              Seu pagamento está em atraso há {diasOverdue} {diasOverdue === 1 ? "dia" : "dias"}. Regularize para continuar acessando.
            </span>
            <button
              onClick={() => setBannerDismissed(true)}
              className="shrink-0 text-destructive/60 hover:text-destructive transition-colors p-1 rounded"
              aria-label="Fechar aviso"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Main Content ────────────────────────────────────────── */}
      <main className="pb-20 lg:pb-0 lg:pl-56">
        <div className="px-4 py-4 lg:px-10 lg:py-8 max-w-lg lg:max-w-4xl mx-auto">
          {children}
        </div>
      </main>

      {/* ── Mobile Bottom Nav ───────────────────────────────────── */}
      <BottomNav />

      {/* ── Complete Profile Modal ──────────────────────────────── */}
      {missingFields.length > 0 && (
        <CompleteProfileModal
          open={missingFields.length > 0}
          missingFields={missingFields}
          onComplete={() => setMissingFields([])}
        />
      )}

      {/* ── Push Notification Modal ─────────────────────────────── */}
      <PushNotificationModal studentId={gamification.studentId ?? null} />
    </div>
  );
};

export default StudentLayout;
