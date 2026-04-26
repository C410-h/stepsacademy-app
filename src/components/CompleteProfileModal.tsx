import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Loader2, UserCircle } from "lucide-react";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export type MissingField = "name" | "full_name" | "phone" | "cpf" | "birth_date";

interface Props {
  open: boolean;
  missingFields: MissingField[];
  onComplete: () => void;
}

// ── Formatadores ───────────────────────────────────────────────────────────────

const formatCPF = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

const formatPhone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

const formatBirthDate = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
};

const parseBirthDate = (v: string): Date | null => {
  const parts = v.split("/");
  if (parts.length !== 3 || parts[2].length !== 4) return null;
  const [day, month, year] = parts.map(Number);
  if (!day || !month || !year) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null;
  return date;
};

// Derives a display name (first + last word) from a full legal name
const deriveUsername = (fullName: string): string => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(" ");
  return `${parts[0]} ${parts[parts.length - 1]}`;
};

// ── Componente ─────────────────────────────────────────────────────────────────

const CompleteProfileModal = ({ open, missingFields, onComplete }: Props) => {
  const { profile, user } = useAuth();

  const needs = (f: MissingField) => missingFields.includes(f);

  const [name, setName] = useState(profile?.name || "");
  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [birthDate, setBirthDate] = useState("");

  const [errors, setErrors] = useState<Partial<Record<MissingField, string>>>({});
  const [saving, setSaving] = useState(false);

  // ── Validação ────────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const e: Partial<Record<MissingField, string>> = {};

    if (needs("name")) {
      const parts = name.trim().split(/\s+/);
      if (parts.length < 2 || parts.some(p => p.length === 0))
        e.name = "Informe nome e sobrenome.";
    }

    if (needs("full_name")) {
      const parts = fullName.trim().split(/\s+/).filter(Boolean);
      if (parts.length < 2)
        e.full_name = "Informe seu nome completo (nome e sobrenome).";
    }

    if (needs("cpf")) {
      if (cpf.replace(/\D/g, "").length !== 11)
        e.cpf = "CPF inválido — informe os 11 dígitos.";
    }

    if (needs("phone")) {
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 11)
        e.phone = "Telefone inválido.";
    }

    if (needs("birth_date")) {
      const parsed = parseBirthDate(birthDate);
      if (!parsed) {
        e.birth_date = "Data inválida. Use o formato DD/MM/AAAA.";
      } else {
        const minDate = new Date();
        minDate.setFullYear(minDate.getFullYear() - 16);
        if (parsed > minDate) e.birth_date = "Você deve ter ao menos 16 anos.";
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Salvar ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!validate() || !profile) return;

    setSaving(true);
    try {
      const updates: Record<string, string> = {};
      if (needs("name"))       updates.name       = name.trim();
      if (needs("cpf"))        updates.cpf        = cpf.replace(/\D/g, "");
      if (needs("phone"))      updates.phone      = phone;
      if (needs("birth_date")) {
        const [dd, mm, aaaa] = birthDate.split("/");
        updates.birth_date = `${aaaa}-${mm}-${dd}`;
      }
      if (needs("full_name")) {
        updates.full_name = fullName.trim();
        // Auto-derive username (display name) as first + last word
        updates.name = deriveUsername(fullName);
      }

      const { error } = await (supabase as any)
        .from("profiles")
        .update(updates)
        .eq("id", profile.id);

      if (error) throw error;

      // Log completion
      await (supabase as any)
        .from("profile_completion_log")
        .insert({ profile_id: profile.id, event: "completed" });

      toast({ title: "Perfil atualizado!" });
      onComplete();
    } catch (err: any) {
      const isCpfDuplicate = err?.message?.includes("profiles_cpf_unique");
      toast({
        title: isCpfDuplicate ? "CPF já cadastrado" : "Erro ao salvar perfil",
        description: isCpfDuplicate
          ? "CPF já cadastrado. Para mais informações, entre em contato com nossa equipe."
          : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open}>
      <DialogContent
        className="w-full max-w-md mx-auto sm:max-w-md [&>button]:hidden"
        onInteractOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex justify-center mb-2">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <UserCircle className="h-8 w-8 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">
            Complete seu perfil
          </DialogTitle>
          <DialogDescription className="text-center font-light">
            Precisamos de mais algumas informações para liberar seu acesso completo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">

          {/* Email — sempre exibido, read-only do auth */}
          <div className="space-y-1.5">
            <Label htmlFor="email-ro">E-mail</Label>
            <Input
              id="email-ro"
              type="email"
              value={user?.email ?? ""}
              readOnly
              disabled
              className="bg-muted/50 text-muted-foreground cursor-default"
            />
          </div>

          {/* Nome completo (campo legado — para perfis sem nome algum) */}
          {needs("name") && (
            <div className="space-y-1.5">
              <Label htmlFor="cp-name">Nome completo</Label>
              <Input
                id="cp-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Seu nome e sobrenome"
                autoComplete="name"
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name}</p>
              )}
            </div>
          )}

          {/* Nome completo legal (full_name) */}
          {needs("full_name") && (
            <div className="space-y-1.5">
              <Label htmlFor="cp-fullname">Nome completo (como no documento)</Label>
              <Input
                id="cp-fullname"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Ex: Ana Carolina Souza Lima"
                autoComplete="name"
              />
              <p className="text-[11px] text-muted-foreground">
                Seu nome de exibição no app será gerado automaticamente.
              </p>
              {errors.full_name && (
                <p className="text-xs text-destructive">{errors.full_name}</p>
              )}
            </div>
          )}

          {/* CPF */}
          {needs("cpf") && (
            <div className="space-y-1.5">
              <Label htmlFor="cp-cpf">CPF</Label>
              <Input
                id="cp-cpf"
                inputMode="numeric"
                value={cpf}
                onChange={e => setCpf(formatCPF(e.target.value))}
                placeholder="000.000.000-00"
                maxLength={14}
              />
              {errors.cpf && (
                <p className="text-xs text-destructive">{errors.cpf}</p>
              )}
            </div>
          )}

          {/* Telefone */}
          {needs("phone") && (
            <div className="space-y-1.5">
              <Label htmlFor="cp-phone">WhatsApp / Telefone</Label>
              <Input
                id="cp-phone"
                type="tel"
                value={phone}
                onChange={e => setPhone(formatPhone(e.target.value))}
                placeholder="(11) 99999-9999"
                autoComplete="tel"
              />
              {errors.phone && (
                <p className="text-xs text-destructive">{errors.phone}</p>
              )}
            </div>
          )}

          {/* Data de nascimento */}
          {needs("birth_date") && (
            <div className="space-y-1.5">
              <Label htmlFor="cp-birth">Data de nascimento</Label>
              <Input
                id="cp-birth"
                inputMode="numeric"
                value={birthDate}
                onChange={e => setBirthDate(formatBirthDate(e.target.value))}
                placeholder="DD/MM/AAAA"
                maxLength={10}
              />
              {errors.birth_date && (
                <p className="text-xs text-destructive">{errors.birth_date}</p>
              )}
            </div>
          )}

          <Button
            className="w-full font-bold mt-2"
            onClick={handleSave}
            disabled={saving}
          >
            {saving
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</>
              : "Salvar e continuar"
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CompleteProfileModal;
