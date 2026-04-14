import { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, ClipboardList } from "lucide-react";
import { Link } from "react-router-dom";

const TeacherLayout = ({ children }: { children: ReactNode }) => {
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-background border-b">
        <img src="/brand/logo-reto-darkpurple.svg" alt="steps academy" className="h-7" />
        <div className="flex items-center gap-2">
          <span className="text-sm font-light text-muted-foreground hidden sm:block">
            {profile?.name}
          </span>
          <Button variant="outline" size="sm" asChild className="text-xs">
            <Link to="/nivelamento">
              <ClipboardList className="h-3.5 w-3.5 mr-1" />
              Ficha
            </Link>
          </Button>
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
