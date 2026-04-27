import { useState, useRef, useEffect } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, CheckCheck, Reply, Smile, Trash2, Download, FileText, Image as ImageIcon, Music } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ChatMessage, ChatMember } from "./types";
import { REACTION_EMOJIS, DELETE_WINDOW_MS } from "./types";

interface Props {
  message: ChatMessage;
  isMine: boolean;
  showAvatar: boolean;
  showSenderName: boolean;
  isReadByOthers: boolean;
  members: ChatMember[];
  currentUserId: string;
  onReply: (msg: ChatMessage) => void;
  onReact: (msg: ChatMessage, emoji: string) => void;
  onDelete: (msg: ChatMessage) => void;
  onJumpToMessage?: (id: string) => void;
}

const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("");

const fmtTime = (iso: string) => format(new Date(iso), "HH:mm");

const fmtSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B`
  : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const isImage = (type: string | null) => type === "image" || /^image\//.test(type ?? "");
const isAudio = (type: string | null) => type === "audio" || /^audio\//.test(type ?? "");

export function MessageBubble({
  message, isMine, showAvatar, showSenderName, isReadByOthers,
  members, currentUserId, onReply, onReact, onDelete, onJumpToMessage,
}: Props) {
  const [showActions, setShowActions] = useState(false);
  const canDelete = isMine && message.deleted_at == null
    && (Date.now() - new Date(message.created_at).getTime()) < DELETE_WINDOW_MS;

  const align = isMine ? "items-end" : "items-start";
  const bubbleColor = isMine
    ? "bg-[var(--theme-brand-on-bg)] text-[var(--theme-text-on-brand)]"
    : message.sender_role === "admin"
      ? "bg-amber-50 text-amber-900 border border-amber-200"
      : "bg-muted text-foreground";

  if (message.deleted_at) {
    return (
      <div className={cn("flex flex-col w-full", align)}>
        <div className="px-3 py-1.5 rounded-2xl bg-muted/50 text-xs italic text-muted-foreground">
          Mensagem apagada
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("group flex gap-2 w-full", isMine ? "flex-row-reverse" : "flex-row")}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {!isMine && (
        <div className="w-8 shrink-0">
          {showAvatar && (
            <Avatar className="h-8 w-8">
              {message.sender_avatar && <AvatarImage src={message.sender_avatar} />}
              <AvatarFallback className="text-[10px] bg-muted-foreground/10">
                {initials(message.sender_name ?? "?")}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      )}

      <div className={cn("flex flex-col max-w-[75%]", align)}>
        {showSenderName && !isMine && (
          <span className={cn(
            "text-[11px] font-medium mb-0.5 px-1",
            message.sender_role === "admin" ? "text-amber-700" : "text-muted-foreground"
          )}>
            {message.sender_name}{message.sender_role === "admin" ? " · Suporte" : ""}
          </span>
        )}

        {/* Reply preview */}
        {message.reply_to && (
          <button
            onClick={() => onJumpToMessage?.(message.reply_to!.id)}
            className={cn(
              "text-left text-xs px-2.5 py-1.5 mb-1 rounded-lg border-l-2 truncate max-w-full",
              isMine
                ? "bg-black/10 border-white/40 text-white/80"
                : "bg-background border-[var(--theme-brand-on-bg)]/40 text-muted-foreground"
            )}
          >
            <div className="font-medium text-[10px] uppercase tracking-wide opacity-70">
              {message.reply_to.sender_name}
            </div>
            <div className="truncate">
              {message.reply_to.content ?? message.reply_to.file_name ?? "Anexo"}
            </div>
          </button>
        )}

        {/* Bubble + actions */}
        <div className={cn("relative flex items-center gap-1", isMine ? "flex-row-reverse" : "flex-row")}>
          <div className={cn(
            "px-3 py-2 rounded-2xl shadow-sm break-words whitespace-pre-wrap text-sm",
            bubbleColor,
            isMine ? "rounded-br-sm" : "rounded-bl-sm"
          )}>
            {/* Attachment */}
            {message.file_url && isImage(message.file_type) && (
              <a href={message.file_url} target="_blank" rel="noopener noreferrer" className="block mb-1">
                <img src={message.file_url} alt={message.file_name ?? ""} className="rounded-lg max-w-full max-h-72 object-cover" />
              </a>
            )}
            {message.file_url && isAudio(message.file_type) && (
              <audio controls src={message.file_url} className="max-w-[260px] mb-1" />
            )}
            {message.file_url && !isImage(message.file_type) && !isAudio(message.file_type) && (
              <a
                href={message.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center gap-2 px-2.5 py-2 rounded-lg mb-1",
                  isMine ? "bg-black/15 hover:bg-black/25" : "bg-background/70 hover:bg-background"
                )}
              >
                <FileText className="h-5 w-5 shrink-0 opacity-80" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{message.file_name}</p>
                  <p className="text-[10px] opacity-70">{message.file_size ? fmtSize(message.file_size) : ""}</p>
                </div>
                <Download className="h-3.5 w-3.5 shrink-0 opacity-60" />
              </a>
            )}

            {message.content && <span>{message.content}</span>}

            <span className={cn(
              "text-[10px] ml-2 inline-flex items-center gap-0.5 align-bottom opacity-70",
              isMine ? "" : "text-muted-foreground"
            )}>
              {fmtTime(message.created_at)}
              {isMine && (
                isReadByOthers
                  ? <CheckCheck className="h-3 w-3 inline" />
                  : <Check className="h-3 w-3 inline" />
              )}
              {message.edited_at && <span className="italic ml-0.5">editado</span>}
            </span>
          </div>

          {/* Hover actions */}
          <div className={cn(
            "flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity",
            showActions && "opacity-100"
          )}>
            <Popover>
              <PopoverTrigger asChild>
                <button className="p-1 rounded-full hover:bg-muted text-muted-foreground" aria-label="Reagir">
                  <Smile className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-1.5 flex gap-0.5" align={isMine ? "end" : "start"} side="top">
                {REACTION_EMOJIS.map(e => (
                  <button
                    key={e}
                    onClick={() => onReact(message, e)}
                    className="text-lg hover:scale-125 transition-transform p-1"
                  >
                    {e}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <button
              onClick={() => onReply(message)}
              className="p-1 rounded-full hover:bg-muted text-muted-foreground"
              aria-label="Responder"
            >
              <Reply className="h-3.5 w-3.5" />
            </button>
            {canDelete && (
              <button
                onClick={() => onDelete(message)}
                className="p-1 rounded-full hover:bg-destructive/10 text-destructive"
                aria-label="Apagar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Reactions row */}
        {message.reactions && message.reactions.length > 0 && (
          <div className={cn("flex gap-1 mt-1 flex-wrap", isMine ? "justify-end" : "justify-start")}>
            {message.reactions.map(r => {
              const mine = r.user_ids.includes(currentUserId);
              return (
                <button
                  key={r.emoji}
                  onClick={() => onReact(message, r.emoji)}
                  className={cn(
                    "text-xs flex items-center gap-1 px-1.5 py-0.5 rounded-full border transition-colors",
                    mine
                      ? "bg-[var(--theme-accent)]/30 border-[var(--theme-brand-on-bg)]/40"
                      : "bg-background border-border hover:bg-muted"
                  )}
                >
                  <span className="text-sm">{r.emoji}</span>
                  <span className="text-[10px] font-medium">{r.user_ids.length}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
