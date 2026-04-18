import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PAYMENT_ENABLED } from "@/lib/featureFlags";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { differenceInDays } from "date-fns";
import { AlertTriangle, CheckCircle2, Clock, RefreshCw } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SubscriptionRow {
  id: string;
  student_id: string;
  plan_id: string;
  billing_type: string;
  payment_method: string;
  amount_cents: number | null;
  status: string;
  next_due_date: string | null;
  ends_at: string | null;
  student_name: string;
  plan_name: string;
  plan_frequency: number;
}

interface OverdueStudentRow {
  id: string;
  user_id: string;
  payment_status: string;
  overdue_since: string | null;
  name: string;
}

interface PaymentHistoryRow {
  id: string;
  amount_cents: number;
  status: string;
  payment_method: string;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
}

interface StudentOption {
  id: string;
  name: string;
}

interface AlertRow {
  type: "ending_soon" | "payment_failed";
  label: string;
  detail: string;
  created_at?: string;
}

const formatCents = (cents: number | null) =>
  cents != null
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100)
    : "—";

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: "Ativo", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    overdue: { label: "Inadimplente", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
    suspended: { label: "Suspenso", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
    cancelled: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
    pending: { label: "Pendente", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  };
  const entry = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", entry.className)}>
      {entry.label}
    </span>
  );
};

// ── Subscriptions Sub-tab ──────────────────────────────────────────────────────

