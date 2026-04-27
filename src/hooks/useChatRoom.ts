import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { ChatMessage } from "@/components/chat/types";

const TYPING_TIMEOUT_MS = 4000;

export function useChatRoom(roomId: string | null) {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const channelRef = useRef<any>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load messages
  const load = useCallback(async () => {
    if (!roomId) { setMessages([]); return; }
    setLoading(true);

    const { data: msgs } = await (supabase as any)
      .from("chat_messages")
      .select(`
        id, room_id, sender_id, content, file_url, file_name, file_type, file_size,
        reply_to_id, deleted_at, edited_at, created_at,
        profiles!chat_messages_sender_id_fkey(name, avatar_url, role)
      `)
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    if (!msgs) { setMessages([]); setLoading(false); return; }

    // Get reply previews
    const replyIds = msgs.filter((m: any) => m.reply_to_id).map((m: any) => m.reply_to_id);
    const replyMap = new Map<string, any>();
    if (replyIds.length > 0) {
      const { data: replies } = await (supabase as any)
        .from("chat_messages")
        .select("id, sender_id, content, file_name, profiles!chat_messages_sender_id_fkey(name)")
        .in("id", replyIds);
      (replies ?? []).forEach((r: any) => replyMap.set(r.id, r));
    }

    // Get reactions for all messages
    const { data: reacts } = await (supabase as any)
      .from("message_reactions")
      .select("message_id, user_id, emoji")
      .in("message_id", msgs.map((m: any) => m.id));

    const reactByMsg = new Map<string, Map<string, Set<string>>>();
    (reacts ?? []).forEach((r: any) => {
      const inner = reactByMsg.get(r.message_id) ?? new Map();
      const set = inner.get(r.emoji) ?? new Set();
      set.add(r.user_id);
      inner.set(r.emoji, set);
      reactByMsg.set(r.message_id, inner);
    });

    const enriched: ChatMessage[] = msgs.map((m: any) => {
      const reply = m.reply_to_id ? replyMap.get(m.reply_to_id) : null;
      const reactionMap = reactByMsg.get(m.id);
      const reactions = reactionMap
        ? Array.from(reactionMap.entries()).map(([emoji, users]) => ({ emoji, user_ids: Array.from(users) }))
        : [];
      return {
        id: m.id,
        room_id: m.room_id,
        sender_id: m.sender_id,
        sender_name: m.profiles?.name ?? "—",
        sender_avatar: m.profiles?.avatar_url ?? null,
        sender_role: m.profiles?.role,
        content: m.content,
        file_url: m.file_url,
        file_name: m.file_name,
        file_type: m.file_type,
        file_size: m.file_size,
        reply_to_id: m.reply_to_id,
        reply_to: reply ? {
          id: reply.id,
          sender_name: reply.profiles?.name ?? "—",
          content: reply.content,
          file_name: reply.file_name,
        } : null,
        deleted_at: m.deleted_at,
        edited_at: m.edited_at,
        created_at: m.created_at,
        reactions,
      };
    });

    setMessages(enriched);
    setLoading(false);

    // Mark room as read
    if (profile?.id) {
      await (supabase as any).rpc("mark_room_read", { p_room_id: roomId });
    }
  }, [roomId, profile?.id]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`room:${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, (payload: any) => {
        const msgId = (payload.new ?? payload.old)?.message_id;
        if (msgId && messages.some(m => m.id === msgId)) load();
      })
      .on("broadcast", { event: "typing" }, (payload: any) => {
        const userId = payload.payload?.user_id;
        if (!userId || userId === profile?.id) return;
        setTypingUsers(prev => prev.includes(userId) ? prev : [...prev, userId]);
        // Auto-clear after timeout
        setTimeout(() => {
          setTypingUsers(prev => prev.filter(u => u !== userId));
        }, TYPING_TIMEOUT_MS);
      })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); channelRef.current = null; };
  }, [roomId, profile?.id, load]);

  const sendMessage = useCallback(async (text: string, file?: File, replyToId?: string | null) => {
    if (!roomId || !profile?.id) return;
    let file_url: string | null = null;
    let file_name: string | null = null;
    let file_type: string | null = null;
    let file_size: number | null = null;

    if (file) {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${roomId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("chat-attachments").upload(path, file);
      if (upErr) { console.error("upload failed", upErr); return; }
      const { data: urlData } = supabase.storage.from("chat-attachments").getPublicUrl(path);
      file_url = urlData.publicUrl;
      file_name = file.name;
      file_type = file.type;
      file_size = file.size;
    }

    const { data: inserted } = await (supabase as any).from("chat_messages").insert({
      room_id: roomId,
      sender_id: profile.id,
      content: text || null,
      file_url, file_name, file_type, file_size,
      reply_to_id: replyToId ?? null,
    }).select("id").single();

    // Fire-and-forget push notification
    if (inserted?.id) {
      supabase.functions.invoke("notify-chat-message", {
        body: { message_id: inserted.id },
      }).catch((e) => console.warn("chat push failed:", e));
    }
  }, [roomId, profile?.id]);

  const deleteMessage = useCallback(async (msgId: string) => {
    await (supabase as any).from("chat_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", msgId);
  }, []);

  const toggleReaction = useCallback(async (msgId: string, emoji: string) => {
    if (!profile?.id) return;
    const msg = messages.find(m => m.id === msgId);
    const existing = msg?.reactions?.find(r => r.emoji === emoji);
    const mineAlready = existing?.user_ids.includes(profile.id);
    if (mineAlready) {
      await (supabase as any).from("message_reactions")
        .delete()
        .eq("message_id", msgId)
        .eq("user_id", profile.id)
        .eq("emoji", emoji);
    } else {
      await (supabase as any).from("message_reactions")
        .insert({ message_id: msgId, user_id: profile.id, emoji });
    }
    load();
  }, [profile?.id, messages, load]);

  const sendTyping = useCallback(() => {
    if (!channelRef.current || !profile?.id) return;
    if (typingTimeoutRef.current) return; // throttle
    channelRef.current.send({ type: "broadcast", event: "typing", payload: { user_id: profile.id } });
    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
    }, 2000);
  }, [profile?.id]);

  return { messages, loading, typingUsers, sendMessage, deleteMessage, toggleReaction, sendTyping, reload: load };
}
