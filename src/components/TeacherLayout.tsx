import { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, ClipboardList } from "lucide-react";
import { Link } from "react-router-dom";

const TeacherLayout = ({ children }: { children: ReactNode }) => {
  const { profile, signOut } = useAuth();
  const initials = profile?.name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-background border-b">
        <Link to="/"><img src="/brand/logo-reto-darkpurple.svg" alt="steps academy" className="h-7" /></Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild className="text-xs">
            <Link to="/nivelamento">
              <ClipboardList className="h-3.5 w-3.5 mr-1" />
              Ficha
            </Link>
          </Button>
          <Link to="/perfil-professor">
            <Avatar className="h-8 w-8 cursor-pointer hover:opacity-80 transition-opacity">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
            </Avatar>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <main className="px-4 py-6 md:px-8 lg:px-12 max-w-2xl md:max-w-4xl lg:max-w-6xl mx-auto">{children}</main>
    </div>
  );
};

export default TeacherLayout;
