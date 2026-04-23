import { useEffect, useState } from "react";
import { LockKeyholeIcon, MessageCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { differenceInDays } from "date-fns";

const AcessoSuspensoPage = () => {
  const { profile } = useAuth();
  const [diasOverdue, setDiasOverdue] = useState(0);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    (supabase as any)
      .from("students")
      .select("overdue_since")
      .eq("user_id", profile.id)
      .maybeSingle()
      .then(({ data }: { data: { overdue_since: string | null } | null }) => {
        if (data?.overdue_since) {
          setDiasOverdue(differenceInDays(new Date(), new Date(data.overdue_since)));
        }
      });
  }, [profile?.id]);

  const handleAlreadyPaid = async () => {
    setChecking(true);
    // Recarrega a página — ProtectedRoute irá re-checar o payment_status
    window.location.reload();
  };

  const whatsappUrl = `https://wa.me/5521969260979?text=${encodeURIComponent("Olá, meu acesso está suspenso e gostaria de regularizar minha situação.")}`;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-6 text-center">

        {/* Logo */}
        <div className="flex justify-center mb-2">
          <img
            src="/brand/pwa-icon.webp"
            alt="steps academy"
            className="h-14 w-14 rounded-[16px] shadow"
          />
        </div>

        {/* Ícone de bloqueio */}
        <div className="flex justify-center">
          <div className="rounded-full bg-destructive/10 p-5">
            <LockKeyholeIcon className="h-12 w-12 text-destructive" />
          </div>
        </div>

        {/* Título e subtítulo */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Acesso suspenso</h1>
          {diasOverdue > 0 ? (
            <p className="text-sm text-muted-foreground">
              Seu pagamento está em atraso há{" "}
              <span className="font-bold text-destructive">
                {diasOverdue} {diasOverdue === 1 ? "dia" : "dias"}
              </span>.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Seu acesso foi suspenso por inadimplência.
            </p>
          )}
        </div>

        {/* Card explicativo */}
        <Card>
          <CardContent className="pt-5 pb-5 space-y-3 text-left">
            <p className="text-sm font-bold">O que aconteceu?</p>
            <p className="text-sm text-muted-foreground font-light leading-relaxed">
              Identificamos um pagamento em aberto na sua conta. Para continuar acessando
              a plataforma e suas aulas, é necessário regularizar sua assinatura via PIX.
            </p>
            <p className="text-sm text-muted-foreground font-light leading-relaxed">
              Após o pagamento, seu acesso será restaurado automaticamente em até <strong>1 hora</strong>.
            </p>
          </CardContent>
        </Card>

        {/* Botões de ação */}
        <div className="space-y-3">
          <Button
            className="w-full font-bold"
            variant="outline"
            onClick={handleAlreadyPaid}
            disabled={checking}
          >
            {checking
              ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Verificando…</>
              : <><RefreshCw className="h-4 w-4 mr-2" /> Já regularizei — Verificar acesso</>
            }
          </Button>

          <Button variant="ghost" className="w-full" asChild>
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-4 w-4 mr-2" />
              Falar com suporte
            </a>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Se você acredita que isso é um erro, entre em contato com o suporte.
        </p>
      </div>
    </div>
  );
};

export default AcessoSuspensoPage;
