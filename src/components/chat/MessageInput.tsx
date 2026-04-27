import { useState, useRef, KeyboardEvent } from "react";
import { Send, Paperclip, X, FileText, Mic, Smile } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ChatMessage } from "./types";

const QUICK_EMOJIS = ["😀", "😂", "🥰", "😮", "😢", "😡", "👍", "👏", "🙏", "❤️", "🔥", "🎉"];

interface Props {
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  onSend: (text: string, file?: File) => Promise<void> | void;
  onTyping?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function MessageInput({ replyTo, onCancelReply, onSend, onTyping, disabled, placeholder }: Props) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSend = async () => {
    if ((!text.trim() && !file) || sending) return;
    setSending(true);
    try {
      await onSend(text.trim(), file ?? undefined);
      setText("");
      setFile(null);
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const insertEmoji = (emoji: string) => {
    setText(t => t + emoji);
  };

  return (
    <div className="border-t bg-background">
      {/* Reply banner */}
      {replyTo && (
        <div className="flex items-start gap-2 px-3 pt-2 pb-1 border-b bg-muted/40">
          <div className="flex-1 min-w-0 border-l-2 border-[var(--theme-brand-on-bg)] pl-2">
            <p className="text-[10px] uppercase tracking-wide font-medium text-[var(--theme-brand-on-bg)]">
              Respondendo a {replyTo.sender_name}
            </p>
            <p className="text-xs truncate text-muted-foreground">
              {replyTo.content ?? replyTo.file_name ?? "Anexo"}
            </p>
          </div>
          <button onClick={onCancelReply} className="p-1 rounded hover:bg-muted text-muted-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* File preview */}
      {file && (
        <div className="flex items-center gap-2 mx-3 mt-2 p-2 rounded-md border bg-muted/40">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">{file.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {file.size < 1024 * 1024
                ? `${(file.size / 1024).toFixed(0)} KB`
                : `${(file.size / 1024 / 1024).toFixed(1)} MB`}
            </p>
          </div>
          <button onClick={() => setFile(null)} className="p-1 rounded hover:bg-muted text-muted-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-1.5 px-2 py-2">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept="image/*,application/pdf,audio/*,.doc,.docx"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) setFile(f);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="p-2 rounded-full hover:bg-muted text-muted-foreground shrink-0"
          aria-label="Anexar arquivo"
          disabled={disabled}
        >
          <Paperclip className="h-4 w-4" />
        </button>

        <Popover>
          <PopoverTrigger asChild>
            <button
              className="p-2 rounded-full hover:bg-muted text-muted-foreground shrink-0"
              aria-label="Emoji"
              disabled={disabled}
            >
              <Smile className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2 grid grid-cols-6 gap-1" side="top" align="start">
            {QUICK_EMOJIS.map(e => (
              <button
                key={e}
                onClick={() => insertEmoji(e)}
                className="text-xl hover:scale-125 transition-transform p-1"
              >
                {e}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <textarea
          value={text}
          onChange={e => { setText(e.target.value); onTyping?.(); }}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? "Mensagem"}
          rows={1}
          disabled={disabled}
          className={cn(
            "flex-1 resize-none rounded-2xl border border-input bg-background",
            "px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--theme-brand-on-bg)]/40",
            "max-h-32 min-h-[36px]"
          )}
          style={{ height: "auto" }}
        />

        <button
          onClick={handleSend}
          disabled={disabled || sending || (!text.trim() && !file)}
          className={cn(
            "p-2 rounded-full shrink-0 transition-colors",
            (text.trim() || file)
              ? "bg-[var(--theme-button-bg)] text-[var(--theme-button-text)] hover:opacity-90"
              : "bg-muted text-muted-foreground"
          )}
          aria-label="Enviar"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
