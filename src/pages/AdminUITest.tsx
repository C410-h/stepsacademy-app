import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutGrid, Users, GraduationCap, BookOpen, TrendingUp,
  FileText, Bell, CreditCard, UserCheck, ShoppingBag, Settings,
  LogOut, Menu,
} from "lucide-react";

const NAV_ITEMS = [
  { value: "overview",      label: "Visão Geral",   icon: LayoutGrid },
  { value: "students",      label: "Alunos",        icon: Users },
  { value: "teachers",      label: "Professores",   icon: GraduationCap },
  { value: "groups",        label: "Turmas",        icon: BookOpen },
  { value: "stats",         label: "Estatísticas",  icon: TrendingUp },
  { value: "content",       label: "Conteúdo",      icon: FileText },
  { value: "notifications", label: "Notificações",  icon: Bell },
  { value: "payments",      label: "Pagamentos",    icon: CreditCard },
  { value: "cadastros",     label: "Cadastros",     icon: UserCheck },
  { value: "store",         label: "Loja",          icon: ShoppingBag },
  { value: "settings",      label: "Config",        icon: Settings },
];

const AdminUITest = () => {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="min-h-screen bg-background">
      {/* Header — same markup as Admin.tsx */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-background border-b">
        <div className="flex items-center gap-2">
          <button className="lg:hidden p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground">
            <Menu className="h-5 w-5" />
          </button>
          <a href="/">
            <img
              src="/brand/logo-reto-darkpurple.webp"
              alt="steps academy"
              className="h-32 -my-10"
            />
          </a>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-light text-muted-foreground hidden sm:block">Admin · UI Test</span>
          <button className="text-muted-foreground p-2">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="px-4 py-4 md:px-8 lg:px-10 max-w-7xl mx-auto">
        {/* Same layout structure as Admin.tsx */}
        <div className="lg:flex lg:gap-8 lg:items-start">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block w-44 shrink-0 border-r pr-4 pt-1 sticky top-20">
            <nav className="space-y-0.5">
              {NAV_ITEMS.map(item => (
                <button
                  key={item.value}
                  onClick={() => setActiveTab(item.value)}
                  className={cn(
                    "flex items-center gap-2.5 text-sm px-3 py-2 rounded-md w-full text-left transition-colors",
                    activeTab === item.value
                      ? "bg-[var(--theme-accent)]/15 text-[var(--theme-brand-on-bg)] font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                </button>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-4">
            <h2 className="text-lg font-bold">{NAV_ITEMS.find(i => i.value === activeTab)?.label}</h2>
            {/* Lots of dummy content to test sidebar stickiness while scrolling */}
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-muted/40 border flex items-center px-4 text-sm text-muted-foreground">
                Placeholder card {i + 1}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminUITest;
