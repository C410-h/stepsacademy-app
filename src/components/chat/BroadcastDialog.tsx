import { useState, useMemo } from "react";
import { Megaphone, Search, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("");

export interface BroadcastRecipient {
  user_id: string;
  name: string;
  avatar_url?: string | null;
  subtitle?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: BroadcastRecipient[];
  onSend: (userIds: string[], message: string) => Promise<void>;
}

export function BroadcastDialog({ open, onOpenChange, recipients, onSend }: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recipients;
    return recipients.filter(r => r.name.toLowerCase().includes(q));
  }, [recipients, search]);

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.user_id)));
  };

  const toggle = (id: string) => {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (!message.trim() || selected.size === 0) return;
    setSending(true);
    try {
      await onSend([...selected], message.trim());
      onOpenChange(false);
      setMessage("");
      setSelected(new Set());
      setSearch("");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4 text-[var(--theme-brand-on-bg)]" />
            Enviar anúncio
          </DialogTitle>
        </DialogHeader>

        {/* Recipient picker */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Destinatários ({selected.size}/{recipients.length})
            </span>
            <button onClick={toggleAll} className="text-xs text-[var(--theme-brand-on-bg)] hover:underline">
              {selected.size === filtered.length ? "Desmarcar todos" : "Selecionar todos"}
            </button>
          </div>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar destinatário"
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-muted/50 border border-transparent focus:bg-background focus:border-input focus:outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto border rounded-md divide-y">
            {filtered.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-4">Ninguém encontrado.</p>
            ) : filtered.map(r => {
              const isSel = selected.has(r.user_id);
              return (
                <button
                  key={r.user_id}
                  onClick={() => toggle(r.user_id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-2.5 py-2 text-left hover:bg-muted/50",
                    isSel && "bg-[var(--theme-accent)]/20"
                  )}
                >
                  <Avatar className="h-7 w-7">
                    {r.avatar_url && <AvatarImage src={r.avatar_url} />}
                    <AvatarFallback className="text-[10px] bg-muted-foreground/10">{initials(r.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{r.name}</p>
                    {r.subtitle && <p className="text-[10px] text-muted-foreground truncate">{r.subtitle}</p>}
                  </div>
                  <div className={cn(
                    "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                    isSel
                      ? "bg-[var(--theme-brand-on-bg)] border-[var(--theme-brand-on-bg)]"
                      : "border-input"
                  )}>
                    {isSel && <Check className="h-3 w-3 text-[var(--theme-text-on-brand)]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Message input */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Mensagem</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Escreva o anúncio…"
            rows={3}
            className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-1 focus:ring-[var(--theme-brand-on-bg)]/40"
          />
        </div>

        <Button
          onClick={handleSend}
          disabled={sending || !message.trim() || selected.size === 0}
          className="w-full bg-[var(--theme-button-bg)] text-[var(--theme-button-text)] hover:opacity-90"
        >
          {sending ? "Enviando…" : `Enviar para ${selected.size} ${selected.size === 1 ? "pessoa" : "pessoas"}`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
