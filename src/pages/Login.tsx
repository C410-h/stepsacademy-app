import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Eye, EyeOff } from "lucide-react";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao entrar", description: "E-mail ou senha incorretos. Tente novamente.", variant: "destructive" });
    } else {
      navigate("/");
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: "Informe seu e-mail", description: "Digite o e-mail cadastrado para redefinir a senha.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Erro", description: "Não foi possível enviar o e-mail. Tente novamente.", variant: "destructive" });
    } else {
      toast({ title: "E-mail enviado!", description: "Verifique sua caixa de entrada para redefinir a senha." });
      setForgotMode(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left — Login Form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-background">
        <div className="w-full max-w-sm space-y-8">
          {/* Logo visible on mobile only */}
          <div className="text-center md:hidden">
            <img src="/brand/logo-over-darkpurple.webp" alt="steps academy" className="h-16 mx-auto" />
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-bold font-heading text-foreground">
              {forgotMode ? "Redefinir senha" : "Bem-vindo de volta"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground font-light">
              {forgotMode ? "Informe seu e-mail para receber o link" : "Entre na sua conta para continuar"}
            </p>
          </div>

          <form onSubmit={forgotMode ? handleForgotPassword : handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {!forgotMode && (
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
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
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Aguarde..." : forgotMode ? "Enviar link" : "Entrar"}
            </Button>
          </form>

          <div className="text-center">
            <button
              onClick={() => setForgotMode(!forgotMode)}
              className="text-sm text-primary hover:underline font-light"
            >
              {forgotMode ? "Voltar ao login" : "Esqueci minha senha"}
            </button>
          </div>
        </div>
      </div>

      {/* Right — Brand Banner (desktop only) */}
      <div
        className="hidden md:flex flex-1 relative overflow-hidden items-center justify-center"
        style={{ background: "linear-gradient(135deg, #520A70 0%, #15012A 100%)" }}
      >
        {/* Decorative SVG curves */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 600 800"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M-50,200 Q150,100 300,250 T650,200"
            fill="none"
            stroke="#C1FE00"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.2"
          />
          <path
            d="M-50,400 Q200,300 350,450 T700,380"
            fill="none"
            stroke="#C1FE00"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.12"
          />
          <path
            d="M-50,600 Q100,500 300,650 T700,550"
            fill="none"
            stroke="#ff1f9f"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.15"
          />
        </svg>

        <div className="relative z-10 flex flex-col items-center gap-8 px-10">
          <img
            src="/brand/logo-over-lime.webp"
            alt="steps academy"
            className="h-16"
          />
          <img
            src="/steppie/steppie-orgulhoso.svg"
            alt=""
            aria-hidden="true"
            className="h-52"
            style={{ animation: "steppieFloat 3s ease-in-out infinite" }}
          />
          <p
            className="text-center text-lg font-light max-w-xs"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            Do zero à fluência,<br />com método e aulas ao vivo.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