const SubscriptionsTab = ({ overdueCount }: { overdueCount: number }) => {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [history, setHistory] = useState<PaymentHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedStudentName, setSelectedStudentName] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("subscriptions")
      .select(`
        id, student_id, plan_id, billing_type, payment_method, amount_cents, status, next_due_date, ends_at,
        students!subscriptions_student_id_fkey(
          user_id,
          profiles!students_user_id_fkey(name)
        ),
        payment_plans!subscriptions_plan_id_fkey(name, frequency)
      `)
      .order("created_at", { ascending: false });

    if (data) {
      setRows(
        data.map((r: any) => ({
          id: r.id,
          student_id: r.student_id,
          plan_id: r.plan_id,
          billing_type: r.billing_type,
          payment_method: r.payment_method,
          amount_cents: r.amount_cents,
          status: r.status,
          next_due_date: r.next_due_date,
          ends_at: r.ends_at,
          student_name: r.students?.profiles?.name ?? "—",
          plan_name: r.payment_plans?.name ?? "—",
          plan_frequency: r.payment_plans?.frequency ?? 0,
        }))
      );
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openHistory = async (studentId: string, studentName: string) => {
    setSelectedStudentId(studentId);
    setSelectedStudentName(studentName);
    setSheetOpen(true);
    setHistoryLoading(true);
    const { data } = await (supabase as any)
      .from("payments")
      .select("id, amount_cents, status, payment_method, due_date, paid_at, created_at")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });
    setHistory(data || []);
    setHistoryLoading(false);
  };

  const filtered = rows.filter(r => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="overdue">Inadimplente</SelectItem>
            <SelectItem value="suspended">Suspenso</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={load} className="h-8 text-xs gap-1">
          <RefreshCw className="h-3 w-3" /> Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground font-light">
            Nenhuma assinatura encontrada.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <Card
              key={row.id}
              className="cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => openHistory(row.student_id, row.student_name)}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{row.student_name}</p>
                    <p className="text-xs text-muted-foreground font-light">
                      {row.plan_frequency}x/semana · PIX · {row.billing_type === "MONTHLY" ? "Mensal" : "Semestral"}
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-sm font-bold">{formatCents(row.amount_cents)}</p>
                    {statusBadge(row.status)}
                  </div>
                </div>
                {row.next_due_date && (
                  <p className="text-[10px] text-muted-foreground mt-1 font-light">
                    Próx. vencimento: {new Date(row.next_due_date).toLocaleDateString("pt-BR")}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* History Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Histórico — {selectedStudentName}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {historyLoading ? (
              [1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8 font-light">Nenhum pagamento registrado.</p>
            ) : (
              history.map(p => (
                <Card key={p.id}>
                  <CardContent className="py-3 px-4 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold">{formatCents(p.amount_cents)}</p>
                      {statusBadge(p.status)}
                    </div>
                    <p className="text-xs text-muted-foreground font-light">
                      PIX{p.due_date ? ` · Venc. ${new Date(p.due_date).toLocaleDateString("pt-BR")}` : ""}
                    </p>
                    {p.paid_at && (
                      <p className="text-xs text-green-600 font-light">
                        Pago em {new Date(p.paid_at).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

// ── Overdue Sub-tab ────────────────────────────────────────────────────────────

const OverdueTab = ({ onCountUpdate }: { onCountUpdate: (n: number) => void }) => {
  const [rows, setRows] = useState<OverdueStudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("students")
      .select(`
        id, user_id, payment_status, overdue_since,
        profiles!students_user_id_fkey(name)
      `)
      .in("payment_status", ["overdue", "suspended"])
      .order("overdue_since", { ascending: true });

    const mapped: OverdueStudentRow[] = (data || []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      payment_status: r.payment_status,
      overdue_since: r.overdue_since,
      name: r.profiles?.name ?? "—",
    }));
    setRows(mapped);
    onCountUpdate(mapped.length);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markAsPaid = async (studentId: string) => {
    setMarking(studentId);
    const { error } = await (supabase as any)
      .from("students")
      .update({ payment_status: "active", overdue_since: null })
      .eq("id", studentId);

    if (error) {
      toast({ title: "Erro ao atualizar status.", variant: "destructive" });
    } else {
      toast({ title: "Status atualizado para ativo." });
      await load();
    }
    setMarking(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground font-light">
          {rows.length} {rows.length === 1 ? "aluno" : "alunos"} com pagamento em atraso
        </p>
        <Button size="sm" variant="outline" onClick={load} className="h-8 text-xs gap-1">
          <RefreshCw className="h-3 w-3" /> Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground font-light">Nenhum aluno inadimplente. Ótimo!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map(row => {
            const dias = row.overdue_since
              ? differenceInDays(new Date(), new Date(row.overdue_since))
              : null;

            return (
              <Card key={row.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{row.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {dias !== null && (
                          <span className={cn(
                            "text-xs font-bold",
                            dias > 5 ? "text-destructive" : "text-yellow-600"
                          )}>
                            {dias} {dias === 1 ? "dia" : "dias"} em atraso
                          </span>
                        )}
                        {statusBadge(row.payment_status)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs shrink-0"
                      disabled={marking === row.id}
                      onClick={() => markAsPaid(row.id)}
                    >
                      {marking === row.id ? "Salvando…" : "Marcar como pago"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Custom Plan Sub-tab ────────────────────────────────────────────────────────

const CustomPlanTab = () => {
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [frequency, setFrequency] = useState("2");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (supabase as any)
      .from("students")
      .select("id, profiles!students_user_id_fkey(name)")
      .then(({ data }: any) => {
        if (data) {
          setStudents(
            data.map((s: any) => ({ id: s.id, name: s.profiles?.name ?? "—" }))
          );
        }
        setStudentsLoading(false);
      });
  }, []);

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!selectedStudentId || !monthlyAmount) {
      toast({ title: "Preencha todos os campos.", variant: "destructive" });
      return;
    }

    const cents = Math.round(parseFloat(monthlyAmount.replace(",", ".")) * 100);
    if (isNaN(cents) || cents <= 0) {
      toast({ title: "Valor inválido.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      // Criar plano personalizado no banco
      const { data: planData } = await (supabase as any)
        .from("payment_plans")
        .insert({
          name: `Personalizado ${frequency}x/semana`,
          frequency: parseInt(frequency),
          price_cents: cents,
          is_active: true,
          is_custom: true,
        })
        .select("id")
        .single();

      if (!planData?.id) throw new Error("Erro ao criar plano");

      // Buscar dados do aluno para criar cobrança no Woovi (CPF em profiles)
      const { data: studentData } = await (supabase as any)
        .from("students")
        .select("id, user_id")
        .eq("id", selectedStudentId)
        .single();

      const { data: profileData } = await (supabase as any)
        .from("profiles")
        .select("name, phone, cpf")
        .eq("id", studentData?.user_id)
        .single();

      // Chamar Edge Function create-payment
      if (profileData?.cpf && profileData?.name) {
        const authData = await supabase.auth.getSession();
        const token = authData.data.session?.access_token;

        await supabase.functions.invoke("create-payment", {
          body: {
            student_id: selectedStudentId,
            nome: profileData.name,
            cpf: profileData.cpf,
            email: authData.data.session?.user?.email ?? "",
            phone: profileData.phone ?? "",
            billing_type: "MONTHLY",
            amount_cents: cents,
            plan_id: planData.id,
            frequency_per_week: parseInt(frequency),
          },
        });
      } else {
        // Fallback: criar assinatura manualmente sem Woovi (CPF não cadastrado)
        await (supabase as any).from("subscriptions").insert({
          student_id: selectedStudentId,
          plan_id: planData.id,
          billing_type: "MONTHLY",
          payment_method: "PIX",
          amount_cents: cents,
          status: "pending",
        });
      }

      toast({ title: "Plano personalizado criado!", description: "Cobrança gerada no Woovi." });
      setSelectedStudentId("");
      setMonthlyAmount("");
      setFrequency("2");
    } catch {
      toast({ title: "Erro ao criar plano.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold">Novo plano personalizado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Student search */}
          <div className="space-y-1.5">
            <Label className="text-xs">Aluno</Label>
            {studentsLoading ? (
              <Skeleton className="h-9 rounded-md" />
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="Buscar aluno..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="h-8 text-xs"
                />
                <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione o aluno" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredStudents.map(s => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label className="text-xs">Valor mensal (R$)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="Ex: 480.00"
              value={monthlyAmount}
              onChange={e => setMonthlyAmount(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          {/* Frequency */}
          <div className="space-y-1.5">
            <Label className="text-xs">Frequência (aulas/semana)</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map(f => (
                  <SelectItem key={f} value={String(f)} className="text-xs">{f}x por semana</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground font-light flex items-center gap-1">
            Método de pagamento: <strong>PIX</strong>
          </p>

          <Button className="w-full font-bold" onClick={handleCreate} disabled={saving}>
            {saving ? "Criando…" : "Criar plano personalizado"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

// ── Alerts Sub-tab ─────────────────────────────────────────────────────────────

const AlertsTab = () => {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const allAlerts: AlertRow[] = [];

      // Semestrais terminando em 30 dias
      const in30 = new Date();
      in30.setDate(in30.getDate() + 30);

      const { data: endingSoon } = await (supabase as any)
        .from("subscriptions")
        .select(`
          id, ends_at,
          students!subscriptions_student_id_fkey(
            profiles!students_user_id_fkey(name)
          )
        `)
        .eq("billing_type", "SEMIANNUAL")
        .not("ends_at", "is", null)
        .lte("ends_at", in30.toISOString().split("T")[0])
        .in("status", ["active", "pending"]);

      (endingSoon || []).forEach((sub: any) => {
        const days = differenceInDays(new Date(sub.ends_at), new Date());
        allAlerts.push({
          type: "ending_soon",
          label: `Semestre terminando em ${days} ${days === 1 ? "dia" : "dias"}`,
          detail: sub.students?.profiles?.name ?? "Aluno desconhecido",
          created_at: sub.ends_at,
        });
      });

      // Falhas de pagamento nos últimos 3 dias (Woovi: PIX_AUTOMATIC_COBR_REJECTED)
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const { data: failed } = await (supabase as any)
        .from("payment_events")
        .select("id, event_type, processed_at, payload")
        .in("event_type", ["PIX_AUTOMATIC_COBR_REJECTED", "PIX_AUTOMATIC_REJECTED", "OPENPIX:CHARGE_EXPIRED"])
        .gte("processed_at", threeDaysAgo.toISOString());

      (failed || []).forEach((ev: any) => {
        allAlerts.push({
          type: "payment_failed",
          label: "Falha no pagamento",
          detail: ev.event_type,
          created_at: ev.processed_at,
        });
      });

      // Sort by date desc
      allAlerts.sort((a, b) =>
        new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      );

      setAlerts(allAlerts);
      setLoading(false);
    };

    load();
  }, []);

  return (
    <div className="space-y-3">
      {loading ? (
        [1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)
      ) : alerts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground font-light">Nenhum alerta no momento.</p>
          </CardContent>
        </Card>
      ) : (
        alerts.map((alert, idx) => (
          <Card key={idx} className={cn(
            "border-l-4",
            alert.type === "ending_soon" ? "border-l-yellow-500" : "border-l-destructive"
          )}>
            <CardContent className="py-3 px-4 space-y-1">
              <div className="flex items-start gap-2">
                {alert.type === "ending_soon" ? (
                  <Clock className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-bold">{alert.label}</p>
                  <p className="text-xs text-muted-foreground font-light truncate">{alert.detail}</p>
                  {alert.type === "ending_soon" && (
                    <p className="text-xs text-muted-foreground font-light mt-1">
                      Ação sugerida: entrar em contato para renovação semestral.
                    </p>
                  )}
                  {alert.type === "payment_failed" && (
                    <p className="text-xs text-muted-foreground font-light mt-1">
                      Ação sugerida: verificar situação do aluno e reenviar cobrança via Woovi.
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────

// ── Overlay "Em breve" para sub-abas que dependem do gateway ─────────────────

const ComingSoonOverlay = ({ children }: { children: React.ReactNode }) => (
  <div className="relative">
    <div className="opacity-50 pointer-events-none select-none">
      {children}
    </div>
    <div className="absolute inset-0 flex items-start justify-center pt-16">
      <span className="px-4 py-1.5 rounded-full text-xs font-bold bg-muted text-muted-foreground border">
        Em breve
      </span>
    </div>
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────────

const AdminPaymentsTab = () => {
  const [overdueCount, setOverdueCount] = useState(0);

  return (
    <div className="space-y-4">
      {/* Banner de aviso quando gateway não está ativo */}
      {!PAYMENT_ENABLED && (
        <div className="flex items-start gap-2 rounded-lg border border-muted-foreground/20 bg-muted/40 px-4 py-3">
          <span className="text-xs text-muted-foreground font-light leading-relaxed">
            <strong className="font-bold text-foreground">Gateway em configuração.</strong>{" "}
            Integração com Woovi disponível em breve. Inadimplentes e Alertas permanecem funcionais.
          </span>
        </div>
      )}

      <Tabs defaultValue="subscriptions" className="space-y-4">
        <TabsList className="w-full flex overflow-x-auto gap-1 h-auto p-1" style={{ justifyContent: "flex-start" }}>
          <TabsTrigger value="subscriptions" className="shrink-0 text-xs px-3 py-1.5">
            Assinaturas
          </TabsTrigger>
          <TabsTrigger value="overdue" className="shrink-0 text-xs px-3 py-1.5 relative">
            Inadimplentes
            {overdueCount > 0 && (
              <Badge className="ml-1.5 h-4 min-w-4 px-1 text-[10px] bg-destructive text-destructive-foreground">
                {overdueCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="custom" className="shrink-0 text-xs px-3 py-1.5">
            Plano personalizado
          </TabsTrigger>
          <TabsTrigger value="alerts" className="shrink-0 text-xs px-3 py-1.5">
            Alertas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="subscriptions">
          {PAYMENT_ENABLED
            ? <SubscriptionsTab overdueCount={overdueCount} />
            : <ComingSoonOverlay><SubscriptionsTab overdueCount={overdueCount} /></ComingSoonOverlay>
          }
        </TabsContent>

        <TabsContent value="overdue">
          {/* Inadimplentes: sempre funcional */}
          <OverdueTab onCountUpdate={setOverdueCount} />
        </TabsContent>

        <TabsContent value="custom">
          {PAYMENT_ENABLED
            ? <CustomPlanTab />
            : <ComingSoonOverlay><CustomPlanTab /></ComingSoonOverlay>
          }
        </TabsContent>

        <TabsContent value="alerts">
          {/* Alertas: sempre funcional */}
          <AlertsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPaymentsTab;
