import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Camera, Pencil, Check, X, Zap, Flame, Trophy, Lock, ExternalLink, Mic, CreditCard, HelpCircle, ChevronRight, LogOut } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { PAYMENT_ENABLED } from "@/lib/featureFlags";
import { differenceInDays } from "date-fns";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { LanguageSwitcherList } from "@/components/LanguageSwitcher";
import {
  isPushSupported,
  isPushSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/pushNotifications";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProfileData {
  id: string;
  name: string;
  phone: string | null;
  avatar_url: string | null;
}

interface StudentInfo {
  id: string;
  enrollment_date: string | null;
  language: string | null;
  level_name: string | null;
  level_code: string | null;
}

interface Gamification {
  xp_total: number;
  coins: number;
  streak_current: number;
  streak_best: number;
}

interface BadgeItem {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  condition_type: string;
  condition_value: number;
  earned: boolean;
  earned_at: string | null;
}

interface CertItem {
  id: string;
  certificate_number: string;
  level_name: string;
  language_name: string;
  issued_at: string;
}

interface RecordingItem {
  id: string;
  step_id: string | null;
  audio_url: string;
  status: string;
  recorded_at: string;
  teacher_score: number | null;
  teacher_feedback: string | null;
  stepNumber: number | null;
}

interface SubscriptionInfo {
  id: string;
  billing_type: string;
  payment_method: string;
  amount_cents: number;
  status: string;
  next_due_date: string | null;
  ends_at: string | null;
  plan_frequency: number;
  plan_name: string;
}

interface StudentPaymentStatus {
  is_corporate: boolean;
  payment_status: string;
}

// ─── Inline editable field ───────────────────────────────────────────────────

interface EditableFieldProps {
  label: string;
  value: string;
  onSave: (val: string) => Promise<void>;
  placeholder?: string;
}

const EditableField = ({ label, value, onSave, placeholder }: EditableFieldProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (draft.trim() === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground font-light">{label}</p>
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={placeholder}
            className="h-8 text-sm"
            autoFocus
            onKeyDown={e => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleCancel();
            }}
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 text-green-600 hover:text-green-700"
            onClick={handleSave}
            disabled={saving}
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 text-destructive"
            onClick={handleCancel}
            disabled={saving}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground font-light">{label}</p>
      <button
        onClick={() => { setDraft(value); setEditing(true); }}
        className="flex items-center gap-1.5 group text-left w-full"
      >
        <span className="text-sm font-medium">{value || <span className="text-muted-foreground italic">Não informado</span>}</span>
        <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </button>
    </div>
  );
};

// ─── Stat Card ───────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  iconBg?: string;
}

const StatCard = ({ icon, label, value, iconBg = "bg-primary/10" }: StatCardProps) => (
  <Card className="rounded-xl">
    <CardContent className="pt-4 pb-4 px-4 flex flex-col gap-2">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${iconBg}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-light">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </CardContent>
  </Card>
);

// ─── Subscription Card ───────────────────────────────────────────────────────

const formatCents = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

const subscriptionStatusBadge = (status: string) => {
  if (status === "active") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Ativo</span>;
  if (status === "overdue") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Inadimplente</span>;
  if (status === "suspended") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Suspenso</span>;
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{status}</span>;
};

