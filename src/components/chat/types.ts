export type RoomKind = "student_teacher" | "support";

export type ChatRoom = {
  id: string;
  kind: RoomKind;
  created_at: string;
  last_message_at: string;
  // Joined / derived
  members: ChatMember[];
  last_message?: ChatMessage | null;
  unread_count: number;
  is_muted: boolean;
  is_pinned: boolean;
  is_archived: boolean;
  display_name: string;
  display_avatar?: string | null;
  display_role?: "student" | "teacher" | "admin" | "support";
};

export type ChatMember = {
  user_id: string;
  name: string;
  avatar_url: string | null;
  role: "student" | "teacher" | "admin";
  last_read_at: string;
};

export type ChatMessage = {
  id: string;
  room_id: string;
  sender_id: string;
  sender_name?: string;
  sender_avatar?: string | null;
  sender_role?: "student" | "teacher" | "admin";
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  reply_to_id: string | null;
  reply_to?: { id: string; sender_name: string; content: string | null; file_name: string | null } | null;
  deleted_at: string | null;
  edited_at: string | null;
  created_at: string;
  reactions?: { emoji: string; user_ids: string[] }[];
};

export type ReactionEmoji = "👍" | "❤️" | "😂" | "😮" | "😢" | "🙏";

export const REACTION_EMOJIS: ReactionEmoji[] = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export const DELETE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
