import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Loader2, Copy, Check, QrCode,
  Eye, EyeOff, ChevronRight, ChevronLeft, RefreshCw, MessageCircle,
  CheckCircle2,
} from "lucide-react";
import { PAYMENT_ENABLED } from "@/lib/featureFlags";

// ── Formatadores ───────────────────────────────────────────────────────────────

const formatPhone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

const formatCPF = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

const formatCents = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface PaymentPlan {
  id: string;
  name: string;
  frequency: number;
  price_cents: number;
  semiannual_price_cents: number | null;
}

type BillingType = "MONTHLY" | "SEMIANNUAL";
type Step = 1 | 2 | 3 | 4;
type TokenStatus = "loading" | "valid" | "invalid";

const IDIOMAS = ["Inglês", "Espanhol"] as const;
type Idioma = typeof IDIOMAS[number];

const FREQUENCIAS = [1, 2, 3] as const;
type Frequencia = typeof FREQUENCIAS[number];

// ── Step Indicator ─────────────────────────────────────────────────────────────

const StepIndicator = ({ currentStep }: { currentStep: Step }) => {
  const steps = PAYMENT_ENABLED
    ? [
        { n: 1, label: "Dados" },
        { n: 2, label: "Plano" },
        { n: 3, label: "Conclusão" },
        { n: 4, label: "Pagamento" },
      ]
    : [
        { n: 1, label: "Dados" },
        { n: 2, label: "Plano" },
        { n: 3, label: "Conclusão" },
      ];

  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {steps.map((s, idx) => (
        <div key={s.n} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-all",
              currentStep > s.n ? "bg-primary text-primary-foreground"
                : currentStep === s.n ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                : "bg-muted text-muted-foreground"
            )}>
              {currentStep > s.n ? <Check className="h-4 w-4" /> : s.n}
            </div>
            <span className={cn(
              "text-[10px] mt-1 font-medium",
              currentStep === s.n ? "text-primary" : "text-muted-foreground"
            )}>
              {s.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div className={cn(
              "h-0.5 w-10 sm:w-16 mx-1 mb-4 transition-all",
              currentStep > s.n ? "bg-primary" : "bg-muted"
            )} />
          )}
        </div>
      ))}
    </div>
  );
};

// ── Página sem token ───────────────────────────────────────────────────────────

