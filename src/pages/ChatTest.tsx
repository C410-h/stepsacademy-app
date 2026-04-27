import { useState } from "react";
import { ChatList } from "@/components/chat/ChatList";
import { ChatRoom } from "@/components/chat/ChatRoom";
import { BroadcastDialog } from "@/components/chat/BroadcastDialog";
import { useTheme } from "@/contexts/ThemeContext";
import type { ChatRoom as ChatRoomT, ChatMessage } from "@/components/chat/types";

const ME = "user-me-001";
const TEACHER = "user-teacher-001";
const ADMIN = "user-admin-001";
const STUDENT_A = "user-student-a";
const STUDENT_B = "user-student-b";

const mkMsg = (overrides: Partial<ChatMessage>): ChatMessage => ({
  id: `m-${Math.random().toString(36).slice(2, 8)}`,
  room_id: "r1",
  sender_id: ME,
  sender_name: "Eu",
  sender_role: "student",
  content: null,
  file_url: null,
  file_name: null,
  file_type: null,
  file_size: null,
  reply_to_id: null,
  reply_to: null,
  deleted_at: null,
  edited_at: null,
  created_at: new Date().toISOString(),
  reactions: [],
  ...overrides,
});

const seedRooms: ChatRoomT[] = [
  {
    id: "r1",
    kind: "student_teacher",
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    last_message_at: new Date(Date.now() - 60000).toISOString(),
    members: [
      { user_id: ME, name: "Eu", avatar_url: null, role: "student", last_read_at: new Date(Date.now() - 30000).toISOString() },
      { user_id: TEACHER, name: "Professora Maria", avatar_url: null, role: "teacher", last_read_at: new Date().toISOString() },
    ],
    last_message: { id: "x", room_id: "r1", sender_id: TEACHER, content: "Vejo você amanhã!", file_url: null, file_name: null, file_type: null, file_size: null, reply_to_id: null, deleted_at: null, edited_at: null, created_at: new Date(Date.now() - 60000).toISOString() } as any,
    unread_count: 2,
    is_muted: false,
    is_pinned: true,
    is_archived: false,
    display_name: "Professora Maria",
    display_avatar: null,
    display_role: "teacher",
  },
  {
    id: "r2",
    kind: "support",
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    last_message_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    members: [{ user_id: ME, name: "Eu", avatar_url: null, role: "student", last_read_at: new Date(Date.now() - 3600000 * 2).toISOString() }],
    last_message: { id: "x", room_id: "r2", sender_id: ADMIN, content: "Resolvido! Obrigado pelo retorno.", file_url: null, file_name: null, file_type: null, file_size: null, reply_to_id: null, deleted_at: null, edited_at: null, created_at: new Date(Date.now() - 3600000 * 2).toISOString() } as any,
    unread_count: 0,
    is_muted: false,
    is_pinned: false,
    is_archived: false,
    display_name: "Steps Suporte",
    display_avatar: null,
    display_role: "support",
  },
  {
    id: "r3",
    kind: "student_teacher",
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    last_message_at: new Date(Date.now() - 86400000).toISOString(),
    members: [
      { user_id: ME, name: "Eu", avatar_url: null, role: "teacher", last_read_at: new Date().toISOString() },
      { user_id: STUDENT_A, name: "João Silva", avatar_url: null, role: "student", last_read_at: new Date(Date.now() - 86400000 * 2).toISOString() },
    ],
    last_message: { id: "x", room_id: "r3", sender_id: STUDENT_A, content: "📎 lição.pdf", file_url: null, file_name: "lição.pdf", file_type: "application/pdf", file_size: 124000, reply_to_id: null, deleted_at: null, edited_at: null, created_at: new Date(Date.now() - 86400000).toISOString() } as any,
    unread_count: 5,
    is_muted: true,
    is_pinned: false,
    is_archived: false,
    display_name: "João Silva",
    display_avatar: null,
    display_role: "student",
  },
  {
    id: "r4",
    kind: "student_teacher",
    created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
    last_message_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    members: [
      { user_id: ME, name: "Eu", avatar_url: null, role: "teacher", last_read_at: new Date().toISOString() },
      { user_id: STUDENT_B, name: "Maria Santos", avatar_url: null, role: "student", last_read_at: new Date().toISOString() },
    ],
    last_message: { id: "x", room_id: "r4", sender_id: STUDENT_B, content: "Obrigada pela aula!", file_url: null, file_name: null, file_type: null, file_size: null, reply_to_id: null, deleted_at: null, edited_at: null, created_at: new Date(Date.now() - 86400000 * 7).toISOString() } as any,
    unread_count: 0,
    is_muted: false,
    is_pinned: false,
    is_archived: true,
    display_name: "Maria Santos",
    display_avatar: null,
    display_role: "student",
  },
];

