import { useEffect, useState, useRef, ChangeEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Camera, Info, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Constants ──────────────────────────────────────────────────────────────────

const PIX_TYPES = [
  { value: "cpf",    label: "CPF" },
  { value: "cnpj",   label: "CNPJ" },
  { value: "email",  label: "E-mail" },
  { value: "phone",  label: "Telefone" },
  { value: "random", label: "Chave aleatória" },
] as const;

const DAY_LABELS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

const BIO_MAX = 280;

// ── Helpers ────────────────────────────────────────────────────────────────────

function applyPhoneMask(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2)  return d.length ? `(${d}` : d;
  if (d.length <= 7)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

function applyPixMask(raw: string, type: string): string {
  if (type === "email" || type === "random") return raw;
  const d = raw.replace(/\D/g, "");
  if (type === "cpf") {
    const n = d.slice(0, 11);
    if (n.length <= 3) return n;
    if (n.length <= 6) return `${n.slice(0,3)}.${n.slice(3)}`;
    if (n.length <= 9) return `${n.slice(0,3)}.${n.slice(3,6)}.${n.slice(6)}`;
    return `${n.slice(0,3)}.${n.slice(3,6)}.${n.slice(6,9)}-${n.slice(9)}`;
  }
  if (type === "cnpj") {
    const n = d.slice(0, 14);
    if (n.length <= 2)  return n;
    if (n.length <= 5)  return `${n.slice(0,2)}.${n.slice(2)}`;
    if (n.length <= 8)  return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5)}`;
    if (n.length <= 12) return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8)}`;
    return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8,12)}-${n.slice(12)}`;
  }
  if (type === "phone") {
    const n = d.slice(0, 11);
    if (n.length <= 2)  return n;
    if (n.length <= 7)  return `(${n.slice(0,2)}) ${n.slice(2)}`;
    if (n.length <= 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
    return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
  }
  return raw;
}

const abbr = (name: string) => name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  profileId: string;
  onSwitchToAvailability: () => void;
}

interface Language { id: string; name: string; }

const TeacherProfileTab = ({ profileId, onSwitchToAvailability }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingPix, setSavingPix]   = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Personal info
  const [avatarUrl, setAvatarUrl]   = useState<string | null>(null);
  const [name, setName]             = useState("");
  const [phone, setPhone]           = useState("");
  const [bio, setBio]               = useState("");
  const [selectedLangs, setSelectedLangs] = useState<string[]>([]);

  // Languages
  const [languages, setLanguages]   = useState<Language[]>([]);

  // PIX
  const [savedPixKey,  setSavedPixKey]  = useState<string | null>(null);
  const [savedPixType, setSavedPixType] = useState<string | null>(null);
  const [editingPix,   setEditingPix]   = useState(false);
  const [pixType, setPixType] = useState("cpf");
  const [pixKey,  setPixKey]  = useState("");

  // Availability counts
  const [slotsPerDay, setSlotsPerDay] = useState<number[]>(new Array(7).fill(0));

  useEffect(() => { loadAll(); }, [profileId]);

  const loadAll = async () => {
    setLoading(true);
    const [profRes, langsRes, availRes] = await Promise.all([
      (supabase as any)
        .from("profiles")
        .select("name, avatar_url, phone, bio, teaching_languages, pix_key, pix_key_type")
        .eq("id", profileId)
        .single(),
      supabase.from("languages").select("id, name").eq("active", true).order("name"),
      (supabase as any)
        .from("teacher_availability")
        .select("day_of_week")
        .eq("teacher_id", profileId)
        .eq("active", true),
    ]);

    const prof = profRes.data;
    if (prof) {
      setAvatarUrl(prof.avatar_url || null);
      setName(prof.name || "");
      setPhone(prof.phone ? applyPhoneMask(prof.phone) : "");
      setBio(prof.bio || "");
      setSelectedLangs(
        Array.isArray(prof.teaching_languages) ? prof.teaching_languages.map(String) : []
      );
      if (prof.pix_key) {
        setSavedPixKey(prof.pix_key);
        setSavedPixType(prof.pix_key_type || null);
        setPixType(prof.pix_key_type || "cpf");
        setPixKey(prof.pix_key);
      }
    }

    setLanguages((langsRes.data || []) as Language[]);

    const counts = new Array(7).fill(0);
    ((availRes.data || []) as any[]).forEach(r => { counts[r.day_of_week]++; });
    setSlotsPerDay(counts);

    setLoading(false);
  };

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const ext  = file.name.split(".").pop() || "jpg";
      const path = `${profileId}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${publicUrl}?t=${Date.now()}`;
      await supabase.from("profiles").update({ avatar_url: url }).eq("id", profileId);
      setAvatarUrl(url);
      toast({ title: "Foto atualizada!" });
    } catch {
      toast({ title: "Erro ao enviar foto", variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveInfo = async () => {
    setSavingInfo(true);
    try {
      const rawPhone = phone.replace(/\D/g, "");
      const { error } = await (supabase as any)
        .from("profiles")
        .update({
          name,
          phone: rawPhone || null,
          bio: bio || null,
          teaching_languages: selectedLangs,
        })
        .eq("id", profileId);
      if (error) throw error;
      toast({ title: "Alterações salvas!" });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSavingInfo(false);
    }
  };

  const handleSavePix = async () => {
    if (!pixKey.trim()) return;
    setSavingPix(true);
    try {
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ pix_key: pixKey.trim(), pix_key_type: pixType })
        .eq("id", profileId);
      if (error) throw error;
      setSavedPixKey(pixKey.trim());
      setSavedPixType(pixType);
      setEditingPix(false);
      toast({ title: "Chave PIX salva!" });
    } catch {
      toast({ title: "Erro ao salvar chave PIX", variant: "destructive" });
    } finally {
      setSavingPix(false);
    }
  };

  const toggleLang = (id: string) =>
    setSelectedLangs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const pixLabel = PIX_TYPES.find(t => t.value === (editingPix ? pixType : savedPixType))?.label ?? "Chave";

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold">Perfil</h2>

      {/* ── Informações pessoais ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold">Informações pessoais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <Avatar className="h-16 w-16">
                <AvatarImage src={avatarUrl || undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                  {abbr(name || "?")}
                </AvatarFallback>
              </Avatar>
              <button
                className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-background border shadow flex items-center justify-center hover:bg-muted transition-colors"
                onClick={() => fileRef.current?.click()}
                disabled={uploadingAvatar}
              >
                <Camera className="h-3 w-3" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm">{name || "Professor"}</p>
              <p className="text-xs text-muted-foreground font-light">{user?.email}</p>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nome completo</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome completo" />
          </div>

          {/* Email (read-only) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">E-mail</label>
            <Input value={user?.email ?? ""} readOnly className="bg-muted text-muted-foreground" />
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Telefone</label>
            <Input
              value={phone}
              onChange={e => setPhone(applyPhoneMask(e.target.value))}
              placeholder="(11) 99999-9999"
              inputMode="numeric"
            />
          </div>

          {/* Bio */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Bio</label>
              <span className={cn("text-[10px]", bio.length > BIO_MAX ? "text-red-500" : "text-muted-foreground")}>
                {bio.length}/{BIO_MAX}
              </span>
            </div>
            <Textarea
              value={bio}
              onChange={e => setBio(e.target.value.slice(0, BIO_MAX))}
              placeholder="Conte um pouco sobre você e sua metodologia de ensino..."
              rows={3}
              className="resize-none text-sm font-light"
            />
          </div>

          {/* Teaching languages */}
          {languages.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Idiomas que ensina</label>
              <div className="flex flex-wrap gap-2">
                {languages.map(lang => (
                  <Badge
                    key={lang.id}
                    variant={selectedLangs.includes(lang.id) ? "default" : "outline"}
                    className="cursor-pointer select-none transition-colors"
                    onClick={() => toggleLang(lang.id)}
                  >
                    {lang.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleSaveInfo}
            disabled={savingInfo || bio.length > BIO_MAX}
          >
            {savingInfo ? "Salvando..." : "Salvar alterações"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Chave PIX ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold">Chave PIX</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {savedPixKey && !editingPix ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted">
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{pixLabel}</p>
                <p className="font-mono font-bold text-sm truncate">{savedPixKey}</p>
              </div>
              <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => setEditingPix(true)}>
                <Pencil className="h-3 w-3" />
                Editar
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Tipo de chave</label>
                <Select
                  value={pixType}
                  onValueChange={v => { setPixType(v); setPixKey(""); }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PIX_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{pixLabel}</label>
                <Input
                  value={pixKey}
                  onChange={e => setPixKey(applyPixMask(e.target.value, pixType))}
                  placeholder={
                    pixType === "cpf"    ? "000.000.000-00"       :
                    pixType === "cnpj"   ? "00.000.000/0000-00"   :
                    pixType === "phone"  ? "(11) 99999-9999"      :
                    pixType === "email"  ? "email@exemplo.com"    :
                                          "Chave aleatória"
                  }
                  inputMode={pixType === "cpf" || pixType === "cnpj" || pixType === "phone" ? "numeric" : "text"}
                />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleSavePix} disabled={savingPix || !pixKey.trim()}>
                  {savingPix ? "Salvando..." : "Salvar chave PIX"}
                </Button>
                {savedPixKey && (
                  <Button variant="outline" onClick={() => { setEditingPix(false); setPixKey(savedPixKey); setPixType(savedPixType || "cpf"); }}>
                    Cancelar
                  </Button>
                )}
              </div>
            </div>
          )}
          <div className="flex items-start gap-2 text-xs text-muted-foreground font-light">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Sua chave PIX é usada pela steps academy para processar seus pagamentos.</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Disponibilidade ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold">Disponibilidade</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs h-7 px-2 text-primary" onClick={onSwitchToAvailability}>
              Editar disponibilidade →
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-center">
            {DAY_LABELS.map((day, i) => (
              <div key={day} className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground">{day}</p>
                <div className={cn(
                  "rounded-md py-2 text-xs font-bold",
                  slotsPerDay[i] > 0
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground font-light"
                )}>
                  {slotsPerDay[i] > 0 ? slotsPerDay[i] : "—"}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground font-light mt-2 text-center">
            Janelas de disponibilidade ativas por dia da semana
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TeacherProfileTab;
