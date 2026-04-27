import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useChatRooms } from "@/hooks/useChatRooms";
import { useChatRoom } from "@/hooks/useChatRoom";
import { ChatList } from "./ChatList";
import { ChatRoom } from "./ChatRoom";
import { BroadcastDialog, type BroadcastRecipient } from "./BroadcastDialog";
import type { ChatMessage, ChatRoom as ChatRoomT } from "./types";

interface Props {
  /** When provided, only show rooms passing this filter */
  roomsFilter?: (room: ChatRoomT) => boolean;
  /** Whether to show the broadcast button (admin / teacher) */
  broadcastRecipients?: BroadcastRecipient[];
  /** Empty state hint */
  emptyHint?: string;
  /** When provided, auto-selects this room on mount (deep-link target) */
  initialRoomId?: string | null;
}

export function ChatLayout({ roomsFilter, broadcastRecipients, emptyHint, initialRoomId }: Props) {
  const { profile } = useAuth();
  const { rooms, loading, reload } = useChatRooms();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);

  const visibleRooms = roomsFilter ? rooms.filter(roomsFilter) : rooms;
  const activeRoom = visibleRooms.find(r => r.id === activeId) ?? null;
  const { messages, typingUsers, sendMessage, deleteMessage, toggleReaction, sendTyping } = useChatRoom(activeId);

  // Auto-select: prefer the deep-linked room when available, else the first one
  useEffect(() => {
    if (initialRoomId && visibleRooms.find(r => r.id === initialRoomId)) {
      setActiveId(initialRoomId);
    } else if (!activeId && visibleRooms.length > 0) {
      setActiveId(visibleRooms[0].id);
    }
  }, [visibleRooms, activeId, initialRoomId]);

  const togglePin = async () => {
    if (!activeRoom || !profile?.id) return;
    await (supabase as any).from("chat_members")
      .update({ is_pinned: !activeRoom.is_pinned })
      .eq("room_id", activeRoom.id).eq("user_id", profile.id);
    reload();
  };

  const toggleMute = async () => {
    if (!activeRoom || !profile?.id) return;
    await (supabase as any).from("chat_members")
      .update({ is_muted: !activeRoom.is_muted })
      .eq("room_id", activeRoom.id).eq("user_id", profile.id);
    reload();
  };

  const toggleArchive = async () => {
    if (!activeRoom || !profile?.id) return;
    await (supabase as any).from("chat_members")
      .update({ is_archived: !activeRoom.is_archived })
      .eq("room_id", activeRoom.id).eq("user_id", profile.id);
    reload();
  };

  const handleBroadcast = async (userIds: string[], message: string) => {
    // Get-or-create rooms for each recipient, then bulk-insert
    const roomIds: string[] = [];
    for (const uid of userIds) {
      const { data } = await (supabase as any).rpc("get_or_create_direct_room", { p_other_user_id: uid });
      if (data) roomIds.push(data);
    }
    if (roomIds.length > 0) {
      await (supabase as any).rpc("broadcast_message", { p_room_ids: roomIds, p_content: message });
      reload();
    }
  };

  const handleDelete = (msg: ChatMessage) => deleteMessage(msg.id);
  const handleReact = (msg: ChatMessage, emoji: string) => toggleReaction(msg.id, emoji);

  return (
    <div className="flex h-full bg-background border rounded-lg overflow-hidden">
      <div className="w-72 lg:w-80 shrink-0">
        <ChatList
          rooms={visibleRooms}
          activeRoomId={activeId}
          onSelectRoom={setActiveId}
          onBroadcast={broadcastRecipients ? () => setBroadcastOpen(true) : undefined}
          showArchived
          emptyHint={emptyHint}
        />
      </div>
      <div className="flex-1 min-w-0">
        {activeRoom && profile?.id ? (
          <ChatRoom
            room={activeRoom}
            messages={messages}
            currentUserId={profile.id}
            typingUsers={typingUsers}
            onSend={(text, file) => sendMessage(text, file)}
            onReact={handleReact}
            onDelete={handleDelete}
            onTyping={sendTyping}
            onTogglePin={togglePin}
            onToggleMute={toggleMute}
            onToggleArchive={toggleArchive}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            {loading ? "Carregando…" : "Selecione uma conversa"}
          </div>
        )}
      </div>

      {broadcastRecipients && (
        <BroadcastDialog
          open={broadcastOpen}
          onOpenChange={setBroadcastOpen}
          recipients={broadcastRecipients}
          onSend={handleBroadcast}
        />
      )}
    </div>
  );
}