const seedMessages: ChatMessage[] = [
  mkMsg({ id: "m1", sender_id: TEACHER, sender_name: "Professora Maria", sender_role: "teacher", content: "Olá! Tudo bem?", created_at: new Date(Date.now() - 86400000 * 2).toISOString() }),
  mkMsg({ id: "m2", sender_id: ME, sender_name: "Eu", content: "Tudo ótimo, professora! Posso enviar a lição?", created_at: new Date(Date.now() - 86400000 * 2 + 60000).toISOString() }),
  mkMsg({ id: "m3", sender_id: TEACHER, sender_name: "Professora Maria", sender_role: "teacher", content: "Claro!", created_at: new Date(Date.now() - 86400000 * 2 + 120000).toISOString() }),
  mkMsg({
    id: "m4", sender_id: ME, sender_name: "Eu",
    file_url: "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=400",
    file_name: "caderno.jpg",
    file_type: "image",
    file_size: 245000,
    created_at: new Date(Date.now() - 86400000 + 3600000).toISOString(),
    reactions: [{ emoji: "❤️", user_ids: [TEACHER] }],
  }),
  mkMsg({
    id: "m5", sender_id: TEACHER, sender_name: "Professora Maria", sender_role: "teacher",
    content: "Excelente! Vou corrigir e te devolvo até amanhã.",
    reply_to_id: "m4",
    reply_to: { id: "m4", sender_name: "Eu", content: null, file_name: "caderno.jpg" },
    created_at: new Date(Date.now() - 86400000 + 7200000).toISOString(),
  }),
  mkMsg({
    id: "m6", sender_id: ADMIN, sender_name: "Suporte Steps", sender_role: "admin",
    content: "Pessoal, lembrando que amanhã é feriado, então não teremos aula. Bom descanso!",
    created_at: new Date(Date.now() - 7200000).toISOString(),
  }),
  mkMsg({
    id: "m7", sender_id: TEACHER, sender_name: "Professora Maria", sender_role: "teacher",
    file_url: "/example.pdf",
    file_name: "exercicios-semana-12.pdf",
    file_type: "application/pdf",
    file_size: 524288,
    content: "Aqui está o material novo para essa semana 👇",
    created_at: new Date(Date.now() - 3600000).toISOString(),
  }),
  mkMsg({
    id: "m8", sender_id: ME, sender_name: "Eu",
    content: "Perfeito! Obrigado!",
    created_at: new Date(Date.now() - 1800000).toISOString(),
    reactions: [{ emoji: "👍", user_ids: [TEACHER, ADMIN] }],
  }),
  mkMsg({
    id: "m9", sender_id: TEACHER, sender_name: "Professora Maria", sender_role: "teacher",
    content: "",
    deleted_at: new Date(Date.now() - 600000).toISOString(),
    created_at: new Date(Date.now() - 1200000).toISOString(),
  }),
  mkMsg({
    id: "m10", sender_id: TEACHER, sender_name: "Professora Maria", sender_role: "teacher",
    content: "Vejo você amanhã!",
    edited_at: new Date(Date.now() - 30000).toISOString(),
    created_at: new Date(Date.now() - 60000).toISOString(),
  }),
];

const broadcastRecipients = [
  { user_id: STUDENT_A, name: "João Silva", subtitle: "A2 · Inglês" },
  { user_id: STUDENT_B, name: "Maria Santos", subtitle: "B1 · Inglês" },
  { user_id: "s3", name: "Pedro Costa", subtitle: "A1 · Espanhol" },
  { user_id: "s4", name: "Ana Oliveira", subtitle: "B2 · Inglês" },
  { user_id: "s5", name: "Carlos Souza", subtitle: "A2 · Espanhol" },
];

