import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

/**
 * Vanity short-link for the registration flow.
 * /acesso → resolves the current active token → redirects to /cadastro?token=xxx
 * If no active token exists, redirects to /cadastro (shows the invite-only page).
 */
export default function Acesso() {
  const navigate = useNavigate();

  useEffect(() => {
    (supabase as any)
      .from("registration_tokens")
      .select("token")
      .eq("active", true)
      .single()
      .then(({ data }: { data: { token: string } | null }) => {
        if (data?.token) {
          navigate(`/cadastro?token=${data.token}`, { replace: true });
        } else {
          navigate("/cadastro", { replace: true });
        }
      });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
