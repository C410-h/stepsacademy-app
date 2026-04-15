import { ReactNode } from "react";
import BottomNav from "./BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { useGamification } from "@/contexts/GamificationContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Zap } from "lucide-react";
import { Link } from "react-router-dom";

const StudentLayout = ({ children }: { children: ReactNode }) => {
  const { profile } = useAuth();
  const { gamification } = useGamification();
  const initials = profile?.name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-background border-b">
        <Link to="/"><img src="/brand/logo-reto-darkpurple.webp" alt="steps academy" className="h-32" /></Link>
        <div className="flex items-center gap-3">
          {gamification.studentId && (
            <div className="flex items-center gap-1 rounded-full px-2.5 py-1" style={{ backgroundColor: 'color-mix(in srgb, var(--theme-primary) 12%, transparent)' }}>
              <Zap className="h-3.5 w-3.5" style={{ fill: 'var(--theme-accent)', color: 'var(--theme-accent)' }} />
              <span className="text-xs font-bold" style={{ color: 'var(--theme-primary)' }}>{gamification.xp_total} XP</span>
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
      <main className="px-4 py-4 max-w-lg mx-auto">{children}</main>
      <BottomNav />
    </div>
  );
};

export default StudentLayout;
