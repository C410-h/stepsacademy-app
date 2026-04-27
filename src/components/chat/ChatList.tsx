import { useState, useMemo } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { Search, Pin, BellOff, Archive, Megaphone, Headphones } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { ChatRoom } from "./types";

const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("");

const fmtPreviewTime = (iso: string) => {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Ontem";
  return format(d, "dd/MM");
};

interface Props {
  rooms: ChatRoom[];
  activeRoomId?: string | null;
  onSelectRoom: (roomId: string) => void;
  onBroadcast?: () => void;
  showArchived?: boolean;
  emptyHint?: string;
}

export function ChatList({ rooms, activeRoomId, onSelectRoom, onBroadcast, showArchived = false, emptyHint }: Props) {
  const [search, setSearch] = useState("");
  const [archivedOpen, setArchivedOpen] = useState(false);

  const { visible, archived } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rooms.filter(r => !q || r.display_name.toLowerCase().includes(q));
    const visible = filtered.filter(r => !r.is_archived);
    const archived = filtered.filter(r => r.is_archived);
    visible.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });
    return { visible, archived };
  }, [rooms, search]);

  return (
    <div className="flex flex-col h-full bg-background border-r">
      {/* Header */}
      <div className="px-3 py-2.5 border-b">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-sm">Conversas</h2>
          {onBroadcast && (
            <button
              onClick={onBroadcast}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-[var(--theme-accent)]/30 text-[var(--theme-brand-on-bg)] hover:bg-[var(--theme-accent)]/50 transition-colors"
            >
              <Megaphone className="h-3 w-3" />
              Anúncio
            </button>
          )}
        </div>
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar"
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-muted/50 border border-transparent focus:bg-background focus:border-input focus:outline-none"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 && archived.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm p-6">
            {emptyHint ?? "Nenhuma conversa ainda."}
          </div>
        ) : (
          <>
            {visible.map(room => (
              <RoomRow
                key={room.id}
                room={room}
                active={room.id === activeRoomId}
                onClick={() => onSelectRoom(room.id)}
              />
            ))}

            {showArchived && archived.length > 0 && (
              <div className="border-t mt-1 pt-1">
                <button
                  onClick={() => setArchivedOpen(o => !o)}
                  className="w-full flex items-center gap-2 text-xs text-muted-foreground px-3 py-2 hover:bg-muted/50"
                >
                  <Archive className="h-3 w-3" />
                  Arquivadas ({archived.length})
                </button>
                {archivedOpen && archived.map(room => (
                  <RoomRow
                    key={room.id}
                    room={room}
                    active={room.id === activeRoomId}
                    onClick={() => onSelectRoom(room.id)}
                    dimmed
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RoomRow({ room, active, onClick, dimmed }: { room: ChatRoom; active: boolean; onClick: () => void; dimmed?: boolean }) {
  const isSupport = room.kind === "support";
  // Owner view of support: emphasize with accent border + tinted background.
  // Admin view of support rooms (display_role !== "support") looks normal.
  const isSupportOwner = isSupport && room.display_role === "support";
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors border-b border-border/40",
        isSupportOwner && !active && "bg-[var(--theme-accent)]/15 border-l-4 border-l-[var(--theme-brand-on-bg)] pl-[8px] hover:bg-[var(--theme-accent)]/25",
        isSupportOwner && active && "bg-[var(--theme-accent)]/40 border-l-4 border-l-[var(--theme-brand-on-bg)] pl-[8px]",
        !isSupportOwner && active && "bg-[var(--theme-accent)]/30",
        !isSupportOwner && !active && "hover:bg-muted/50",
        dimmed && "opacity-60"
      )}
    >
      <Avatar className={cn(
        "h-10 w-10 shrink-0",
        isSupportOwner && "ring-2 ring-[var(--theme-brand-on-bg)]/40 ring-offset-1 ring-offset-background"
      )}>
        {room.display_avatar && <AvatarImage src={room.display_avatar} className={cn(isSupportOwner && "object-cover bg-[var(--theme-accent)]/30")} />}
        <AvatarFallback className={cn(
          "text-xs font-medium",
          isSupport
            ? "bg-amber-100 text-amber-700"
            : "bg-[var(--theme-accent)]/30 text-[var(--theme-brand-on-bg)]"
        )}>
          {isSupport ? <Headphones className="h-4 w-4" /> : initials(room.display_name)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {room.is_pinned && <Pin className="h-3 w-3 text-muted-foreground shrink-0" />}
          <p className={cn(
            "font-medium text-sm truncate flex-1",
            isSupportOwner && "text-[var(--theme-brand-on-bg)] font-semibold"
          )}>{room.display_name}</p>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {fmtPreviewTime(room.last_message_at)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-xs text-muted-foreground truncate flex-1">
            {room.last_message?.deleted_at
              ? <span className="italic">Mensagem apagada</span>
              : room.last_message?.content
                ?? (room.last_message?.file_name ? `📎 ${room.last_message.file_name}` : "—")
            }
          </p>
          {room.is_muted && <BellOff className="h-3 w-3 text-muted-foreground shrink-0" />}
          {room.unread_count > 0 && !room.is_muted && (
            <span className="text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--theme-brand-on-bg)] text-[var(--theme-text-on-brand)] flex items-center justify-center">
              {room.unread_count > 99 ? "99+" : room.unread_count}
            </span>
          )}
          {room.unread_count > 0 && room.is_muted && (
            <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
          )}
        </div>
      </div>
    </button>
  );
}