const ChatTest = () => {
  const [rooms, setRooms] = useState<ChatRoomT[]>(seedRooms);
  const [messages, setMessages] = useState<ChatMessage[]>(seedMessages);
  const [activeId, setActiveId] = useState<string | null>("r1");
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [typingMock, setTypingMock] = useState<string[]>([]);
  const { theme, setTheme, themes } = useTheme();

  const activeRoom = rooms.find(r => r.id === activeId) ?? null;

  const handleSend = (text: string, file?: File) => {
    if (!activeRoom) return;
    const newMsg: ChatMessage = mkMsg({
      sender_id: ME,
      sender_name: "Eu",
      content: text || null,
      file_url: file ? URL.createObjectURL(file) : null,
      file_name: file?.name ?? null,
      file_type: file?.type ?? null,
      file_size: file?.size ?? null,
      created_at: new Date().toISOString(),
    });
    setMessages(m => [...m, newMsg]);
    // Simulate teacher replying after 2s
    setTimeout(() => {
      setTypingMock([TEACHER]);
      setTimeout(() => {
        setTypingMock([]);
        setMessages(m => [...m, mkMsg({
          sender_id: TEACHER, sender_name: "Professora Maria", sender_role: "teacher",
          content: "Resposta automática (mock)",
          created_at: new Date().toISOString(),
        })]);
      }, 1500);
    }, 800);
  };

  const handleReact = (msg: ChatMessage, emoji: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== msg.id) return m;
      const reactions = m.reactions ? [...m.reactions] : [];
      const idx = reactions.findIndex(r => r.emoji === emoji);
      if (idx >= 0) {
        const has = reactions[idx].user_ids.includes(ME);
        if (has) {
          reactions[idx] = { ...reactions[idx], user_ids: reactions[idx].user_ids.filter(u => u !== ME) };
          if (reactions[idx].user_ids.length === 0) reactions.splice(idx, 1);
        } else {
          reactions[idx] = { ...reactions[idx], user_ids: [...reactions[idx].user_ids, ME] };
        }
      } else {
        reactions.push({ emoji, user_ids: [ME] });
      }
      return { ...m, reactions };
    }));
  };

  const handleDelete = (msg: ChatMessage) => {
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, deleted_at: new Date().toISOString() } : m));
  };

  const togglePin = () => {
    if (!activeRoom) return;
    setRooms(r => r.map(x => x.id === activeRoom.id ? { ...x, is_pinned: !x.is_pinned } : x));
  };
  const toggleMute = () => {
    if (!activeRoom) return;
    setRooms(r => r.map(x => x.id === activeRoom.id ? { ...x, is_muted: !x.is_muted } : x));
  };
  const toggleArchive = () => {
    if (!activeRoom) return;
    setRooms(r => r.map(x => x.id === activeRoom.id ? { ...x, is_archived: !x.is_archived } : x));
  };

  const handleBroadcast = async (userIds: string[], message: string) => {
    console.log("Broadcast to", userIds, message);
    alert(`Mock: enviado para ${userIds.length} pessoa(s)`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Theme switcher (dev only) */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-3 text-xs">
        <span className="font-bold text-amber-900">CHAT TEST · Tema:</span>
        {(Object.entries(themes) as [string, any][]).map(([key, t]) => (
          <button
            key={key}
            onClick={() => setTheme(key as any)}
            className={`px-2 py-1 rounded ${theme === key ? "bg-amber-900 text-white" : "bg-white text-amber-900"}`}
          >
            {t.name}
          </button>
        ))}
        <span className="text-amber-700 ml-auto">/chat-test (placeholder com mock data)</span>
      </div>

      <div className="flex h-[calc(100vh-40px)]">
        <div className="w-72 lg:w-80 shrink-0">
          <ChatList
            rooms={rooms}
            activeRoomId={activeId}
            onSelectRoom={setActiveId}
            onBroadcast={() => setBroadcastOpen(true)}
            showArchived
          />
        </div>
        <div className="flex-1 min-w-0">
          {activeRoom ? (
            <ChatRoom
              room={activeRoom}
              messages={messages}
              currentUserId={ME}
              typingUsers={typingMock}
              onSend={handleSend}
              onReact={handleReact}
              onDelete={handleDelete}
              onTyping={() => {}}
              onTogglePin={togglePin}
              onToggleMute={toggleMute}
              onToggleArchive={toggleArchive}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Selecione uma conversa
            </div>
          )}
        </div>
      </div>

      <BroadcastDialog
        open={broadcastOpen}
        onOpenChange={setBroadcastOpen}
        recipients={broadcastRecipients}
        onSend={handleBroadcast}
      />
    </div>
  );
};

export default ChatTest;
