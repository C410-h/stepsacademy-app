import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

/**
 * Short-link for the registration flow.
 * /r/:code → looks up token starting with :code → redirects to /cadastro?token=full-uuid
 * The short code is the first 8 chars of the token UUID — still unguessable, but shareable.
 */
export default function ShortLink() {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();

  useEffect(() => {
    if (!code) { navigate("/cadastro", { replace: true }); return; }

    (supabase as any)
      .from("registration_tokens")
      .select("token")
      .eq("active", true)
      .ilike("token", `${code}%`)
      .single()
      .then(({ data }: { data: { token: string } | null }) => {
        if (data?.token) {
          navigate(`/cadastro?token=${data.token}`, { replace: true });
        } else {
          navigate("/cadastro", { replace: true });
        }
      });
  }, [code, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
