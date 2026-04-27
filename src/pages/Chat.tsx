import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Headphones } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ChatLayout } from "@/components/chat/ChatLayout";
import type { BroadcastRecipient } from "@/components/chat/BroadcastDialog";
import { Button } from "@/components/ui/button";

const Chat = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const teacherParam = searchParams.get("teacher");
  const supportParam = searchParams.get("support");
  const [bootstrapped, setBootstrapped] = useState(false);
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);
  const [initialRoomId, setInitialRoomId] = useState<string | null>(null);

  // Bootstrap chat rooms based on role
  useEffect(() => {
    if (!profile) return;

    (async () => {
      // Always: ensure support room exists for the user
      await (supabase as any).rpc("get_or_create_support_room");

      if (profile.role === "student") {
        // Auto-create chat with the student's teacher(s)
        const { data: studentRow } = await (supabase as any)
          .from("students").select("id").eq("user_id", profile.id).maybeSingle();
        if (studentRow) {
          const { data: tsRows } = await (supabase as any)
            .from("teacher_students")
            .select("teachers!inner(user_id)")
            .eq("student_id", studentRow.id);
          for (const row of (tsRows ?? [])) {
            const teacherUserId = (row as any).teachers?.user_id;
            if (teacherUserId && teacherUserId !== profile.id) {
              await (supabase as any).rpc("get_or_create_direct_room", { p_other_user_id: teacherUserId });
            }
          }
        }
      } else if (profile.role === "teacher") {
        // Build broadcast recipient list (all of teacher's students)
        const { data: teacherRow } = await (supabase as any)
          .from("teachers").select("id").eq("user_id", profile.id).maybeSingle();
        if (teacherRow) {
          const { data: tsRows } = await (supabase as any)
            .from("teacher_students")
            .select("students!inner(user_id, profiles!students_user_id_fkey(name, avatar_url), languages!students_language_id_fkey(name))")
            .eq("teacher_id", teacherRow.id);
          const recs: BroadcastRecipient[] = (tsRows ?? [])
            .map((r: any) => ({
              user_id: r.students?.user_id,
              name: r.students?.profiles?.name ?? "—",
              avatar_url: r.students?.profiles?.avatar_url,
              subtitle: r.students?.languages?.name,
            }))
            .filter((r: BroadcastRecipient) => r.user_id);
          setRecipients(recs);
        }
      } else if (profile.role === "admin") {
        // Admins can broadcast to anyone — include students + teachers
        const { data: profs } = await (supabase as any)
          .from("profiles")
          .select("id, name, avatar_url, role")
          .in("role", ["student", "teacher"]);
        const recs: BroadcastRecipient[] = (profs ?? []).map((p: any) => ({
          user_id: p.id,
          name: p.name ?? "—",
          avatar_url: p.avatar_url,
          subtitle: p.role === "teacher" ? "Professor(a)" : "Aluno(a)",
        }));
        setRecipients(recs);
      }

      setBootstrapped(true);
    })();
  }, [profile]);

  // Resolve deep-link target room AFTER bootstrap so the room exists
  useEffect(() => {
    if (!profile || !bootstrapped) return;
    (async () => {
      if (teacherParam) {
        const { data } = await (supabase as any).rpc("get_or_create_direct_room", { p_other_user_id: teacherParam });
        if (data) setInitialRoomId(data);
      } else if (supportParam) {
        const { data } = await (supabase as any).rpc("get_or_create_support_room");
        if (data) setInitialRoomId(data);
      }
    })();
  }, [profile, bootstrapped, teacherParam, supportParam]);

  if (!profile) return null;

  const role = profile.role as "student" | "teacher" | "admin";

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <h1 className="font-semibold text-base flex items-center gap-2">
          <Headphones className="h-4 w-4" />
          Mensagens
        </h1>
      </header>

      <main className="p-3 md:p-4 max-w-6xl mx-auto h-[calc(100vh-60px)]">
        {bootstrapped ? (
          <ChatLayout
            broadcastRecipients={role !== "student" ? recipients : undefined}
            initialRoomId={initialRoomId}
            emptyHint={
              role === "student"
                ? "Seu chat com o(a) professor(a) aparecerá aqui."
                : role === "teacher"
                  ? "Conversas com seus alunos aparecerão aqui."
                  : "Conversas dos usuários aparecerão aqui."
            }
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Preparando suas conversas…
          </div>
        )}
      </main>
    </div>
  );
};

export default Chat;
