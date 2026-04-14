import { Home, BookOpen, BarChart3, Gift, BookCheck, Zap } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", icon: Home, label: "Início" },
  { to: "/materiais", icon: BookOpen, label: "Materiais" },
  { to: "/exercicios-da-aula", icon: BookCheck, label: "Exercícios" },
  { to: "/step-by-step", icon: Zap, label: "Step by Step" },
  { to: "/progresso", icon: BarChart3, label: "Progresso" },
  { to: "/loja", icon: Gift, label: "Loja" },
];

const BottomNav = () => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card px-1 pb-safe">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-light transition-colors min-w-0",
                isActive ? "text-primary" : "text-muted-foreground"
              )
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="truncate w-full text-center leading-tight">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
};

export default BottomNav;
