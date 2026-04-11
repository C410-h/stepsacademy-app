import { ReactNode } from "react";
import BottomNav from "./BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const StudentLayout = ({ children }: { children: ReactNode }) => {
  const { profile } = useAuth();
  const initials = profile?.name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-background border-b">
        <span className="text-lg font-bold text-primary">steps academy</span>
        <Avatar className="h-8 w-8">
          <AvatarImage src={profile?.avatar_url || undefined} />
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
        </Avatar>
      </header>
      <main className="px-4 py-4 max-w-lg mx-auto">{children}</main>
      <BottomNav />
    </div>
  );
};

export default StudentLayout;