const NoTokenPage = () => (
  <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
    <div className="w-full max-w-sm text-center space-y-6">
      <img
        src="/brand/pwa-icon.webp"
        alt="steps academy"
        className="h-16 w-16 rounded-[18px] shadow-lg mx-auto"
      />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Cadastro por convite</h1>
        <p className="text-sm text-muted-foreground font-light leading-relaxed">
          O cadastro na Steps Academy é feito por convite.
          Entre em contato pelo WhatsApp para receber seu link de acesso.
        </p>
      </div>
      <Button className="w-full font-bold" asChild>
        <a
          href={`https://wa.me/5521969260979?text=${encodeURIComponent("Olá! Gostaria de me cadastrar na Steps Academy. Podem me enviar o link de acesso?")}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle className="h-4 w-4 mr-2" />
          Solicitar meu link de acesso
        </a>
      </Button>
      <p className="text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link to="/login" className="text-primary hover:underline font-bold">
          Fazer login
        </Link>
      </p>
    </div>
  </div>
);

// ── Componente principal ────────────────────────────────────────────────────────

const Cadastro = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [tokenStatus, setTokenStatus] = useState<TokenStatus>("loading");
  const [step, setStep] = useState<Step>(1);

  // Step 1 — dados pessoais (apenas coleta, sem DB)
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [step1Errors, setStep1Errors] = useState<Record<string, string>>({});

  // Step 2 — preferências de plano
  const [idioma, setIdioma] = useState<Idioma>("Inglês");
  const [frequencia, setFrequencia] = useState<Frequencia>(2);
  const [billingType, setBillingType] = useState<BillingType>("MONTHLY");

  // Plans (carregado apenas quando PAYMENT_ENABLED)
  const [plans, setPlans] = useState<PaymentPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);

  // Step 3 — criação da conta
  const [creating, setCreating] = useState(false);
  const [studentId, setStudentId] = useState<string | null>(null);

  // Step 4 — pagamento (apenas PAYMENT_ENABLED)
  const [paymentGenerating, setPaymentGenerating] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [brCode, setBrCode] = useState("");
  const [qrCodeImage, setQrCodeImage] = useState("");
  const [pixCopied, setPixCopied] = useState(false);

  // Plan derivado da frequência selecionada
  const selectedPlan = plans.find(p => p.frequency === frequencia) ?? null;

  const getPlanAmount = (): number => {
    if (!selectedPlan) return 0;
    if (billingType === "SEMIANNUAL") {
      return selectedPlan.semiannual_price_cents ?? selectedPlan.price_cents * 6;
    }
    return selectedPlan.price_cents;
  };

  // ── Validar token ao montar ────────────────────────────────────────────────

  useEffect(() => {
    if (!token) {
      setTokenStatus("invalid");
      return;
    }
    (supabase as any)
      .from("registration_tokens")
      .select("token")
      .eq("token", token)
      .eq("active", true)
      .single()
      .then(({ data }: { data: { token: string } | null }) => {
        setTokenStatus(data ? "valid" : "invalid");
      });
  }, [token]);

  // ── Carregar planos (apenas quando PAYMENT_ENABLED) ───────────────────────

  useEffect(() => {
    if (!PAYMENT_ENABLED) {
      setPlansLoading(false);
      return;
    }
    (supabase as any)
      .from("payment_plans")
      .select("id, name, frequency, price_cents, semiannual_price_cents")
      .eq("is_active", true)
      .eq("is_custom", false)
      .order("frequency", { ascending: true })
      .then(({ data }: { data: PaymentPlan[] | null }) => {
        if (data) setPlans(data);
        setPlansLoading(false);
      });
  }, []);

  // ── Gerar pagamento ao entrar no Step 4 ───────────────────────────────────

  const generatePayment = useCallback(async () => {
    if (!studentId || !selectedPlan) return;
    setPaymentGenerating(true);
    setPaymentError(null);
    setBrCode("");
    setQrCodeImage("");

    try {
      const { data, error } = await supabase.functions.invoke("create-payment", {
        body: {
          student_id: studentId,
          nome: name.trim(),
          cpf: cpf.replace(/\D/g, ""),
          email: email.trim(),
          phone: phone.replace(/\D/g, ""),
          billing_type: billingType,
          amount_cents: getPlanAmount(),
          plan_id: selectedPlan.id,
          frequency_per_week: frequencia,
          idioma,
        },
      });

      if (error || data?.error) {
        throw new Error(data?.error ?? error?.message ?? "Erro desconhecido");
      }

      setBrCode(data.brCode ?? "");
      setQrCodeImage(data.qrCodeImage ?? "");
    } catch (err: any) {
      console.error("[Cadastro] create-payment:", err.message);
      setPaymentError(err.message);
      toast({
        title: "Erro ao gerar PIX",
        description: "Tente novamente ou entre em contato com o suporte.",
        variant: "destructive",
      });
    } finally {
      setPaymentGenerating(false);
    }
  }, [studentId, selectedPlan, name, cpf, email, phone, billingType, frequencia, idioma]);

  useEffect(() => {
    if (step === 4) generatePayment();
  }, [step]);

  // ── Step 1: validação e avanço (sem DB) ───────────────────────────────────

  const validateStep1 = () => {
    const errors: Record<string, string> = {};
    if (!name.trim() || name.trim().split(" ").length < 2)
      errors.name = "Informe nome e sobrenome.";
    if (!email.includes("@")) errors.email = "E-mail inválido.";
    if (password.length < 8) errors.password = "Senha com no mínimo 8 caracteres.";
    if (phone.replace(/\D/g, "").length < 10) errors.phone = "WhatsApp inválido.";
    if (cpf.replace(/\D/g, "").length !== 11) errors.cpf = "CPF inválido.";
    return errors;
  };

  const handleStep1 = () => {
    const errors = validateStep1();
    if (Object.keys(errors).length > 0) { setStep1Errors(errors); return; }
    setStep1Errors({});
    setStep(2);
  };

  // ── Step 3: criar tudo de uma vez ─────────────────────────────────────────

  const handleCreateAccount = async () => {
    setCreating(true);
    try {
      // 1. Criar usuário no Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: name.trim(), phone, role: "student" } },
      });

      if (authError) {
        const msg = authError.message?.toLowerCase() ?? "";
        if (msg.includes("already registered") || msg.includes("already been registered")) {
          toast({ title: "E-mail já cadastrado.", description: "Tente fazer login.", variant: "destructive" });
        } else {
          toast({ title: "Erro ao criar conta", description: authError.message, variant: "destructive" });
        }
        return;
      }

      const uid = authData.user?.id;
      if (!uid) throw new Error("UID não retornado pelo Auth");

      // 2. Resolver language_id a partir do nome do idioma
      const { data: langData } = await (supabase as any)
        .from("languages")
        .select("id")
        .eq("name", idioma)
        .single();
      const languageId: string | null = langData?.id ?? null;

      // 3. Upsert perfil com CPF
      await (supabase as any).from("profiles").upsert({
        id: uid,
        name: name.trim(),
        phone,
        role: "student",
        cpf: cpf.replace(/\D/g, ""),
      });

      // 4. Inserir aluno com status 'active'
      const { data: studentData } = await (supabase as any)
        .from("students")
        .insert({
          user_id: uid,
          payment_status: "active",
          language_id: languageId,
          enrollment_date: new Date().toISOString(),
        })
        .select("id")
        .single();

      const newStudentId: string | null = studentData?.id ?? null;

      if (newStudentId) {
        setStudentId(newStudentId);

        // 5. Criar registro de gamificação
        await (supabase as any).from("student_gamification").insert({
          student_id: newStudentId,
          xp_total: 0,
          coins: 0,
          streak_current: 0,
          streak_best: 0,
        });
      }

      // 6. Invalidar token
      if (token) {
        await (supabase as any)
          .from("registration_tokens")
          .update({ active: false })
          .eq("token", token);
      }

      // 7. Avançar para pagamento (quando ativo) ou redirecionar
      if (PAYMENT_ENABLED && newStudentId && selectedPlan) {
        setStep(4);
      } else {
        toast({
          title: "Bem-vindo à Steps Academy! 🎉",
          description: "Sua conta foi criada. Bom estudo!",
        });
        navigate("/");
      }
    } catch (err: any) {
      console.error("[Cadastro] handleCreateAccount:", err.message);
      toast({ title: "Erro ao criar conta. Tente novamente.", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  // ── Step 4: helpers ────────────────────────────────────────────────────────

  const handleCopyPix = () => {
    if (!brCode) return;
    navigator.clipboard.writeText(brCode).then(() => {
      setPixCopied(true);
      setTimeout(() => setPixCopied(false), 3000);
    });
  };

  const handleSimulatePayment = async () => {
    if (!studentId) return;
    await (supabase as any)
      .from("students")
      .update({ payment_status: "active" })
      .eq("id", studentId);
    toast({ title: "Pagamento simulado! Acesso liberado." });
    navigate("/");
  };

  // ── Token: carregando ─────────────────────────────────────────────────────

  if (tokenStatus === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Sem token / token inválido ─────────────────────────────────────────────

  if (tokenStatus === "invalid") {
    return <NoTokenPage />;
  }

  // ── Formulário principal ───────────────────────────────────────────────────

  const planAmount = getPlanAmount();
  const semestralMensalidade = selectedPlan
    ? (selectedPlan.semiannual_price_cents ?? selectedPlan.price_cents * 6) / 6
    : 0;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 py-10">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img src="/brand/pwa-icon.webp" alt="steps academy" className="h-16 w-16 rounded-[18px] shadow-lg" />
        </div>

        <StepIndicator currentStep={step} />

        {/* ── STEP 1: Dados pessoais ──────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <h1 className="text-2xl font-bold">Criar sua conta</h1>
              <p className="text-sm text-muted-foreground font-light">Preencha seus dados pessoais</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome completo</Label>
                <Input id="name" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Seu nome completo" autoComplete="name" />
                {step1Errors.name && <p className="text-xs text-destructive">{step1Errors.name}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com" autoComplete="email" />
                {step1Errors.email && <p className="text-xs text-destructive">{step1Errors.email}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">WhatsApp</Label>
                <Input id="phone" type="tel" value={phone}
                  onChange={e => setPhone(formatPhone(e.target.value))}
                  placeholder="(11) 99999-9999" autoComplete="tel" />
                {step1Errors.phone && <p className="text-xs text-destructive">{step1Errors.phone}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cpf">CPF</Label>
                <Input id="cpf" inputMode="numeric" value={cpf}
                  onChange={e => setCpf(formatCPF(e.target.value))}
                  placeholder="000.000.000-00" maxLength={14} />
                {step1Errors.cpf && <p className="text-xs text-destructive">{step1Errors.cpf}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres" className="pr-10" autoComplete="new-password" />
                  <button type="button" tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(v => !v)}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {step1Errors.password && <p className="text-xs text-destructive">{step1Errors.password}</p>}
              </div>
            </div>

            <Button className="w-full font-bold" onClick={handleStep1}>
              Continuar <ChevronRight className="h-4 w-4 ml-1" />
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Já tem conta?{" "}
              <Link to="/login" className="text-primary hover:underline">Fazer login</Link>
            </p>
          </div>
        )}

        {/* ── STEP 2: Preferências de plano ──────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <h1 className="text-2xl font-bold">Seu plano de estudos</h1>
              <p className="text-sm text-muted-foreground font-light">
                {PAYMENT_ENABLED ? "Selecione idioma, frequência e modalidade" : "Selecione suas preferências"}
              </p>
            </div>

            {/* Idioma */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Idioma</p>
              <div className="grid grid-cols-2 gap-2">
                {IDIOMAS.map(id => (
                  <button key={id} onClick={() => setIdioma(id)}
                    className={cn(
                      "rounded-xl border-2 p-3 text-sm font-bold transition-all",
                      idioma === id
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    )}>
                    {id}
                  </button>
                ))}
              </div>
            </div>

            {/* Frequência */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Aulas por semana</p>
              <div className="grid grid-cols-3 gap-2">
                {FREQUENCIAS.map(f => (
                  <button key={f} onClick={() => setFrequencia(f)}
                    className={cn(
                      "rounded-xl border-2 p-3 text-sm font-bold transition-all",
                      frequencia === f
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    )}>
                    {f}x / semana
                  </button>
                ))}
              </div>
            </div>

            {/* Modalidade — somente quando payment habilitado */}
            {PAYMENT_ENABLED && (
              plansLoading ? (
                <Skeleton className="h-36 rounded-xl" />
              ) : !selectedPlan ? (
                <Card>
                  <CardContent className="py-6 text-center text-sm text-muted-foreground font-light">
                    Nenhum plano disponível para esta frequência.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Modalidade</p>

                  {/* Card Mensal */}
                  <button onClick={() => setBillingType("MONTHLY")}
                    className={cn(
                      "w-full text-left rounded-xl border-2 p-4 transition-all",
                      billingType === "MONTHLY" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 bg-card"
                    )}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-sm">Mensal</p>
                        <p className="text-xs text-muted-foreground font-light mt-0.5">PIX recorrente automático</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black text-primary">{formatCents(selectedPlan.price_cents)}</p>
                        <p className="text-xs text-muted-foreground font-light">/mês</p>
                      </div>
                    </div>
                    {billingType === "MONTHLY" && (
                      <div className="mt-2 flex items-center gap-1 text-primary">
                        <Check className="h-4 w-4" />
                        <span className="text-xs font-bold">Selecionado</span>
                      </div>
                    )}
                  </button>

                  {/* Card Semestral */}
                  <button onClick={() => setBillingType("SEMIANNUAL")}
                    className={cn(
                      "w-full text-left rounded-xl border-2 p-4 transition-all relative",
                      billingType === "SEMIANNUAL" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 bg-card"
                    )}>
                    <div className="absolute -top-2.5 left-4">
                      <Badge className="text-[10px] font-bold px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">
                        Melhor custo-benefício
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <div>
                        <p className="font-bold text-sm">Semestral</p>
                        <p className="text-xs text-muted-foreground font-light mt-0.5">
                          PIX à vista · equivale a {formatCents(semestralMensalidade)}/mês
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black text-primary">
                          {formatCents(selectedPlan.semiannual_price_cents ?? selectedPlan.price_cents * 6)}
                        </p>
                        <p className="text-xs text-green-600 font-bold">Economize 1 mês!</p>
                      </div>
                    </div>
                    {billingType === "SEMIANNUAL" && (
                      <div className="mt-2 flex items-center gap-1 text-primary">
                        <Check className="h-4 w-4" />
                        <span className="text-xs font-bold">Selecionado</span>
                      </div>
                    )}
                  </button>
                </div>
              )
            )}

            {/* Nota informativa quando payment desabilitado */}
            {!PAYMENT_ENABLED && (
              <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground font-light text-center">
                Nossa equipe irá preparar seu plano com base nessas preferências e entrar em contato para os próximos passos.
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <Button className="flex-1 font-bold" onClick={() => setStep(3)}>
                Continuar <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Conclusão — resumo + criar conta ───────────────── */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <h1 className="text-2xl font-bold">Confirme seus dados</h1>
              <p className="text-sm text-muted-foreground font-light">
                Revise as informações antes de criar sua conta
              </p>
            </div>

            <Card>
              <CardContent className="pt-5 pb-5 space-y-3">
                {[
                  { label: "Nome", value: name },
                  { label: "E-mail", value: email },
                  { label: "WhatsApp", value: phone },
                  { label: "Idioma", value: idioma },
                  { label: "Frequência", value: `${frequencia}x por semana` },
                  ...(PAYMENT_ENABLED ? [{ label: "Modalidade", value: billingType === "MONTHLY" ? "Mensal" : "Semestral" }] : []),
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start justify-between gap-2">
                    <span className="text-sm text-muted-foreground shrink-0">{label}</span>
                    <span className="text-sm font-bold text-right">{value}</span>
                  </div>
                ))}
                {PAYMENT_ENABLED && selectedPlan && (
                  <div className="flex items-start justify-between gap-2 pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Valor</span>
                    <span className="text-lg font-black text-primary">
                      {formatCents(planAmount)}
                      <span className="text-xs font-normal text-muted-foreground ml-1">
                        {billingType === "MONTHLY" ? "/mês" : " semestral"}
                      </span>
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Nota de acesso imediato quando payment desabilitado */}
            {!PAYMENT_ENABLED && (
              <div className="flex items-start gap-3 p-4 rounded-xl border bg-primary/5 border-primary/20">
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground font-light leading-relaxed">
                  Ao criar sua conta, o acesso será liberado imediatamente. Nossa equipe entrará em contato para os detalhes do seu plano.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <Button className="flex-1 font-bold" onClick={handleCreateAccount} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {creating ? "Criando conta…" : PAYMENT_ENABLED ? "Gerar PIX" : "Criar conta"}
                {!creating && <ChevronRight className="h-4 w-4 ml-1" />}
              </Button>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Ao criar sua conta você concorda com os{" "}
              <a href="/termos" target="_blank" rel="noopener noreferrer"
                className="text-primary hover:underline">Termos de Serviço</a>.
            </p>
          </div>
        )}

        {/* ── STEP 4: Pagamento PIX (somente PAYMENT_ENABLED) ────────── */}
        {step === 4 && PAYMENT_ENABLED && selectedPlan && (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <h1 className="text-2xl font-bold">Pagamento via PIX</h1>
              <p className="text-sm text-muted-foreground font-light">
                {formatCents(planAmount)}{billingType === "MONTHLY" ? "/mês" : " semestral (à vista)"}
              </p>
            </div>

            <Card>
              <CardContent className="pt-5 pb-5 space-y-4">

                {/* Gerando PIX... */}
                {paymentGenerating && (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground font-light">Gerando seu PIX…</p>
                  </div>
                )}

                {/* Erro ao gerar */}
                {paymentError && !paymentGenerating && (
                  <div className="space-y-3">
                    <p className="text-sm text-destructive text-center">Erro ao gerar PIX. Tente novamente.</p>
                    <Button variant="outline" className="w-full" onClick={generatePayment}>
                      <RefreshCw className="h-4 w-4 mr-2" /> Tentar novamente
                    </Button>
                  </div>
                )}

                {/* QR Code real */}
                {!paymentGenerating && !paymentError && (
                  <>
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <QrCode className="h-4 w-4 text-primary" /> Escaneie o QR Code ou copie a chave
                    </div>

                    <div className="flex justify-center">
                      {qrCodeImage ? (
                        <img
                          src={qrCodeImage}
                          alt="QR Code PIX"
                          className="h-44 w-44 rounded-xl border border-border object-contain"
                        />
                      ) : (
                        <div className="h-44 w-44 bg-muted rounded-xl flex items-center justify-center border-2 border-dashed border-border">
                          <QrCode className="h-20 w-20 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>

                    {brCode && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground font-light text-center">Chave PIX copia e cola</p>
                        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                          <code className="text-xs flex-1 truncate font-mono">{brCode}</code>
                          <button onClick={handleCopyPix}
                            className="shrink-0 text-primary hover:text-primary/80 transition-colors">
                            {pixCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                          </button>
                        </div>
                        <Button variant="outline" className="w-full" onClick={handleCopyPix}>
                          {pixCopied
                            ? <><Check className="h-4 w-4 mr-2 text-green-600" /> Copiado!</>
                            : <><Copy className="h-4 w-4 mr-2" /> Copiar chave PIX</>}
                        </Button>
                      </div>
                    )}

                    {/* Aguardando confirmação */}
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <p className="text-xs text-muted-foreground font-light">
                        Aguardando confirmação do pagamento…
                      </p>
                    </div>
                    <p className="text-xs text-center text-muted-foreground font-light">
                      Assim que seu pagamento for confirmado, seu acesso será liberado automaticamente.
                    </p>

                    {/* Botão de simulação — apenas em dev */}
                    {import.meta.env.DEV && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs text-muted-foreground border border-dashed"
                        onClick={handleSimulatePayment}
                      >
                        🧪 Simular confirmação (apenas dev)
                      </Button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <p className="text-xs text-center text-muted-foreground">
              Dúvidas?{" "}
              <a href="https://wa.me/5521969260979" target="_blank" rel="noopener noreferrer"
                className="text-primary hover:underline">
                Falar com suporte
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Cadastro;
