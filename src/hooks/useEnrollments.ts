import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type Enrollment = {
  id: string;
  language_id: string;
  language_name: string;
  language_code: string;
  level_id: string | null;
  level_name: string | null;
  current_step_id: string | null;
  status: string;
  active?: boolean;
};

export const useEnrollments = () => {
  const { profile } = useAuth();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    // Busca o student_id e language_id ativo
    const { data: student } = await supabase
      .from("students")
      .select("id, language_id")
      .eq("user_id", profile.id)
      .maybeSingle();

    if (!student) { setLoading(false); return; }

    const { data } = await supabase
      .from("student_enrollments")
      .select(`
        id, language_id, level_id, current_step_id, status,
        languages!student_enrollments_language_id_fkey(name, code),
        levels!student_enrollments_level_id_fkey(name)
      `)
      .eq("student_id", student.id)
      .eq("status", "active");

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setEnrollments(data.map((e: any) => ({
        id: e.id,
        language_id: e.language_id,
        language_name: e.languages?.name ?? "",
        language_code: e.languages?.code ?? "",
        level_id: e.level_id,
        level_name: e.levels?.name ?? null,
        current_step_id: e.current_step_id,
        status: e.status,
        active: e.language_id === student.language_id,
      })));
    }

    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const switchLanguage = useCallback(async (enrollment: Enrollment) => {
    if (!profile) return;

    // Atualiza students com o contexto do enrollment selecionado
    await supabase
      .from("students")
      .update({
        language_id: enrollment.language_id,
        level_id: enrollment.level_id,
        current_step_id: enrollment.current_step_id,
      })
      .eq("user_id", profile.id);

    // Recarrega para refletir o novo ativo
    await load();

    // Força reload da página para que todos os contextos atualizem
    window.location.reload();
  }, [profile, load]);

  return { enrollments, loading, switchLanguage };
};
