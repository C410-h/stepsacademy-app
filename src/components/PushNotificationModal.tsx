import { useEffect, useState } from "react";
import { Bell, BellOff, Zap, Calendar, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { subscribeToPush, isPushSupported, isPushSubscribed } from "@/lib/pushNotifications";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "push_modal_dismissed_at";
const SNOOZE_DAYS = 7;

interface Props {
  studentId: string | null;
}

export default function PushNotificationModal({ studentId }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    if (!isPushSupported()) return;
    if (Notification.permission !== "default") return;

    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) {
      const daysSince = (Date.now() - Number(dismissed)) / (1000 * 60 * 60 * 24);
      if (daysSince < SNOOZE_DAYS) return;
    }

    // Check if already subscribed in the browser
    isPushSubscribed().then(subscribed => {
      if (!subscribed) {
        // Delay a few seconds so it doesn't pop immediately on load
        const t = setTimeout(() => {
          setOpen(true);
          // Log that the modal was shown
          if (studentId) {
            (supabase as any).from("push_prompt_log").insert({ student_id: studentId, event: "shown" });
          }
        }, 3000);
        return () => clearTimeout(t);
      }
    });
  }, [studentId]);

  const handleEnable = async () => {
    if (!studentId) return;
    setLoading(true);
    const success = await subscribeToPush(studentId);
    setLoading(false);
    if (success) {
      (supabase as any).from("push_prompt_log").insert({ student_id: studentId, event: "enabled" });
      setOpen(false);
    } else {
      // Permission denied by browser — don't show again
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
      (supabase as any).from("push_prompt_log").insert({ student_id: studentId, event: "dismissed" });
      setOpen(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    if (studentId) {
      (supabase as any).from("push_prompt_log").insert({ student_id: studentId, event: "dismissed" });
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-sm text-center gap-0 p-0 overflow-hidden"
        // Prevent closing by clicking outside or pressing ESC
        onPointerDownOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
        // Hide the default X button
        hideClose
      >
        {/* Top accent band */}
        <div className="h-1.5 w-full" style={{ background: "var(--theme-accent)" }} />

        <div className="px-6 pt-6 pb-7 space-y-5">
          {/* Icon */}
          <div
            className="mx-auto h-16 w-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 15%, transparent)" }}
          >
            <Bell className="h-8 w-8 text-primary" />
          </div>

          {/* Headline */}
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold leading-snug">
              Fique por dentro de tudo!
            </h2>
            <p className="text-sm text-muted-foreground font-light leading-relaxed">
              Ative as notificações para não perder nenhum aviso importante da sua jornada.
            </p>
          </div>

          {/* Benefits list */}
          <div className="space-y-2.5 text-left">
            <div className="flex items-start gap-3">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Calendar className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Lembretes de aula</p>
                <p className="text-xs text-muted-foreground font-light">Saiba quando sua próxima aula está agendada.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Avisos de falta</p>
                <p className="text-xs text-muted-foreground font-light">Seja avisado imediatamente se uma aula for marcada como falta.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Zap className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Novidades e conteúdos</p>
                <p className="text-xs text-muted-foreground font-light">Receba alertas quando novos materiais e exercícios forem publicados.</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-1">
            <Button
              className="w-full font-bold gap-2"
              style={{ background: "var(--theme-accent)", color: "var(--theme-text-on-accent)" }}
              onClick={handleEnable}
              disabled={loading}
            >
              <Bell className="h-4 w-4" />
              {loading ? "Ativando…" : "Ativar notificações"}
            </Button>
            <button
              onClick={handleDismiss}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              <BellOff className="h-3.5 w-3.5" />
              Agora não
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
