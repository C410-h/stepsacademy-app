import { useEffect, useMemo, useState, useRef, ChangeEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeKey } from "@/lib/themes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { HELP_CONTENT } from "@/data/helpContent";
import { Camera, Info, Pencil, Lock, LogOut, Search, HelpCircle, MessageCircle, Headphones } from "lucide-react";
import { Link } from "react-router-dom";
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

const TeacherProfileTab = ({ profileId, onSwitchToAvailability }: Props) => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const { theme: activeTheme, setTheme, themes } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading]               = useState(true);
  const [savingInfo, setSavingInfo]         = useState(false);
  const [savingPix, setSavingPix]           = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [avatarUrl, setAvatarUrl]     = useState<string | null>(null);
  const [name, setName]               = useState("");
  const [phone, setPhone]             = useState("");
  const [bio, setBio]                 = useState("");
  const [teacherLang, setTeacherLang] = useState<string | null>(null);

  const [savedPixKey,  setSavedPixKey]  = useState<string | null>(null);
  const [savedPixType, setSavedPixType] = useState<string | null>(null);
  const [editingPix,   setEditingPix]   = useState(false);
  const [pixType, setPixType] = useState("cpf");
  const [pixKey,  setPixKey]  = useState("");

  const [slotsPerDay, setSlotsPerDay] = useState<number[]>(new Array(7).fill(0));

  const [pwOpen,    setPwOpen]    = useState(false);
  const [newPw,     setNewPw]     = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw,  setSavingPw]  = useState(false);

  const [helpSearch, setHelpSearch] = useState("");

  useEffect(() => { loadAll(); }, [profileId]);

  const loadAll = async () => {
    setLoading(true);
    const [profRes, availRes, teacherRes] = await Promise.all([
      (supabase as any)
        .from("profiles")
        .select("name, avatar_url, phone, bio, pix_key, pix_key_type")
        .eq("id", profileId)
        .single(),
      (supabase as any)
        .from("teacher_availability")
        .select("day_of_week")
        .eq("teacher_id", profileId)
        .eq("active", true),
      (supabase as any)
        .from("teachers")
        .select("teacher_languages(languages!teacher_languages_language_id_fkey(name))")
        .eq("user_id", profileId)
        .maybeSingle(),
    ]);

    const prof = profRes.data;
    if (prof) {
      setAvatarUrl(prof.avatar_url || null);
      setName(prof.name || "");
      setPhone(prof.phone ? applyPhoneMask(prof.phone) : "");
      setBio(prof.bio || "");
      if (prof.pix_key) {
        setSavedPixKey(prof.pix_key);
        setSavedPixType(prof.pix_key_type || null);
        setPixType(prof.pix_key_type || "cpf");
        setPixKey(prof.pix_key);
      }
    }

    const langEntry = teacherRes.data?.teacher_languages?.[0];
    setTeacherLang(langEntry?.languages?.name || null);

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
        .update({ name, phone: rawPhone || null, bio: bio || null })
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

  const handleChangePassword = async () => {
    if (newPw.length < 8) {
      toast({ title: "A senha deve ter pelo menos 8 caracteres", variant: "destructive" });
      return;
    }
    if (newPw !== confirmPw) {
      toast({ title: "As senhas não coincidem", variant: "destructive" });
      return;
    }
    setSavingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      toast({ title: "Senha alterada com sucesso!" });
      setPwOpen(false);
      setNewPw("");
      setConfirmPw("");
    } catch (err: any) {
      toast({ title: "Erro ao alterar senha", description: err.message, variant: "destructive" });
    } finally {
      setSavingPw(false);
    }
  };

  const pixLabel = PIX_TYPES.find(t => t.value === (editingPix ? pixType : savedPixType))?.label ?? "Chave";

  const teacherHelp = HELP_CONTENT.teacher ?? [];
  const filteredHelp = useMemo(() => {
    const term = helpSearch.trim().toLowerCase();
    if (!term) return null;
    const results: Array<{ question: string; answer: string; section: string }> = [];
    for (const sec of teacherHelp) {
      for (const item of sec.items) {
        if (item.question.toLowerCase().includes(term) || item.answer.toLowerCase().includes(term)) {
          results.push({ ...item, section: sec.section });
        }
      }
    }
    return results;
  }, [helpSearch]);

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Skeleton className="h-64 rounded-xl col-span-2 lg:row-span-2" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Bento grid CSS ── */}
      <style>{`
        @media (min-width: 1024px) {
          .profile-bento {
            display: grid;
            grid-template-columns: 2fr 1fr 1fr;
            grid-template-rows: auto auto auto;
            gap: 16px;
            grid-template-areas:
              "info  pix      horarios"
              "info  temasg   horarios"
              "ajuda ajuda    ajuda";
          }
          .bento-info     { grid-area: info; }
          .bento-pix      { grid-area: pix; }
          .bento-temasg   { grid-area: temasg; }
          .bento-horarios { grid-area: horarios; }
          .bento-ajuda    { grid-area: ajuda; }
        }
      `}</style>

      {/* ── Bento ── */}
      <div className="profile-bento space-y-4 lg:space-y-0">

        {/* ── Info (2×2) ── */}
        <Card className="bento-info flex flex-col">
          <CardContent className="p-5 flex flex-col flex-1">

            {/* Avatar centrado */}
            <div className="flex flex-col items-center gap-2 pb-4 mb-4 border-b">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={avatarUrl || undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">
                    {abbr(name || "?")}
                  </AvatarFallback>
                </Avatar>
                <button
                  className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-background border shadow flex items-center justify-center hover:bg-muted transition-colors"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadingAvatar}
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </div>
              <div className="text-center">
                <p className="font-bold text-sm">{name || "Professor"}</p>
                <p className="text-xs text-muted-foreground font-light">{user?.email}</p>
              </div>
            </div>

            {/* Campos */}
            <div className="flex-1 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Nome completo</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome completo" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">E-mail</label>
                <Input value={user?.email ?? ""} readOnly className="bg-muted text-muted-foreground" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Telefone</label>
                <Input
                  value={phone}
                  onChange={e => setPhone(applyPhoneMask(e.target.value))}
                  placeholder="(11) 99999-9999"
                  inputMode="numeric"
                />
              </div>

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

              {/* Idioma que leciona */}
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Idioma que leciona</label>
                <Badge
                  title="Para alterar, contate o administrador"
                  className="cursor-default select-none"
                >
                  {teacherLang ?? "—"}
                </Badge>
              </div>

            </div>

            <Button className="w-full mt-4" onClick={handleSaveInfo} disabled={savingInfo || bio.length > BIO_MAX}>
              {savingInfo ? "Salvando..." : "Salvar alterações"}
            </Button>
          </CardContent>
        </Card>

        {/* ── PIX ── */}
        <Card className="bento-pix flex flex-col">
          <CardHeader className="pb-2 pt-4 px-4 shrink-0">
            <CardTitle className="text-sm font-bold">Chave PIX</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 flex-1 space-y-3">
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
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Tipo de chave</label>
                  <Select value={pixType} onValueChange={v => { setPixType(v); setPixKey(""); }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PIX_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{pixLabel}</label>
                  <Input
                    className="h-8 text-xs"
                    value={pixKey}
                    onChange={e => setPixKey(applyPixMask(e.target.value, pixType))}
                    placeholder={
                      pixType === "cpf"    ? "000.000.000-00"     :
                      pixType === "cnpj"   ? "00.000.000/0000-00" :
                      pixType === "phone"  ? "(11) 99999-9999"    :
                      pixType === "email"  ? "email@exemplo.com"  :
                                            "Chave aleatória"
                    }
                    inputMode={pixType === "cpf" || pixType === "cnpj" || pixType === "phone" ? "numeric" : "text"}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 h-8 text-xs" onClick={handleSavePix} disabled={savingPix || !pixKey.trim()}>
                    {savingPix ? "Salvando..." : "Salvar"}
                  </Button>
                  {savedPixKey && (
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setEditingPix(false); setPixKey(savedPixKey); setPixType(savedPixType || "cpf"); }}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>
            )}
            <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground font-light">
              <Info className="h-3 w-3 shrink-0 mt-0.5" />
              <span>Usada pela steps academy para processar seus pagamentos.</span>
            </div>
          </CardContent>
        </Card>

        {/* ── Tema + Segurança ── */}
        <Card className="bento-temasg flex flex-col">
          <CardContent className="p-4 flex-1 space-y-4">
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Tema</span>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(themes) as [ThemeKey, typeof themes[ThemeKey]][]).map(([key, t]) => (
                  <button
                    key={key}
                    onClick={() => setTheme(key)}
                    title={t.name}
                    className={cn(
                      "h-7 w-7 rounded-full transition-all hover:scale-110 focus:outline-none",
                      activeTheme === key ? "ring-2 ring-offset-2 ring-primary scale-110" : ""
                    )}
                    style={{ background: t.primary }}
                  />
                ))}
              </div>
              <p className="text-xs font-medium">{themes[activeTheme as ThemeKey]?.name ?? ""}</p>
            </div>

            <div className="border-t pt-3 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Segurança</span>
              <Button size="sm" variant="outline" className="w-full gap-2" onClick={() => setPwOpen(true)}>
                <Lock className="h-3.5 w-3.5" />
                Alterar senha
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Horários ── */}
        <Card className="bento-horarios">
          <CardContent className="p-4 flex flex-col h-full gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Disponibilidade</span>
              <button
                onClick={onSwitchToAvailability}
                className="text-[10px] text-primary hover:underline font-medium"
              >
                Editar →
              </button>
            </div>
            <div className="flex-1 flex flex-col justify-between gap-1">
              {DAY_LABELS.map((day, i) => (
                <div key={day} className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground w-8 shrink-0">{day}</span>
                  <div className={cn(
                    "flex-1 rounded px-2 py-1 text-xs font-bold text-center",
                    slotsPerDay[i] > 0
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground/50"
                  )}>
                    {slotsPerDay[i] > 0 ? `${slotsPerDay[i]} horário${slotsPerDay[i] > 1 ? "s" : ""}` : "—"}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Ajuda (4 colunas) ── */}
        <Card className="bento-ajuda">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-bold">Central de Ajuda</CardTitle>
              <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs h-7">
                <Link to="/chat?support=1">
                  <Headphones className="h-3.5 w-3.5" />
                  Falar com suporte
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar pergunta ou palavra-chave…"
                value={helpSearch}
                onChange={e => setHelpSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {filteredHelp !== null ? (
              filteredHelp.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <HelpCircle className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground font-light">
                    Nenhum resultado para{" "}
                    <span className="font-medium text-foreground">"{helpSearch}"</span>.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-light uppercase tracking-wide">
                    {filteredHelp.length} {filteredHelp.length === 1 ? "resultado" : "resultados"}
                  </p>
                  <Accordion type="multiple">
                    {filteredHelp.map((item, i) => (
                      <AccordionItem key={i} value={`search-${i}`}>
                        <AccordionTrigger className="text-sm font-semibold text-left">
                          {item.question}
                        </AccordionTrigger>
                        <AccordionContent>
                          <p className="text-sm text-muted-foreground font-light leading-relaxed">{item.answer}</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-2 uppercase tracking-wide">{item.section}</p>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              )
            ) : (
              <div className="space-y-6">
                {teacherHelp.map((sec, si) => (
                  <div key={si} className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      {sec.section}
                    </h3>
                    <Accordion type="multiple">
                      {sec.items.map((item, ii) => (
                        <AccordionItem key={ii} value={`${si}-${ii}`}>
                          <AccordionTrigger className="text-sm font-semibold text-left">
                            {item.question}
                          </AccordionTrigger>
                          <AccordionContent>
                            <p className="text-sm text-muted-foreground font-light leading-relaxed">{item.answer}</p>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* ── Sair da conta ── */}
      <Card>
        <CardContent className="p-4">
          <Button
            variant="ghost"
            className="w-full gap-2 text-red-500 hover:text-red-600 hover:bg-red-500/10"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" />
            Sair da conta
          </Button>
        </CardContent>
      </Card>

      {/* ── Password dialog ── */}
      <Dialog open={pwOpen} onOpenChange={open => { setPwOpen(open); if (!open) { setNewPw(""); setConfirmPw(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterar senha</DialogTitle>
            <DialogDescription>
              A nova senha deve ter pelo menos 8 caracteres.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Nova senha</label>
              <Input
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Confirmar senha</label>
              <Input
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                placeholder="Repita a nova senha"
                autoComplete="new-password"
                onKeyDown={e => e.key === "Enter" && handleChangePassword()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwOpen(false)}>Cancelar</Button>
            <Button onClick={handleChangePassword} disabled={savingPw || !newPw || !confirmPw}>
              {savingPw ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default TeacherProfileTab;
