import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGamification } from "@/contexts/GamificationContext";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { ShoppingBag, Gift, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
const steppieFantasia = "/steppie/steppie-fantasia.webp";

const db = supabase as any;

interface StoreItem {
  id: string;
  title: string;
  description: string | null;
  coins_cost: number;
  category: string;
  stock: number | null;
  image_url: string | null;
}

interface Redemption {
  id: string;
  item_id: string;
  coins_spent: number;
  status: string;
  redeemed_at: string;
  store_items: { title: string } | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  desconto: "Desconto",
  aula_extra: "Aula Extra",
  brinde: "Brinde",
};

const CATEGORY_EMOJIS: Record<string, string> = {
  desconto: "🏷️",
  aula_extra: "📅",
  brinde: "🎁",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Aguardando",
  approved: "Aprovado",
  delivered: "Entregue",
};

const Loja = () => {
  const { profile } = useAuth();
  const { gamification, refresh: refreshGamification } = useGamification();

  const [studentId, setStudentId] = useState<string | null>(null);
  const [items, setItems] = useState<StoreItem[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [confirmItem, setConfirmItem] = useState<StoreItem | null>(null);
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    if (!profile) return;
    loadAll();
  }, [profile]);

  const loadAll = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      // Get student id
      const { data: student } = await supabase
        .from("students")
        .select("id")
        .eq("user_id", profile.id)
        .maybeSingle();

      if (!student) { setLoading(false); return; }
      setStudentId(student.id);

      const [{ data: storeItems }, { data: myRedemptions }] = await Promise.all([
        db.from("store_items").select("id, title, description, coins_cost, category, stock, image_url").eq("active", true).order("coins_cost"),
        db.from("store_redemptions").select("id, item_id, coins_spent, status, redeemed_at, store_items(title)").eq("student_id", student.id).order("redeemed_at", { ascending: false }),
      ]);

      setItems(storeItems || []);
      setRedemptions(myRedemptions || []);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  const handleRedeem = async () => {
    if (!confirmItem || !studentId) return;
    if (gamification.coins < confirmItem.coins_cost) {
      toast({ title: "Coins insuficientes", description: "Ganhe mais coins completando exercícios!", variant: "destructive" });
      setConfirmItem(null);
      return;
    }

    setRedeeming(true);
    try {
      // Debit coins
      await db.from("student_gamification").update({
        coins: gamification.coins - confirmItem.coins_cost,
        updated_at: new Date().toISOString(),
      }).eq("student_id", studentId);

      // Insert redemption
      await db.from("store_redemptions").insert({
        student_id: studentId,
        item_id: confirmItem.id,
        coins_spent: confirmItem.coins_cost,
        status: "pending",
      });

      await refreshGamification();
      await loadAll();

      toast({ title: "🎉 Resgate feito!", description: `Você resgatou "${confirmItem.title}". Aguarde a confirmação.` });
      setConfirmItem(null);
    } catch {
      toast({ title: "Erro ao resgatar", description: "Tente novamente.", variant: "destructive" });
    } finally {
      setRedeeming(false);
    }
  };

  const categories = ["all", ...Array.from(new Set(items.map(i => i.category)))];
  const filtered = categoryFilter === "all" ? items : items.filter(i => i.category === categoryFilter);

  return (
    <StudentLayout>
      <div className="space-y-4">
        {/* ── Header with coins balance ─── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={steppieFantasia} alt="" aria-hidden="true" className="w-10" />
            <h2 className="text-xl font-bold">Loja</h2>
          </div>
          <div className="flex items-center gap-1.5 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-full px-3 py-1.5">
            <span className="text-base leading-none">🪙</span>
            <span className="text-sm font-bold text-yellow-700 dark:text-yellow-300">
              {gamification.coins.toLocaleString("pt-BR")}
            </span>
            <span className="text-xs text-yellow-600 dark:text-yellow-400 font-light">coins</span>
          </div>
        </div>

        {/* ── Category filter ─── */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {categories.map(cat => (
            <Button
              key={cat}
              variant={categoryFilter === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setCategoryFilter(cat)}
              className={cn("shrink-0 text-xs", categoryFilter === cat && "bg-primary text-primary-foreground")}
            >
              {cat === "all" ? "Todos" : `${CATEGORY_EMOJIS[cat] || ""} ${CATEGORY_LABELS[cat] || cat}`}
            </Button>
          ))}
        </div>

        {/* ── Store items grid ─── */}
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-44 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
              <ShoppingBag className="h-12 w-12 text-muted-foreground/40" />
              <p className="font-bold text-sm">Nenhum item disponível</p>
              <p className="text-xs text-muted-foreground">Novidades chegando em breve!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(item => {
              const canAfford = gamification.coins >= item.coins_cost;
              return (
                <Card
                  key={item.id}
                  className={cn(
                    "flex flex-col cursor-pointer transition-all hover:shadow-md",
                    !canAfford && "opacity-60"
                  )}
                  onClick={() => setConfirmItem(item)}
                >
                  <CardContent className="p-4 flex flex-col gap-2 flex-1">
                    <div className="text-3xl text-center py-2">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.title} className="h-12 w-12 object-contain mx-auto" />
                      ) : (
                        CATEGORY_EMOJIS[item.category] || "🎁"
                      )}
                    </div>
                    <Badge variant="secondary" className="text-[10px] w-fit">
                      {CATEGORY_LABELS[item.category] || item.category}
                    </Badge>
                    <p className="text-sm font-bold leading-tight">{item.title}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground font-light line-clamp-2">{item.description}</p>
                    )}
                    <div className="mt-auto pt-2 flex items-center gap-1">
                      <span className="text-sm">🪙</span>
                      <span className={cn("text-sm font-bold", canAfford ? "text-yellow-600" : "text-muted-foreground")}>
                        {item.coins_cost.toLocaleString("pt-BR")}
                      </span>
                    </div>
                    {item.stock !== null && (
                      <p className="text-[10px] text-muted-foreground">{item.stock} disponíveis</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── Redemption history ─── */}
        {!loading && redemptions.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Meus resgates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pb-4">
              {redemptions.map(r => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{(r.store_items as any)?.title || "—"}</p>
                    <p className="text-xs text-muted-foreground font-light">
                      🪙 {r.coins_spent} · {new Date(r.redeemed_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] shrink-0 ml-2",
                      r.status === "delivered" && "border-green-500 text-green-600",
                      r.status === "approved" && "border-blue-500 text-blue-600",
                      r.status === "pending" && "border-yellow-500 text-yellow-600"
                    )}
                  >
                    {r.status === "delivered" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                    {STATUS_LABELS[r.status] || r.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Confirm dialog ─── */}
      <Dialog open={!!confirmItem} onOpenChange={open => !open && setConfirmItem(null)}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>Confirmar resgate</DialogTitle>
          </DialogHeader>
          {confirmItem && (
            <div className="space-y-3 py-2">
              <div className="text-center text-4xl py-2">
                {CATEGORY_EMOJIS[confirmItem.category] || "🎁"}
              </div>
              <p className="text-center font-bold">{confirmItem.title}</p>
              {confirmItem.description && (
                <p className="text-center text-sm text-muted-foreground">{confirmItem.description}</p>
              )}
              <div className="flex items-center justify-center gap-2 py-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <span className="text-xl">🪙</span>
                <p className="text-sm">
                  Você vai usar <span className="font-bold">{confirmItem.coins_cost.toLocaleString("pt-BR")} coins</span>.
                </p>
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Saldo após resgate: <span className="font-bold">{(gamification.coins - confirmItem.coins_cost).toLocaleString("pt-BR")} coins</span>
              </p>
            </div>
          )}
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setConfirmItem(null)} disabled={redeeming}>
              Cancelar
            </Button>
            <Button
              className="bg-primary text-white"
              onClick={handleRedeem}
              disabled={redeeming || !confirmItem || gamification.coins < (confirmItem?.coins_cost ?? 0)}
            >
              {redeeming ? "Processando..." : "Confirmar resgate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StudentLayout>
  );
};

export default Loja;
