import { useState } from "react";
import { UserCheck, Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ProfileStat {
  profile_id: string;
  name: string;
  completed: boolean;
  completedAt?: string;
  shown: number;
}

interface PushStat {
  student_id: string;
  name: string;
  subscribed: boolean;
  dismissed: number;
  lastDismissed?: string;
  shown: number;
}

interface Props {
  profileStats: ProfileStat[];
  pushStats: PushStat[];
}

const MODALS = [
  { key: "profile", label: "Perfil completo", icon: UserCheck },
  { key: "push",    label: "Push",            icon: Bell },
] as const;

type ModalKey = typeof MODALS[number]["key"];

const fmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "";

export function ModalViewersCard({ profileStats, pushStats }: Props) {
  const [active, setActive] = useState<ModalKey>("profile");

  const profileDone  = profileStats.filter(s => s.completed).length;
  const pushActive   = pushStats.filter(s => s.subscribed).length;

  const counts: Record<ModalKey, string> = {
    profile: `${profileDone}/${profileStats.length} completaram`,
    push:    `${pushActive}/${pushStats.length} ativaram`,
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-bold">Modais — visualizações</CardTitle>
          <div className="flex gap-1">
            {MODALS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActive(key)}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors",
                  active === key
                    ? "bg-[var(--theme-accent)]/15 text-[var(--theme-brand-on-bg)] font-medium"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{counts[active]}</p>
      </CardHeader>

      <CardContent className="pt-0">
        {active === "profile" && (
          <div className="divide-y text-sm">
            {profileStats.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum dado ainda.</p>
            ) : profileStats.map(s => (
              <div key={s.profile_id} className="flex items-center gap-3 py-2.5">
                <div className={cn("h-2 w-2 rounded-full shrink-0", s.completed ? "bg-green-500" : "bg-amber-400")} />
                <span className="flex-1 font-medium truncate">{s.name}</span>
                {s.completed ? (
                  <span className="text-xs text-green-600 font-medium shrink-0">Concluído {fmt(s.completedAt)}</span>
                ) : (
                  <span className="text-xs text-muted-foreground shrink-0">Viu {s.shown}× · aguardando</span>
                )}
              </div>
            ))}
          </div>
        )}

        {active === "push" && (
          <div className="divide-y text-sm">
            {pushStats.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum dado ainda.</p>
            ) : pushStats.map(s => (
              <div key={s.student_id} className="flex items-center gap-3 py-2.5">
                <div className={cn("h-2 w-2 rounded-full shrink-0", s.subscribed ? "bg-green-500" : "bg-amber-400")} />
                <span className="flex-1 font-medium truncate">{s.name}</span>
                {s.subscribed ? (
                  <span className="text-xs text-green-600 font-medium shrink-0">Ativo</span>
                ) : (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {s.dismissed > 0
                      ? `Recusou ${s.dismissed}× · ${fmt(s.lastDismissed)}`
                      : `Viu ${s.shown}× · sem resposta`}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
