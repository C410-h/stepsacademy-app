import { useEffect, useRef, useState, useMemo } from "react";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, MoreVertical, BellOff, Bell, Pin, PinOff, Archive, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import type { ChatRoom as ChatRoomT, ChatMessage } from "./types";

const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("");

const dayLabel = (d: Date) => {
  if (isToday(d)) return "Hoje";
  if (isYesterday(d)) return "Ontem";
  return format(d, "d 'de' MMMM", { locale: ptBR });
};

interface Props {
  room: ChatRoomT;
  messages: ChatMessage[];
  currentUserId: string;
  typingUsers?: string[];
  onSend: (text: string, file?: File) => Promise<void> | void;
  onReact: (msg: ChatMessage, emoji: string) => void;
  onDelete: (msg: ChatMessage) => void;
  onTyping?: () => void;
  onTogglePin?: () => void;
  onToggleMute?: () => void;
  onToggleArchive?: () => void;
  onBack?: () => void;
  onJumpToMessage?: (id: string) => void;
}

export function ChatRoom({
  room, messages, currentUserId, typingUsers = [],
  onSend, onReact, onDelete, onTyping,
  onTogglePin, onToggleMute, onToggleArchive,
  onBack, onJumpToMessage,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  // Group messages by sender + day for avatar/name display
  const grouped = useMemo(() => {
    return messages.map((m, i) => {
      const prev = messages[i - 1];
      const next = messages[i + 1];
      const sameDayAsPrev = prev && isSameDay(new Date(prev.created_at), new Date(m.created_at));
      const sameSenderAsNext = next && next.sender_id === m.sender_id && isSameDay(new Date(next.created_at), new Date(m.created_at));
      const sameSenderAsPrev = prev && prev.sender_id === m.sender_id && isSameDay(new Date(prev.created_at), new Date(m.created_at));
      return {
        msg: m,
        showDayLabel: !sameDayAsPrev,
        showAvatar: !sameSenderAsNext,
        showSenderName: !sameSenderAsPrev && room.kind === "support",
      };
    });
  }, [messages, room.kind]);

  // Compute "read by others" — for direct rooms, check the other member's last_read_at
  const otherMember = room.members.find(m => m.user_id !== currentUserId);
  const otherReadAt = otherMember?.last_read_at ? new Date(otherMember.last_read_at).getTime() : 0;

  const handleReact = (msg: ChatMessage, emoji: string) => {
    onReact(msg, emoji);
  };

  const typingNames = typingUsers
    .map(uid => room.members.find(m => m.user_id === uid)?.name)
    .filter(Boolean) as string[];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2.5 border-b bg-background">
        {onBack && (
          <button onClick={onBack} className="lg:hidden p-1 rounded hover:bg-muted text-muted-foreground" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <Avatar className="h-9 w-9">
          {room.display_avatar && <AvatarImage src={room.display_avatar} />}
          <AvatarFallback className="text-xs bg-[var(--theme-accent)]/30 text-[var(--theme-brand-on-bg)] font-medium">
            {initials(room.display_name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{room.display_name}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {typingNames.length > 0
              ? `${typingNames[0]} está digitando…`
              : room.kind === "support"
                ? "Steps · Suporte"
                : room.display_role === "teacher" ? "Professor(a)" : room.display_role === "student" ? "Aluno(a)" : ""}
          </p>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <button className="p-2 rounded-full hover:bg-muted text-muted-foreground" aria-label="Opções">
              <MoreVertical className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-1" align="end">
            <button onClick={onToggleMute} className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted">
              {room.is_muted ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
              {room.is_muted ? "Ativar notificações" : "Silenciar"}
            </button>
            <button onClick={onTogglePin} className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted">
              {room.is_pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              {room.is_pinned ? "Desafixar" : "Fixar"}
            </button>
            <button onClick={onToggleArchive} className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted">
              <Archive className="h-3.5 w-3.5" />
              {room.is_archived ? "Desarquivar" : "Arquivar"}
            </button>
          </PopoverContent>
        </Popover>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground py-12">
            <p className="text-sm">Nenhuma mensagem ainda.</p>
            <p className="text-xs mt-1 opacity-70">Envie a primeira mensagem para começar.</p>
          </div>
        ) : (
          grouped.map(({ msg, showDayLabel, showAvatar, showSenderName }) => (
            <div key={msg.id} id={`msg-${msg.id}`}>
              {showDayLabel && (
                <div className="flex items-center justify-center my-3">
                  <span className="text-[10px] uppercase tracking-wider font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                    {dayLabel(new Date(msg.created_at))}
                  </span>
                </div>
              )}
              <MessageBubble
                message={msg}
                isMine={msg.sender_id === currentUserId}
                showAvatar={showAvatar}
                showSenderName={showSenderName || (msg.sender_role === "admin" && msg.sender_id !== currentUserId)}
                isReadByOthers={new Date(msg.created_at).getTime() <= otherReadAt}
                members={room.members}
                currentUserId={currentUserId}
                onReply={setReplyTo}
                onReact={handleReact}
                onDelete={onDelete}
                onJumpToMessage={onJumpToMessage}
              />
            </div>
          ))
        )}

        {typingNames.length > 0 && (
          <div className="flex items-center gap-2 mt-2 ml-10">
            <div className="flex gap-1 px-3 py-2 rounded-2xl bg-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <MessageInput
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={async (text, file) => {
          await onSend(text, file);
          setReplyTo(null);
        }}
        onTyping={onTyping}
      />
    </div>
  );
}
