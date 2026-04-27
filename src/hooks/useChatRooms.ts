import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { ChatRoom, ChatMember, ChatMessage } from "@/components/chat/types";

/**
 * Loads all chat rooms visible to the current user, with last message + unread count + members.
 * Subscribes to realtime inserts on chat_messages so the list reorders/updates as new
 * messages arrive across rooms.
 */
export function useChatRooms() {
  const { profile } = useAuth();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);

    // 1. Fetch all rooms (RLS filters down) — pull group name when kind=group
    const { data: roomRows } = await (supabase as any)
      .from("chat_rooms")
      .select("id, kind, created_at, last_message_at, group_id, groups(name)")
      .order("last_message_at", { ascending: false });

    if (!roomRows || roomRows.length === 0) {
      setRooms([]);
      setLoading(false);
      return;
    }

    const roomIds = roomRows.map((r: any) => r.id);

    // 2. Fetch members for all rooms with profile info
    const { data: memberRows } = await (supabase as any)
      .from("chat_members")
      .select("room_id, user_id, is_muted, is_pinned, is_archived, last_read_at, profiles!chat_members_user_id_fkey(name, avatar_url, role)")
      .in("room_id", roomIds);

    // 3. Fetch the latest message per room (single batched query, then group)
    const { data: msgRows } = await (supabase as any)
      .from("chat_messages")
      .select("id, room_id, sender_id, content, file_name, deleted_at, created_at")
      .in("room_id", roomIds)
      .order("created_at", { ascending: false });

    // Build maps
    const membersByRoom = new Map<string, any[]>();
    (memberRows ?? []).forEach((m: any) => {
      const list = membersByRoom.get(m.room_id) ?? [];
      list.push(m);
      membersByRoom.set(m.room_id, list);
    });

    const lastMsgByRoom = new Map<string, any>();
    const allMsgsByRoom = new Map<string, any[]>();
    (msgRows ?? []).forEach((m: any) => {
      if (!lastMsgByRoom.has(m.room_id)) lastMsgByRoom.set(m.room_id, m);
      const list = allMsgsByRoom.get(m.room_id) ?? [];
      list.push(m);
      allMsgsByRoom.set(m.room_id, list);
    });

    // 4. Compose ChatRoom[] enriched
    const built: ChatRoom[] = roomRows.map((r: any) => {
      const memberList: ChatMember[] = (membersByRoom.get(r.id) ?? []).map((m: any) => ({
        user_id: m.user_id,
        name: m.profiles?.name ?? "—",
        avatar_url: m.profiles?.avatar_url ?? null,
        role: (m.profiles?.role ?? "student") as any,
        last_read_at: m.last_read_at,
      }));

      const myMember = (membersByRoom.get(r.id) ?? []).find((m: any) => m.user_id === profile.id);
      const myReadAt = myMember ? new Date(myMember.last_read_at).getTime() : 0;

      const unread = (allMsgsByRoom.get(r.id) ?? []).filter(
        (m: any) => m.sender_id !== profile.id && new Date(m.created_at).getTime() > myReadAt
      ).length;

      // Display name: for support → "Suporte Steps"; for direct → other member's name
      let displayName = "Conversa";
      let displayAvatar: string | null = null;
      let displayRole: ChatRoom["display_role"] = "student";

      if (r.kind === "support") {
        // The room "owner" is the only member; admin sees their name, owner sees "Suporte"
        if (myMember) {
          displayName = "Steps Suporte";
          displayRole = "support";
        } else {
          // Admin view of support room — show the requester
          const owner = memberList[0];
          displayName = owner?.name ?? "Suporte";
          displayAvatar = owner?.avatar_url ?? null;
          displayRole = owner?.role as any;
        }
      } else if (r.kind === "group") {
        // Group: name from joined groups table; avatar derived from initials
        displayName = r.groups?.name ?? "Turma";
        displayAvatar = null;
        displayRole = undefined as any;
      } else if (r.kind === "duo") {
        // Duo: show "Aluno A & Aluno B" — exclude the caller (teacher)
        const others = memberList.filter(m => m.user_id !== profile.id);
        const names = others.map(m => m.name.split(" ")[0]);
        displayName = names.length > 0 ? names.join(" & ") : "Dupla";
        displayAvatar = null;
        displayRole = undefined as any;
      } else {
        // student_teacher direct room
        if (myMember) {
          // Member view (student or teacher): show the OTHER member
          const other = memberList.find(m => m.user_id !== profile.id);
          if (other) {
            displayName = other.name;
            displayAvatar = other.avatar_url;
            displayRole = other.role as any;
          }
        } else {
          // Admin observer view: show "Aluno · Professor"
          const student = memberList.find(m => m.role === "student");
          const teacher = memberList.find(m => m.role === "teacher");
          if (student && teacher) {
            displayName = `${student.name.split(" ")[0]} · ${teacher.name.split(" ")[0]}`;
          } else {
            displayName = memberList.map(m => m.name.split(" ")[0]).join(" · ") || "Conversa";
          }
          displayAvatar = null;
          displayRole = undefined as any;
        }
      }

      return {
        id: r.id,
        kind: r.kind,
        created_at: r.created_at,
        last_message_at: r.last_message_at,
        members: memberList,
        last_message: lastMsgByRoom.get(r.id) ?? null,
        unread_count: unread,
        is_muted: myMember?.is_muted ?? false,
        is_pinned: myMember?.is_pinned ?? false,
        is_archived: myMember?.is_archived ?? false,
        display_name: displayName,
        display_avatar: displayAvatar,
        display_role: displayRole,
      };
    });

    setRooms(built);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  // Realtime: any new message → reload (cheap because it's already cached).
  // Channel name MUST be unique per hook instance — Supabase returns the same
  // channel object for repeated calls with the same name, and adding callbacks
  // after another instance already called .subscribe() throws.
  const instanceIdRef = useRef<string>(Math.random().toString(36).slice(2));
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`chat_rooms:${profile.id}:${instanceIdRef.current}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, () => {
        load();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_members" }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, load]);

  const totalUnread = rooms
    .filter(r => !r.is_muted && !r.is_archived)
    .reduce((s, r) => s + r.unread_count, 0);

  return { rooms, loading, reload: load, totalUnread };
}
