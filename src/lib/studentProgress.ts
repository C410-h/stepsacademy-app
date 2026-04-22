import type { SupabaseClient } from "@supabase/supabase-js";

export async function updateStudentStep(
  supabase: SupabaseClient,
  studentId: string,
  stepId: string,
  options?: { inherited?: boolean }
): Promise<void> {
  const { data: targetStep } = await supabase
    .from("steps")
    .select("id, number, unit_id")
    .eq("id", stepId)
    .single();
  if (!targetStep) throw new Error("Step não encontrado");

  const { data: targetUnit } = await supabase
    .from("units")
    .select("id, number, level_id")
    .eq("id", targetStep.unit_id)
    .single();
  if (!targetUnit) throw new Error("Unidade não encontrada");

  const { data: levelUnits } = await supabase
    .from("units")
    .select("id, number")
    .eq("level_id", targetUnit.level_id)
    .order("number");

  const priorUnitIds = (levelUnits || [])
    .filter((u) => u.number < targetUnit.number)
    .map((u) => u.id);

  const priorStepIds: string[] = [];

  if (priorUnitIds.length > 0) {
    const { data: priorUnitSteps } = await supabase
      .from("steps")
      .select("id")
      .in("unit_id", priorUnitIds);
    (priorUnitSteps || []).forEach((s) => priorStepIds.push(s.id));
  }

  const { data: sameUnitSteps } = await supabase
    .from("steps")
    .select("id, number")
    .eq("unit_id", targetStep.unit_id)
    .lt("number", targetStep.number);
  (sameUnitSteps || []).forEach((s) => priorStepIds.push(s.id));

  if (priorStepIds.length > 0) {
    await supabase.from("student_progress").upsert(
      priorStepIds.map((sid) => ({
        student_id: studentId,
        step_id: sid,
        status: "done",
        done_at: new Date().toISOString(),
        is_inherited: options?.inherited ?? false,
      })),
      { onConflict: "student_id,step_id" }
    );
  }

  await supabase.from("student_progress").upsert(
    {
      student_id: studentId,
      step_id: stepId,
      status: "available",
      unlocked_at: new Date().toISOString(),
    },
    { onConflict: "student_id,step_id" }
  );

  await supabase
    .from("students")
    .update({ current_step_id: stepId })
    .eq("id", studentId);
}
