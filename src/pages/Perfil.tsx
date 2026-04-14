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
import { Camera, Pencil, Check, X, Zap, Flame, Trophy, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

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

// ─── Main Page ────────────────────────────────────────────────────────────────

const Perfil = () => {
  const { profile: authProfile } = useAuth();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [gamification, setGamification] = useState<Gamification | null>(null);
  const [completedClasses, setCompletedClasses] = useState<number>(0);
  const [exercisesDone, setExercisesDone] = useState<number>(0);
  const [badges, setBadges] = useState<BadgeItem[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<BadgeItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [notifications, setNotifications] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load all data ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!authProfile) return;
    loadAll();
  }, [authProfile]);

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

      // Student (with language & level joins)
      const studentPromise = db
        .from("students")
        .select(`
          id, enrollment_date,
          languages!students_language_id_fkey(name),
          levels!students_level_id_fkey(name, code)
        `)
        .eq("user_id", authProfile.id)
        .single()
        .then(({ data }: any) => {
          if (!data) return null;
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
        <div className="max-w-lg mx-auto space-y-4">
          <Card className="rounded-xl">
            <CardContent className="pt-6 flex flex-col items-center gap-3">
              <Skeleton className="h-20 w-20 rounded-full" />
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-28" />
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-3">
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
      <div className="max-w-lg mx-auto space-y-4">

        {/* ── Header Card ── */}
        <Card className="rounded-xl">
          <CardContent className="pt-6 pb-6 flex flex-col items-center gap-4">
            {/* Avatar */}
            <div className="relative">
              <Avatar className="h-20 w-20">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback
                  className="text-xl font-bold text-white"
                  style={{ background: "#520A70" }}
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

        {/* ── Stats grid 2×2 ── */}
        {gamification && (
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<Zap className="h-4 w-4 fill-lime text-lime" />}
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

        {/* ── More info list ── */}
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

        {/* ── Badges / Conquistas ── */}
        {badges.length > 0 && (
          <Card className="rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Minhas conquistas
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-5">
              <div className="grid grid-cols-4 gap-3">
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
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center p-4" onClick={() => setSelectedBadge(null)}>
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

        {/* ── Notifications toggle ── */}
        <Card className="rounded-xl">
          <CardContent className="pt-5 pb-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="notif-toggle" className="text-sm font-medium cursor-pointer">
                Receber notificações
              </Label>
              <Switch
                id="notif-toggle"
                checked={notifications}
                onCheckedChange={setNotifications}
              />
            </div>
            <p className="text-xs text-muted-foreground font-light">
              Integração com notificações push em breve.
            </p>
          </CardContent>
        </Card>

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
