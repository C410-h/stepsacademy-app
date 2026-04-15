import { useEffect, useRef, useState } from "react";
import TeacherLayout from "@/components/TeacherLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, Save, Mail, Phone, BookOpen, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ThemeSwitcher from "@/components/ThemeSwitcher";

interface ProfileData {
  id: string;
  name: string;
  phone: string | null;
  avatar_url: string | null;
}

interface TeacherData {
  id: string;
  bio: string | null;
}

export default function TeacherProfile() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [teacherData, setTeacherData] = useState<TeacherData | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.id) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [profileRes, teacherRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, name, phone, avatar_url")
            .eq("id", profile.id)
            .single(),
          supabase
            .from("teachers")
            .select("id, bio")
            .eq("user_id", profile.id)
            .maybeSingle(),
        ]);

        if (profileRes.error) throw profileRes.error;

        const p = profileRes.data as ProfileData;
        setProfileData(p);
        setName(p.name ?? "");
        setPhone(p.phone ?? "");
        setAvatarUrl(p.avatar_url ?? null);

        if (!teacherRes.error && teacherRes.data) {
          const t = teacherRes.data as TeacherData;
          setTeacherData(t);
          setBio(t.bio ?? "");
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
        toast({
          title: "Erro ao carregar perfil",
          description: "Não foi possível carregar seus dados.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile?.id]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profileData) return;

    setUploadingAvatar(true);
    try {
      const path = `teacher-${profileData.id}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);

      const newUrl = urlData.publicUrl;
      setAvatarUrl(newUrl);

      await supabase
        .from("profiles")
        .update({ avatar_url: newUrl })
        .eq("id", profileData.id);

      toast({
        title: "Avatar atualizado",
        description: "Sua foto foi salva com sucesso.",
      });
    } catch (err) {
      console.error("Error uploading avatar:", err);
      toast({
        title: "Erro ao enviar imagem",
        description: "Não foi possível atualizar o avatar.",
        variant: "destructive",
      });
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!profileData) return;
    setSaving(true);
    try {
      const profileUpdate = supabase
        .from("profiles")
        .update({ name: name.trim(), phone: phone.trim() || null, avatar_url: avatarUrl })
        .eq("id", profileData.id);

      const updates: Promise<unknown>[] = [profileUpdate.then()];

      if (teacherData) {
        const teacherUpdate = supabase
          .from("teachers")
          .update({ bio: bio.trim() || null })
          .eq("id", teacherData.id);
        updates.push(teacherUpdate.then());
      }

      const results = await Promise.all(updates);

      for (const res of results) {
        const r = res as { error: unknown };
        if (r.error) throw r.error;
      }

      toast({
        title: "Perfil salvo",
        description: "Suas informações foram atualizadas.",
      });
    } catch (err) {
      console.error("Error saving profile:", err);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as alterações.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    const email = (profile as any)?.email;
    if (!email) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      toast({
        title: "E-mail enviado",
        description: "Verifique sua caixa de entrada para redefinir a senha.",
      });
    } catch (err) {
      console.error("Error resetting password:", err);
      toast({
        title: "Erro",
        description: "Não foi possível enviar o e-mail de redefinição.",
        variant: "destructive",
      });
    }
  };

  const getInitials = (n: string) =>
    n
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");

  return (
    <TeacherLayout>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Meu Perfil</h1>

        {/* Theme switcher */}
        <ThemeSwitcher />

        {/* Avatar card */}
        <Card>
          <CardContent className="pt-6 flex flex-col items-center gap-3">
            {loading ? (
              <Skeleton className="h-24 w-24 rounded-full" />
            ) : (
              <div className="relative">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={avatarUrl ?? undefined} alt={name} />
                  <AvatarFallback className="text-2xl">
                    {getInitials(name)}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={handleAvatarClick}
                  disabled={uploadingAvatar}
                  className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-1.5 shadow hover:bg-primary/90 transition-colors disabled:opacity-60"
                  aria-label="Alterar foto"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>
            )}
            {uploadingAvatar && (
              <p className="text-sm text-muted-foreground">Enviando imagem…</p>
            )}
          </CardContent>
        </Card>

        {/* Info card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informações pessoais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-24 w-full" />
              </>
            ) : (
              <>
                {/* Name */}
                <div className="space-y-1.5">
                  <Label htmlFor="name">Nome completo</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                  />
                </div>

                {/* Email (read-only) */}
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    E-mail
                  </Label>
                  <Input
                    id="email"
                    value={(profile as any)?.email ?? ""}
                    readOnly
                    disabled
                    className="bg-muted cursor-not-allowed"
                  />
                </div>

                {/* Phone */}
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    Telefone
                  </Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+55 (11) 99999-9999"
                  />
                </div>

                {/* Bio */}
                <div className="space-y-1.5">
                  <Label htmlFor="bio" className="flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5" />
                    Bio
                  </Label>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Conte um pouco sobre você…"
                    rows={4}
                    className="resize-none"
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Security card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Segurança</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Senha</p>
                <p className="text-xs text-muted-foreground">
                  Enviaremos um link de redefinição para o seu e-mail.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePasswordReset}
                className="flex items-center gap-1.5 shrink-0"
              >
                <Lock className="h-3.5 w-3.5" />
                Alterar senha
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Save button */}
        <Button
          className="w-full flex items-center gap-2"
          onClick={handleSave}
          disabled={saving || loading}
        >
          <Save className="h-4 w-4" />
          {saving ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </TeacherLayout>
  );
}
