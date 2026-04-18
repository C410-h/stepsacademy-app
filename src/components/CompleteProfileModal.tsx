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

export type MissingField = "name" | "phone" | "cpf" | "birth_date";

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

// Data máxima: usuário deve ter ao menos 16 anos
const maxBirthDate = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 16);
  return d.toISOString().split("T")[0];
})();

// ── Componente ─────────────────────────────────────────────────────────────────

const CompleteProfileModal = ({ open, missingFields, onComplete }: Props) => {
  const { profile, user } = useAuth();

  const needs = (f: MissingField) => missingFields.includes(f);

  // Valores dos campos
  const [name, setName] = useState(profile?.name || "");
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
      if (!birthDate)
        e.birth_date = "Informe sua data de nascimento.";
      else if (birthDate > maxBirthDate)
        e.birth_date = "Você deve ter ao menos 16 anos.";
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
      if (needs("birth_date")) updates.birth_date = birthDate;

      const { error } = await (supabase as any)
        .from("profiles")
        .update(updates)
        .eq("id", profile.id);

      if (error) throw error;

      toast({ title: "Perfil atualizado!" });
      onComplete();
    } catch (err: any) {
      toast({
        title: "Erro ao salvar perfil",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open}>
      {/* [&>button]:hidden oculta o X automático do DialogContent */}
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

          {/* Nome completo */}
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
                type="date"
                value={birthDate}
                onChange={e => setBirthDate(e.target.value)}
                max={maxBirthDate}
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
