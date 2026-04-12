import { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

const TeacherLayout = ({ children }: { children: ReactNode }) => {
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-background border-b">
        <span className="text-lg font-bold text-primary">steps academy</span>
        <div className="flex items-center gap-3">
          <span className="text-sm font-light text-muted-foreground hidden sm:block">
            {profile?.name}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span className="ml-1.5 text-xs hidden sm:block">Sair</span>
          </Button>
        </div>
      </header>
      <main className="px-4 py-6 max-w-2xl mx-auto">{children}</main>
    </div>
  );
};

export default TeacherLayout;
