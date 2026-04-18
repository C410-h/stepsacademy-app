import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const AuthCallback = () => {
  const navigate = useNavigate();
  const handled = useRef(false);

  const handleSession = async (session: Session) => {
    if (handled.current) return;
    handled.current = true;

    try {
      const uid = session.user.id;
      const providerToken = session.provider_token ?? null;
      const providerRefreshToken = session.provider_refresh_token ?? null;

      // Salvar tokens do Google no perfil (somente se recebidos)
      if (providerToken || providerRefreshToken) {
        await (supabase as any)
          .from("profiles")
          .update({
            ...(providerToken && { google_access_token: providerToken }),
            ...(providerRefreshToken && { google_refresh_token: providerRefreshToken }),
            // bigint: Unix timestamp em milissegundos (não ISO string)
            google_token_expires_at: Date.now() + 3600 * 1000,
          })
          .eq("id", uid);
      }

      // Buscar role para redirecionar corretamente
      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .single();

      if (profile?.role === "admin") {
        navigate("/admin", { replace: true });
      } else if (profile?.role === "teacher") {
        navigate("/teacher", { replace: true });
      } else {
        // Alunos e novos usuários: HomeRedirect trata o resto
        navigate("/", { replace: true });
      }
    } catch (err: any) {
      console.error("[AuthCallback]", err?.message);
      toast({
        title: "Erro ao conectar conta Google",
        description: "Não foi possível concluir o login. Tente novamente.",
        variant: "destructive",
      });
      navigate("/login", { replace: true });
    }
  };

  useEffect(() => {
    // Tenta pegar sessão já existente (código PKCE já processado pelo cliente)
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error("[AuthCallback] getSession error:", error.message);
        toast({
          title: "Erro ao conectar conta Google",
          description: "Sessão inválida. Tente novamente.",
          variant: "destructive",
        });
        navigate("/login", { replace: true });
        return;
      }
      if (session) {
        handleSession(session);
        return;
      }
      // Se ainda não há sessão, aguarda o evento SIGNED_IN do exchange de código
    });

    // Fallback: escuta o evento de auth caso o exchange ainda esteja em andamento
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        handleSession(session);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground font-light">
        Conectando sua conta Google…
      </p>
    </div>
  );
};

export default AuthCallback;
