import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ShoppingBag } from "lucide-react";

const db = supabase as any;

const CATEGORIES = [
  { value: "desconto",   label: "Desconto",   emoji: "🏷️" },
  { value: "aula_extra", label: "Aula Extra",  emoji: "📅" },
  { value: "brinde",     label: "Brinde",      emoji: "🎁" },
];

interface StoreItem {
  id: string;
  title: string;
  description: string | null;
  coins_cost: number;
  category: string;
  stock: number | null;
  image_url: string | null;
  active: boolean;
  created_at: string;
}

const EMPTY_FORM = {
  title: "",
  description: "",
  coins_cost: "",
  category: "brinde",
  stock: "",
  image_url: "",
  active: true,
};

const AdminStoreTab = () => {
  const [items, setItems]       = useState<StoreItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [open, setOpen]         = useState(false);
  const [editing, setEditing]   = useState<StoreItem | null>(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await db
      .from("store_items")
      .select("*")
      .order("created_at", { ascending: false });
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (item: StoreItem) => {
    setEditing(item);
    setForm({
      title:       item.title,
      description: item.description ?? "",
      coins_cost:  String(item.coins_cost),
      category:    item.category,
      stock:       item.stock != null ? String(item.stock) : "",
      image_url:   item.image_url ?? "",
      active:      item.active,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast({ title: "Informe o título do item.", variant: "destructive" });
      return;
    }
    const cost = parseInt(form.coins_cost);
    if (isNaN(cost) || cost < 1) {
      toast({ title: "Custo em coins inválido.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload = {
      title:       form.title.trim(),
      description: form.description.trim() || null,
      coins_cost:  cost,
      category:    form.category,
      stock:       form.stock !== "" ? parseInt(form.stock) : null,
      image_url:   form.image_url.trim() || null,
      active:      form.active,
    };

    const { error } = editing
      ? await db.from("store_items").update(payload).eq("id", editing.id)
      : await db.from("store_items").insert(payload);

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? "Item atualizado!" : "Item criado!" });
    setOpen(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este item permanentemente?")) return;
    setDeleting(id);
    const { error } = await db.from("store_items").delete().eq("id", id);
    setDeleting(null);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Item excluído." });
    load();
  };

  const handleToggleActive = async (item: StoreItem) => {
    await db.from("store_items").update({ active: !item.active }).eq("id", item.id);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, active: !i.active } : i));
  };

  const catInfo = (cat: string) => CATEGORIES.find(c => c.value === cat) ?? { emoji: "🎁", label: cat };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground font-light">
          {items.length} {items.length === 1 ? "item" : "itens"} cadastrados
        </p>
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" /> Novo item
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <ShoppingBag className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-medium">Nenhum item cadastrado ainda.</p>
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" /> Criar primeiro item
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const cat = catInfo(item.category);
            return (
              <Card key={item.id} className={!item.active ? "opacity-50" : undefined}>
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <span className="text-2xl shrink-0">{cat.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold truncate">{item.title}</p>
                      <Badge variant="secondary" className="text-[10px]">{cat.label}</Badge>
                      {!item.active && <Badge variant="outline" className="text-[10px] text-muted-foreground">Inativo</Badge>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-yellow-600 font-bold">🪙 {item.coins_cost.toLocaleString("pt-BR")}</span>
                      {item.stock != null && (
                        <span className="text-xs text-muted-foreground font-light">{item.stock} em estoque</span>
                      )}
                      {item.description && (
                        <span className="text-xs text-muted-foreground font-light truncate hidden sm:block">{item.description}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={item.active}
                      onCheckedChange={() => handleToggleActive(item)}
                      aria-label="Ativo"
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(item)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon" variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(item.id)}
                      disabled={deleting === item.id}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={o => { if (!saving) setOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar item" : "Novo item da loja"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input
                placeholder="Ex: Aula extra grátis"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                placeholder="Descreva o benefício..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Custo em coins *</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="500"
                  value={form.coins_cost}
                  onChange={e => setForm(f => ({ ...f, coins_cost: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Estoque <span className="text-muted-foreground font-light">(opcional)</span></Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="Ilimitado"
                  value={form.stock}
                  onChange={e => setForm(f => ({ ...f, stock: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Categoria *</Label>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, category: cat.value }))}
                    className={`rounded-lg border-2 p-2 text-xs font-medium transition-all ${
                      form.category === cat.value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <div className="text-lg mb-0.5">{cat.emoji}</div>
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Ativo</p>
                <p className="text-xs text-muted-foreground font-light">Visível para os alunos na loja</p>
              </div>
              <Switch
                checked={form.active}
                onCheckedChange={v => setForm(f => ({ ...f, active: v }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando…" : editing ? "Salvar alterações" : "Criar item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminStoreTab;
