import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) ?? "";
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? "";

type PageStatus = "loading" | "invalid" | "form" | "success";

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return value;
};

const Cadastro = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<PageStatus>("loading");

  // Form fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    validateToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const validateToken = async () => {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/validate-registration-token?token=${encodeURIComponent(token)}`,
        {
          headers: {
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            apikey: SUPABASE_ANON_KEY,
          },
        }
      );
      const data = await res.json();
      setStatus(data.valid ? "form" : "invalid");
    } catch {
      setStatus("invalid");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (password.length < 8) {
      setErrorMsg("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("As senhas não conferem.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          phone,
          role: "student",
          pending_activation: true,
        },
      },
    });
    setSubmitting(false);

    if (error) {
      const msg = error.message ?? "";
      if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("already been registered")) {
        setErrorMsg("Este e-mail já está cadastrado. Tente fazer login.");
      } else if (msg.toLowerCase().includes("signup") && msg.toLowerCase().includes("disabled")) {
        setErrorMsg("Cadastro desabilitado no momento. Entre em contato com o professor.");
      } else if (msg.toLowerCase().includes("password")) {
        setErrorMsg("Senha inválida: " + msg);
      } else {
        // Show raw error for debugging
        setErrorMsg("Erro: " + msg);
      }
    } else {
      setStatus("success");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <img
            src="/brand/pwa-icon.webp"
            alt="steps academy"
            className="h-20 w-20 rounded-[22px] shadow-lg"
          />
        </div>

        {/* ── Loading ── */}
        {status === "loading" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Validando seu link de cadastro…</p>
          </div>
        )}

        {/* ── Invalid token ── */}
        {status === "invalid" && (
          <div className="text-center space-y-4 py-10">
            <div className="flex justify-center">
              <div className="rounded-full bg-destructive/10 p-4">
                <AlertCircle className="h-10 w-10 text-destructive" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-foreground">Link inválido ou expirado</h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
              Este link de cadastro é inválido ou expirou. Solicite um novo link ao seu professor.
            </p>
            <Link
              to="/login"
              className="inline-block text-sm text-primary hover:underline mt-2"
            >
              Ir para o login
            </Link>
          </div>
        )}

        {/* ── Registration form ── */}
        {status === "form" && (
          <div className="space-y-6">
            <div className="text-center space-y-1">
              <h1 className="text-2xl font-bold text-foreground">Criar conta</h1>
              <p className="text-sm text-muted-foreground font-light">
                Preencha os dados abaixo para começar
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Nome */}
              <div className="space-y-2">
                <Label htmlFor="name">Nome completo</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome completo"
                  required
                  autoComplete="name"
                />
              </div>

              {/* E-mail */}
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  autoComplete="email"
                />
              </div>

              {/* Telefone */}
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone (WhatsApp)</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  placeholder="(21) 99999-9999"
                  required
                  autoComplete="tel"
                />
              </div>

              {/* Senha */}
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    required
                    className="pr-10"
                    autoComplete="new-password"
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

              {/* Confirmar senha */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar senha</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a senha"
                    required
                    className="pr-10"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {errorMsg && (
                <p className="text-sm text-destructive font-medium">{errorMsg}</p>
              )}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Criando conta…
                  </>
                ) : (
                  "Criar conta"
                )}
              </Button>
            </form>

            <p className="text-center text-xs text-muted-foreground">
              Já tem conta?{" "}
              <Link to="/login" className="text-primary hover:underline">
                Fazer login
              </Link>
            </p>
          </div>
        )}

        {/* ── Success ── */}
        {status === "success" && (
          <div className="text-center space-y-4 py-10">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-500/10 p-4">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-foreground">Cadastro realizado!</h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
              Verifique seu e-mail para confirmar sua conta. Após a confirmação, aguarde a
              ativação pelo seu professor para acessar a plataforma.
            </p>
            <Link
              to="/login"
              className="inline-block text-sm text-primary hover:underline mt-2"
            >
              Ir para o login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default Cadastro;
