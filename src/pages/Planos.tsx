import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Check, ArrowLeft, ArrowRight, Copy } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface Plan {
  id: string;
  name: string;
  price_cents: number;
  billing_cycle: string; // 'monthly' | 'quarterly' | 'semiannual'
  features: string[]; // JSONB array
  active: boolean;
  order_index: number;
}

const cycleLabel: Record<string, string> = {
  monthly: "por mês",
  quarterly: "a cada 3 meses",
  semiannual: "a cada 6 meses",
};

const Planos = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState(1); // 1, 2, 3

  // Step 1 form
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [idioma, setIdioma] = useState("");

  // Step 2
  const [payMethod, setPayMethod] = useState<"pix" | "card" | "boleto">("pix");
  const [cardNum, setCardNum] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { loadPlans(); }, []);

  const loadPlans = async () => {
    const { data } = await (supabase as any)
      .from("payment_plans")
      .select("id, name, price_cents, billing_cycle, features, active, order_index")
      .eq("active", true)
      .order("order_index");
    setPlans(data || []);
    setLoading(false);
  };

  const openModal = (plan: Plan) => {
    setSelectedPlan(plan);
    setStep(1);
    setNome(""); setEmail(""); setWhatsapp(""); setIdioma("");
    setPayMethod("pix");
    setCardNum(""); setCardName(""); setCardExp(""); setCardCvv("");
    setDialogOpen(true);
  };

  const handleStep1Next = () => {
    if (!nome.trim() || !email.trim() || !whatsapp.trim() || !idioma) {
      toast({ title: "Preencha todos os campos.", variant: "destructive" });
      return;
    }
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!selectedPlan) return;
    setSubmitting(true);
    try {
      await (supabase as any).from("payments").insert({
        plan_id: selectedPlan.id,
        amount_cents: selectedPlan.price_cents,
        status: "pending",
        payment_method: payMethod,
        lead_name: nome,
        lead_email: email,
        lead_whatsapp: whatsapp,
        lead_language: idioma,
        created_at: new Date().toISOString(),
      });
      setStep(3);
    } catch {
      toast({ title: "Erro ao registrar. Tente novamente.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const copyPix = () => {
    navigator.clipboard.writeText("steps.academy@pix.example.com").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const formatPrice = (cents: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

  return (
    <div className="min-h-screen" style={{ background: "#15012A", fontFamily: "'Libre Franklin', sans-serif" }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 h-[60px] border-b" style={{ borderColor: "rgba(255,255,255,.08)" }}>
        <Link to="/" className="text-lg font-black" style={{ color: "#C1FE00" }}>steps academy</Link>
        <Link to="/login" className="text-sm font-light text-white/60 hover:text-white transition-colors">Já tenho conta →</Link>
      </nav>

      {/* Header */}
      <div className="text-center py-14 px-6 space-y-3">
        <h1 className="text-4xl font-black text-white">escolha seu plano</h1>
        <p className="text-sm font-light text-white/60">sem taxa de matrícula · cancele quando quiser</p>
      </div>

      {/* Plans grid */}
      {loading ? (
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-5 pb-16">
          {[1,2,3].map(i => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      ) : (
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-5 pb-16">
          {plans.map(plan => {
            const isFeatured = plan.order_index === 3;
            return (
              <div key={plan.id} className={cn(
                "relative rounded-2xl p-6 space-y-5 flex flex-col",
                isFeatured
                  ? "border-2 scale-[1.03]"
                  : "border border-white/10"
              )}
              style={{
                background: isFeatured ? "rgba(193,254,0,0.06)" : "rgba(255,255,255,0.04)",
                borderColor: isFeatured ? "#C1FE00" : undefined,
              }}>
                {isFeatured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-black" style={{ background: "#C1FE00", color: "#1D1D1B" }}>
                    Mais escolhido
                  </span>
                )}
                <div>
                  <p className="text-base font-bold text-white">{plan.name}</p>
                  <p className="text-3xl font-black text-white mt-1">{formatPrice(plan.price_cents)}</p>
                  <p className="text-xs text-white/50 font-light">{cycleLabel[plan.billing_cycle] || plan.billing_cycle}</p>
                </div>
                <ul className="space-y-2 flex-1">
                  {(plan.features || []).map((f: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-white/80">
                      <Check className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "#C1FE00" }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => openModal(plan)}
                  className="w-full font-bold rounded-xl"
                  style={isFeatured
                    ? { background: "#C1FE00", color: "#1D1D1B" }
                    : { background: "rgba(255,255,255,0.1)", color: "#fff" }
                  }
                >
                  Escolher plano
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && plans.length === 0 && (
        <div className="text-center py-20 text-white/60">
          <p className="text-lg font-bold">Planos em breve</p>
          <p className="text-sm mt-1 font-light">Entre em contato via WhatsApp para mais informações.</p>
        </div>
      )}

      {/* Enrollment Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md mx-auto" style={{ fontFamily: "'Libre Franklin', sans-serif" }}>
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {step === 1 && "Seus dados"}
              {step === 2 && "Pagamento"}
              {step === 3 && "Tudo certo! 🎉"}
            </DialogTitle>
          </DialogHeader>

          {/* Step indicator */}
          {step < 3 && (
            <div className="flex items-center gap-2 mb-2">
              {[1,2].map(s => (
                <div key={s} className={cn("h-1.5 flex-1 rounded-full transition-all", step >= s ? "bg-primary" : "bg-muted")} />
              ))}
            </div>
          )}

          {/* Step 1 — Personal data */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl border bg-muted/40">
                <p className="text-xs font-bold">{selectedPlan?.name}</p>
                <p className="text-xs text-muted-foreground">{selectedPlan ? formatPrice(selectedPlan.price_cents) : ""} · {selectedPlan ? (cycleLabel[selectedPlan.billing_cycle] || "") : ""}</p>
              </div>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Nome completo</Label>
                  <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">E-mail</Label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">WhatsApp</Label>
                  <Input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="(11) 99999-9999" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Idioma de interesse</Label>
                  <Select value={idioma} onValueChange={setIdioma}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Inglês">Inglês</SelectItem>
                      <SelectItem value="Espanhol">Espanhol</SelectItem>
                      <SelectItem value="Libras">Libras</SelectItem>
                      <SelectItem value="Japonês">Japonês</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleStep1Next} className="w-full font-bold gap-2">
                Próximo <ArrowRight className="h-4 w-4" />
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Já tem conta?{" "}
                <Link to="/login" className="text-primary font-bold hover:underline">Entrar →</Link>
              </p>
            </div>
          )}

          {/* Step 2 — Payment (UI only) */}
          {step === 2 && (
            <div className="space-y-4">
              <Tabs value={payMethod} onValueChange={v => setPayMethod(v as any)}>
                <TabsList className="w-full">
                  <TabsTrigger value="pix" className="flex-1 text-xs">PIX</TabsTrigger>
                  <TabsTrigger value="card" className="flex-1 text-xs">Cartão</TabsTrigger>
                  <TabsTrigger value="boleto" className="flex-1 text-xs">Boleto</TabsTrigger>
                </TabsList>

                <TabsContent value="pix" className="space-y-3 pt-3">
                  {/* Placeholder QR */}
                  <div className="flex justify-center">
                    <div className="w-36 h-36 rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                      <div className="text-center space-y-1">
                        <p className="text-3xl">📱</p>
                        <p className="text-[10px] text-muted-foreground font-light">QR Code</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input readOnly value="steps.academy@pix.example.com" className="text-xs font-mono" />
                    <Button size="icon" variant="outline" onClick={copyPix}>
                      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground font-light text-center">
                    O pagamento via PIX será processado pelo Asaas após confirmação da matrícula.
                  </p>
                </TabsContent>

                <TabsContent value="card" className="space-y-3 pt-3">
                  <div>
                    <Label className="text-xs">Número do cartão</Label>
                    <Input value={cardNum} onChange={e => setCardNum(e.target.value)} placeholder="0000 0000 0000 0000" className="mt-1 font-mono" maxLength={19} />
                  </div>
                  <div>
                    <Label className="text-xs">Nome no cartão</Label>
                    <Input value={cardName} onChange={e => setCardName(e.target.value)} placeholder="NOME COMPLETO" className="mt-1 uppercase" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Validade</Label>
                      <Input value={cardExp} onChange={e => setCardExp(e.target.value)} placeholder="MM/AA" className="mt-1 font-mono" maxLength={5} />
                    </div>
                    <div>
                      <Label className="text-xs">CVV</Label>
                      <Input value={cardCvv} onChange={e => setCardCvv(e.target.value)} placeholder="123" className="mt-1 font-mono" maxLength={4} type="password" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground font-light">
                    Os dados do cartão serão processados com segurança via Asaas após confirmação.
                  </p>
                </TabsContent>

                <TabsContent value="boleto" className="space-y-3 pt-3">
                  <div className="p-4 rounded-xl border bg-muted/40 space-y-2 text-center">
                    <p className="text-3xl">🧾</p>
                    <p className="text-sm font-bold">Boleto bancário</p>
                    <p className="text-xs text-muted-foreground font-light">
                      O boleto será gerado após confirmação da matrícula e tem vencimento em 3 dias úteis.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)} className="gap-2 flex-1">
                  <ArrowLeft className="h-4 w-4" /> Voltar
                </Button>
                <Button onClick={handleSubmit} disabled={submitting} className="flex-1 font-bold gap-2 bg-primary">
                  {submitting ? "Aguarde..." : "Confirmar"} {!submitting && <ArrowRight className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3 — Success */}
          {step === 3 && (
            <div className="text-center space-y-5 py-4">
              <div className="w-16 h-16 rounded-full bg-lime/20 flex items-center justify-center mx-auto">
                <Check className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-2">
                <p className="font-bold text-lg">Interesse registrado!</p>
                <p className="text-sm text-muted-foreground font-light">
                  Nossa equipe entrará em contato em até 24h para confirmar sua matrícula e processar o pagamento.
                </p>
              </div>
              <div className="p-3 rounded-xl border bg-muted/40 text-left space-y-1">
                <p className="text-xs font-bold">{selectedPlan?.name}</p>
                <p className="text-xs text-muted-foreground">{nome} · {email}</p>
                <p className="text-xs text-muted-foreground">{idioma} · {payMethod.toUpperCase()}</p>
              </div>
              <Button onClick={() => setDialogOpen(false)} className="w-full font-bold">
                Concluir
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Planos;
