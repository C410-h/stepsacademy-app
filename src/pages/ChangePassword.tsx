import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Eye, EyeOff } from "lucide-react";

const ChangePassword = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Senha muito curta", description: "Use pelo menos 6 caracteres.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "As senhas não coincidem", description: "Verifique e tente novamente.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { data: { user: currentUser }, error } = await supabase.auth.updateUser({
      password,
      // Set to null (not just false) to fully remove the key from user_metadata
      data: { must_change_password: null },
    });
    if (!error && currentUser) {
      // DB update is best-effort; the JWT metadata (above) drives the redirect.
      const [profileRes] = await Promise.all([
        (supabase as any)
          .from("profiles")
          .update({ force_password_change: false })
          .eq("id", currentUser.id),
        (supabase as any).from("admin_notifications").insert({
          type: "password_changed",
          user_id: currentUser.id,
          user_name: currentUser.user_metadata?.name ?? null,
          user_email: currentUser.email ?? null,
        }),
      ]);
      if (profileRes?.error) {
        console.warn("ChangePassword: could not clear force_password_change flag", profileRes.error);
      }

      // Send push notification to admin (best-effort)
      supabase.functions.invoke("notify-admin-push", {
        body: {
          title: "Senha criada 🔑",
          body: `${currentUser.user_metadata?.name ?? currentUser.email} criou a senha de acesso.`,
          url: "/admin",
        },
      }).catch(() => {/* non-blocking */});
    }
    setLoading(false);
    if (error) {
      toast({ title: "Erro", description: "Não foi possível salvar a senha.", variant: "destructive" });
    } else {
      toast({ title: "Senha criada!", description: "Bem-vindo à steps academy." });
      // Full reload so AuthContext re-fetches the updated profile (force_password_change = false)
      window.location.replace("/");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <img src="/brand/logo-over-darkpurple.webp" alt="steps academy" className="h-16 mx-auto" />
          <p className="mt-2 text-sm text-muted-foreground font-light">Crie sua senha de acesso</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Nova senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="pr-10"
              />
              <button
                type="button"
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmar senha</Label>
            <div className="relative">
              <Input
                id="confirm"
                type={showConfirm ? "text" : "password"}
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                className="pr-10"
              />
              <button
                type="button"
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowConfirm((v) => !v)}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Salvando..." : "Salvar senha"}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ChangePassword;