const SubscriptionCard = ({ subscription }: { subscription: SubscriptionInfo }) => {
  const isSemiannual = subscription.billing_type === "SEMIANNUAL";

  const nextDueFormatted = subscription.next_due_date
    ? new Date(subscription.next_due_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : null;

  const endsAtFormatted = subscription.ends_at
    ? new Date(subscription.ends_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null;

  const daysRemaining = subscription.ends_at
    ? differenceInDays(new Date(subscription.ends_at), new Date())
    : null;

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <CreditCard className="h-4 w-4" /> Minha assinatura
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-5">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="text-sm font-bold">
              {subscription.plan_frequency}x por semana
            </p>
            <div className="flex items-center gap-2">
              {subscriptionStatusBadge(subscription.status)}
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-black text-primary">{formatCents(subscription.amount_cents)}</p>
            <p className="text-xs text-muted-foreground font-light">{isSemiannual ? "semestral" : "/mês"}</p>
          </div>
        </div>

        <div className="space-y-1.5 text-sm">
          {nextDueFormatted && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-light">Próximo vencimento</span>
              <span className="text-xs font-medium">{nextDueFormatted}</span>
            </div>
          )}
          {isSemiannual && endsAtFormatted && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-light">Termina em</span>
              <span className="text-xs font-medium">
                {endsAtFormatted}
                {daysRemaining !== null && daysRemaining >= 0 && (
                  <span className="text-muted-foreground ml-1">({daysRemaining} dias)</span>
                )}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-light">Método</span>
            <span className="text-xs font-medium">PIX</span>
          </div>
        </div>

        <Button size="sm" variant="outline" className="w-full text-xs" asChild>
          <a href="/pagamento">
            <CreditCard className="h-3.5 w-3.5 mr-1.5" /> Gerenciar pagamento
          </a>
        </Button>
      </CardContent>
    </Card>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const Perfil = () => {
  const { profile: authProfile, signOut } = useAuth();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [gamification, setGamification] = useState<Gamification | null>(null);
  const [completedClasses, setCompletedClasses] = useState<number>(0);
  const [exercisesDone, setExercisesDone] = useState<number>(0);
  const [badges, setBadges] = useState<BadgeItem[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<BadgeItem | null>(null);
  const [certificates, setCertificates] = useState<CertItem[]>([]);
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [studentPaymentStatus, setStudentPaymentStatus] = useState<StudentPaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushSupported] = useState(() => isPushSupported());
  const [pushDenied, setPushDenied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load all data ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!authProfile) return;
    loadAll();
  }, [authProfile]);

  // Check current push subscription state
  useEffect(() => {
    if (!pushSupported) return;
    isPushSubscribed().then(setPushEnabled);
    if (Notification.permission === "denied") setPushDenied(true);
  }, [pushSupported]);

  const handlePushToggle = async (enabled: boolean) => {
    if (pushLoading) return;
    setPushLoading(true);
    if (enabled) {
      const success = await subscribeToPush(student?.id ?? "");
      if (success) {
        setPushEnabled(true);
        toast({ title: "Notificações ativadas!", description: "Você receberá alertas deste dispositivo." });
      } else {
        const denied = Notification.permission === "denied";
        setPushDenied(denied);
        if (!denied) toast({ title: "Não foi possível ativar", description: "Tente novamente.", variant: "destructive" });
      }
    } else {
      const success = await unsubscribeFromPush();
      if (success) {
        setPushEnabled(false);
        toast({ title: "Notificações desativadas." });
      }
    }
    setPushLoading(false);
  };

  const loadAll = async () => {
    if (!authProfile) return;
    setLoading(true);
    try {
      const db = supabase as any;

      // Profile
      const profilePromise = db
        .from("profiles")
        .select("id, name, phone, avatar_url")
        .eq("id", authProfile.id)
        .single()
        .then(({ data }: any) => data as ProfileData | null);

      // Student (with language & level joins + payment status)
      const studentPromise = db
        .from("students")
        .select(`
          id, enrollment_date, is_corporate, payment_status,
          languages!students_language_id_fkey(name),
          levels!students_level_id_fkey(name, code)
        `)
        .eq("user_id", authProfile.id)
        .single()
        .then(({ data }: any) => {
          if (!data) return null;
          setStudentPaymentStatus({
            is_corporate: data.is_corporate ?? false,
            payment_status: data.payment_status ?? "pending_contract",
          });
          return {
            id: data.id,
            enrollment_date: data.enrollment_date,
            language: data.languages?.name || null,
            level_name: data.levels?.name || null,
            level_code: data.levels?.code || null,
          } as StudentInfo;
        });

      const [profileData, studentData] = await Promise.all([profilePromise, studentPromise]);

      setProfile(profileData);
      setStudent(studentData);

      if (studentData) {
        // Load gamification, completed classes, exercises and badges in parallel
        const [gamifRes, classesRes, exercisesRes, allBadgesRes, earnedBadgesRes] = await Promise.all([
          db.from("student_gamification").select("xp_total, coins, streak_current, streak_best").eq("student_id", studentData.id).single(),
          db.from("classes").select("id", { count: "exact", head: true }).eq("student_id", studentData.id).eq("status", "completed"),
          db.from("xp_events").select("id", { count: "exact", head: true }).eq("student_id", studentData.id).in("event_type", ["lesson_exercise", "stepbystep"]),
          db.from("badges").select("id, name, description, icon, condition_type, condition_value").eq("active", true),
          db.from("student_badges").select("badge_id, earned_at").eq("student_id", studentData.id),
        ]);

        if (gamifRes.data) setGamification(gamifRes.data as Gamification);
        setCompletedClasses(classesRes.count ?? 0);
        setExercisesDone(exercisesRes.count ?? 0);

        if (allBadgesRes.data) {
          const earnedMap = new Map<string, string>();
          (earnedBadgesRes.data || []).forEach((eb: any) => earnedMap.set(eb.badge_id, eb.earned_at));
          const merged: BadgeItem[] = allBadgesRes.data.map((b: any) => ({
            ...b, earned: earnedMap.has(b.id), earned_at: earnedMap.get(b.id) || null,
          }));
          merged.sort((a, b) => (b.earned ? 1 : 0) - (a.earned ? 1 : 0));
          setBadges(merged);
        }

        const certsRes = await (supabase as any)
          .from("certificates")
          .select("id, certificate_number, level_name, language_name, issued_at")
          .eq("student_id", studentData.id)
          .order("issued_at", { ascending: false });
        setCertificates(certsRes.data || []);

        // Fetch speaking recordings
        const recordingsRes = await (supabase as any)
          .from("speaking_recordings")
          .select("id, step_id, audio_url, status, recorded_at, teacher_score, teacher_feedback")
          .eq("student_id", studentData.id)
          .order("recorded_at", { ascending: false })
          .limit(10);

        const recs = recordingsRes.data || [];
        const enrichedRecs: RecordingItem[] = await Promise.all(
          recs.map(async (r: any) => {
            let stepNumber: number | null = null;
            if (r.step_id) {
              const { data: step } = await supabase
                .from("steps")
                .select("number")
                .eq("id", r.step_id)
                .maybeSingle();
              stepNumber = step?.number ?? null;
            }
            return { ...r, stepNumber };
          })
        );
        setRecordings(enrichedRecs);

        // Fetch active subscription
        const subRes = await db
          .from("subscriptions")
          .select(`
            id, billing_type, payment_method, amount_cents, status, next_due_date, ends_at,
            payment_plans!subscriptions_plan_id_fkey(name, frequency)
          `)
          .eq("student_id", studentData.id)
          .neq("status", "cancelled")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (subRes.data) {
          const s = subRes.data;
          setSubscription({
            id: s.id,
            billing_type: s.billing_type,
            payment_method: s.payment_method,
            amount_cents: s.amount_cents,
            status: s.status,
            next_due_date: s.next_due_date,
            ends_at: s.ends_at,
            plan_frequency: s.payment_plans?.frequency ?? 0,
            plan_name: s.payment_plans?.name ?? "—",
          });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Avatar upload ──────────────────────────────────────────────────────────

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${profile.id}.${ext}`;

      const { error } = await (supabase as any).storage
        .from("avatars")
        .upload(path, file, { upsert: true });

      if (error) throw error;

      const { data: urlData } = (supabase as any).storage
        .from("avatars")
        .getPublicUrl(path);

      await (supabase as any)
        .from("profiles")
        .update({ avatar_url: urlData.publicUrl })
        .eq("id", profile.id);

      setProfile(prev => prev ? { ...prev, avatar_url: urlData.publicUrl } : prev);

      toast({ title: "Foto atualizada!" });
    } catch {
      toast({ title: "Erro ao enviar foto", variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
      // Reset so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Save name / phone ──────────────────────────────────────────────────────

  const saveName = async (name: string) => {
    if (!profile) return;
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ name })
      .eq("id", profile.id);
    if (error) {
      toast({ title: "Erro ao salvar nome", variant: "destructive" });
      throw error;
    }
    setProfile(prev => prev ? { ...prev, name } : prev);
    toast({ title: "Nome atualizado!" });
  };

  const savePhone = async (phone: string) => {
    if (!profile) return;
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ phone })
      .eq("id", profile.id);
    if (error) {
      toast({ title: "Erro ao salvar telefone", variant: "destructive" });
      throw error;
    }
    setProfile(prev => prev ? { ...prev, phone } : prev);
    toast({ title: "Telefone atualizado!" });
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  const initials = profile?.name
    ?.split(" ")
    .map(n => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <StudentLayout>
        <div className="space-y-4">
          <Card className="rounded-xl">
            <CardContent className="pt-6 flex flex-col items-center gap-3">
              <Skeleton className="h-20 w-20 rounded-full" />
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-28" />
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </StudentLayout>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <StudentLayout>
      <div className="space-y-4">

        {/* ── Top section: 2-col on desktop ── */}
        <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-6 lg:items-start space-y-4 lg:space-y-0">

          {/* Left column: Avatar card */}
          <Card className="rounded-xl">
            <CardContent className="pt-6 pb-6 flex flex-col items-center gap-4">
              {/* Avatar */}
              <div className="relative">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback
                    className="text-xl font-bold"
                    style={{ background: "var(--theme-primary)", color: "var(--theme-text-on-primary)" }}
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {uploadingAvatar && (
                  <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                    <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              {/* Upload button */}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
              >
                <Camera className="h-3.5 w-3.5" />
                Alterar foto
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />

              {/* Editable name & phone */}
              <div className="w-full space-y-3 px-2">
                <EditableField
                  label="Nome"
                  value={profile?.name || ""}
                  onSave={saveName}
                  placeholder="Seu nome completo"
                />
                <EditableField
                  label="Telefone"
                  value={profile?.phone || ""}
                  onSave={savePhone}
                  placeholder="(11) 99999-9999"
                />
              </div>
            </CardContent>
          </Card>

          {/* Right column: Stats + Info */}
          <div className="space-y-4">
            {/* Stats: 2-col on mobile, 4-col on desktop */}
            {gamification && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  icon={<Zap className="h-4 w-4" style={{ fill: "var(--theme-accent)", color: "var(--theme-accent)" }} />}
                  label="XP Total"
                  value={gamification.xp_total.toLocaleString("pt-BR")}
                  iconBg="bg-primary/10"
                />
                <StatCard
                  icon={<span className="text-base leading-none">🪙</span>}
                  label="Coins"
                  value={gamification.coins.toLocaleString("pt-BR")}
                  iconBg="bg-yellow-100 dark:bg-yellow-900/30"
                />
                <StatCard
                  icon={<Flame className="h-4 w-4 text-orange-500" />}
                  label="Streak atual"
                  value={`${gamification.streak_current} dias`}
                  iconBg="bg-orange-100 dark:bg-orange-900/30"
                />
                <StatCard
                  icon={<Trophy className="h-4 w-4 text-amber-500" />}
                  label="Melhor streak"
                  value={`${gamification.streak_best} dias`}
                  iconBg="bg-amber-100 dark:bg-amber-900/30"
                />
              </div>
            )}

            {/* Info card */}
            <Card className="rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                  Informações
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pb-5">
                <InfoRow emoji="📚" label="Idioma" value={student?.language || "—"} />
                <InfoRow
                  emoji="🎯"
                  label="Nível"
                  value={
                    student?.level_name
                      ? `${student.level_name}${student.level_code ? ` (${student.level_code})` : ""}`
                      : "—"
                  }
                />
                <InfoRow
                  emoji="📅"
                  label="Matrícula"
                  value={formatDate(student?.enrollment_date || null)}
                />
                <InfoRow
                  emoji="✅"
                  label="Total de aulas"
                  value={`${completedClasses} ${completedClasses === 1 ? "aula" : "aulas"}`}
                />
                <InfoRow
                  emoji="📝"
                  label="Exercícios feitos"
                  value={`${exercisesDone} ${exercisesDone === 1 ? "exercício" : "exercícios"}`}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Minha assinatura ── */}
        {PAYMENT_ENABLED && subscription && !studentPaymentStatus?.is_corporate && (
          <SubscriptionCard subscription={subscription} />
        )}

        {/* ── Meus certificados ── */}
        {certificates.length > 0 && (
          <Card className="rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Meus certificados
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pb-5">
              {certificates.map(cert => (
                <div key={cert.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-muted/20">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{cert.language_name} · {cert.level_name}</p>
                    <p className="text-xs text-muted-foreground font-light">
                      {new Date(cert.issued_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                    </p>
                  </div>
                  <a
                    href={`/certificado/${cert.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                  >
                    Ver <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── Badges / Conquistas ── */}
        {badges.length > 0 && (
          <Card className="rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Minhas conquistas
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-5">
              <div className="grid grid-cols-4 lg:grid-cols-6 gap-3">
                {badges.map(badge => (
                  <button
                    key={badge.id}
                    onClick={() => setSelectedBadge(badge)}
                    className={cn(
                      "flex flex-col items-center gap-1 p-2 rounded-xl border transition-all",
                      badge.earned
                        ? "border-primary/20 bg-primary/5 hover:border-primary/40"
                        : "border-border bg-muted/20 opacity-50 hover:opacity-70"
                    )}
                  >
                    <span className={cn("text-2xl", !badge.earned && "grayscale")}>
                      {badge.earned ? badge.icon : <Lock className="h-5 w-5 text-muted-foreground" />}
                    </span>
                    <span className="text-[10px] text-center leading-tight text-muted-foreground font-light line-clamp-2">
                      {badge.name}
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Badge detail dialog */}
        {selectedBadge && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setSelectedBadge(null)}>
            <div className="bg-card rounded-2xl p-6 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
              <div className="text-center">
                <span className={cn("text-5xl block mb-2", !selectedBadge.earned && "grayscale opacity-50")}>
                  {selectedBadge.earned ? selectedBadge.icon : "🔒"}
                </span>
                <p className="font-bold text-lg">{selectedBadge.name}</p>
                {selectedBadge.description && (
                  <p className="text-sm text-muted-foreground mt-1">{selectedBadge.description}</p>
                )}
              </div>
              {selectedBadge.earned ? (
                <p className="text-center text-xs text-green-600 font-bold">
                  ✓ Conquistado em {new Date(selectedBadge.earned_at!).toLocaleDateString("pt-BR")}
                </p>
              ) : (
                <p className="text-center text-xs text-muted-foreground">
                  Continue praticando para desbloquear esta conquista!
                </p>
              )}
              <button
                onClick={() => setSelectedBadge(null)}
                className="w-full text-center text-sm text-primary font-bold py-2"
              >
                Fechar
              </button>
            </div>
          </div>
        )}

        {/* ── Minhas gravações ── */}
        {recordings.length > 0 && (
          <Card className="rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                <Mic className="h-4 w-4" /> Minhas gravações
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pb-5">
              <div className="lg:grid lg:grid-cols-2 lg:gap-4">
                {recordings.map(rec => (
                  <div key={rec.id} className="space-y-2 border-b lg:border lg:rounded-xl lg:p-3 last:border-b-0 pb-3 last:pb-0 lg:last:pb-3 lg:border-b">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">
                        {rec.stepNumber ? `Passo ${rec.stepNumber}` : "Gravação"}
                      </p>
                      <span className={cn(
                        "text-xs font-bold px-2 py-0.5 rounded-full",
                        rec.status === "reviewed"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                      )}>
                        {rec.status === "reviewed" ? "Avaliado" : "Pendente"}
                      </span>
                    </div>
                    <audio controls src={rec.audio_url} className="w-full h-10" />
                    {rec.status === "reviewed" && rec.teacher_score && (
                      <div className="space-y-1">
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map(s => (
                            <span key={s} className={cn("text-base", rec.teacher_score! >= s ? "text-yellow-400" : "text-muted-foreground/30")}>★</span>
                          ))}
                        </div>
                        {rec.teacher_feedback && (
                          <p className="text-xs text-muted-foreground font-light italic">"{rec.teacher_feedback}"</p>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground font-light">
                      {new Date(rec.recorded_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Theme switcher ── */}
        <ThemeSwitcher />

        {/* ── Idioma ativo ── */}
        <LanguageSwitcherList />

        {/* ── Central de Ajuda ── */}
        <Card className="rounded-xl">
          <CardContent className="p-0">
            <Link
              to="/ajuda"
              className="flex items-center gap-3 px-4 py-4 hover:bg-muted/50 transition-colors rounded-xl"
            >
              <HelpCircle className="h-5 w-5 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium flex-1">Central de Ajuda</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>
          </CardContent>
        </Card>

        {/* ── Notifications toggle ── */}
        <Card className="rounded-xl">
          <CardContent className="pt-5 pb-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="notif-toggle" className="text-sm font-medium cursor-pointer">
                Notificações push
              </Label>
              <Switch
                id="notif-toggle"
                checked={pushEnabled}
                disabled={!pushSupported || pushDenied || pushLoading}
                onCheckedChange={handlePushToggle}
              />
            </div>
            {!pushSupported && (
              <p className="text-xs text-muted-foreground font-light">
                Seu navegador não suporta notificações.
              </p>
            )}
            {pushSupported && pushDenied && (
              <p className="text-xs text-destructive font-light">
                Permissão negada. Ative nas configurações do navegador.
              </p>
            )}
            {pushSupported && !pushDenied && (
              <p className="text-xs text-muted-foreground font-light">
                {pushEnabled
                  ? "Notificações ativas neste dispositivo."
                  : "Receba alertas de aulas e missões diárias."}
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Sair ── */}
        <Button
          variant="ghost"
          className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 gap-2 font-medium"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4" />
          Sair da conta
        </Button>

      </div>
    </StudentLayout>
  );
};

// ── Small helper component ─────────────────────────────────────────────────

const InfoRow = ({ emoji, label, value }: { emoji: string; label: string; value: string }) => (
  <div className="flex items-start gap-3">
    <span className="text-base leading-5 shrink-0">{emoji}</span>
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground font-light">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  </div>
);

export default Perfil;
