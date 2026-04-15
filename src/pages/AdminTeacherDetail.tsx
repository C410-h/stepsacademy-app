import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Users,
  CalendarCheck,
  GraduationCap,
  BookOpen,
  Mail,
  Phone,
  Flame,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

interface LanguageItem {
  id: string;
  name: string;
}

interface TeacherLanguageRow {
  languages: LanguageItem | null;
}

interface ProfileInfo {
  name: string;
  phone: string | null;
  avatar_url: string | null;
}

interface TeacherDetail {
  id: string;
  user_id: string;
  bio: string | null;
  profiles: ProfileInfo | null;
  teacher_languages: TeacherLanguageRow[];
}

interface StudentLevel {
  name: string;
  code: string;
}

interface StudentLanguage {
  name: string;
}

interface StudentProfile {
  name: string;
}

interface StudentRow {
  id: string;
  status: string | null;
  language_id: string | null;
  level_id: string | null;
  profiles: StudentProfile | null;
  languages: StudentLanguage | null;
  levels: StudentLevel | null;
}

interface TeacherStudentRow {
  student_id: string;
  students: StudentRow | null;
}

interface GroupRow {
  id: string;
  name: string;
  meet_link: string | null;
  group_students: { count: number }[];
}

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function statusLabel(status: string | null): string {
  switch (status) {
    case "active":
      return "Ativo";
    case "inactive":
      return "Inativo";
    case "paused":
      return "Pausado";
    default:
      return status ?? "—";
  }
}

function statusVariant(
  status: string | null
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "inactive":
      return "destructive";
    case "paused":
      return "secondary";
    default:
      return "outline";
  }
}

// ────────────────────────────────────────────
// KPI Card
// ────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  loading: boolean;
}

function KpiCard({ icon, label, value, loading }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          {icon}
          {label}
        </div>
        {loading ? (
          <Skeleton className="h-8 w-12" />
        ) : (
          <p className="text-2xl font-bold text-foreground">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────

export default function AdminTeacherDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [teacher, setTeacher] = useState<TeacherDetail | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [classesThisMonth, setClassesThisMonth] = useState(0);
  const [totalClasses, setTotalClasses] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // 1. Teacher profile
        const { data: teacherRaw, error: teacherErr } = await (supabase as any)
          .from("teachers")
          .select(
            "id, user_id, bio, profiles!teachers_user_id_fkey(name, phone, avatar_url), teacher_languages(languages!teacher_languages_language_id_fkey(id, name))"
          )
          .eq("id", id)
          .single();

        if (teacherErr) throw teacherErr;
        const t = teacherRaw as TeacherDetail;
        setTeacher(t);

        // 2. Students linked to this teacher
        const { data: tsRows, error: tsErr } = await (supabase as any)
          .from("teacher_students")
          .select(
            "student_id, students!teacher_students_student_id_fkey(id, status, language_id, level_id, profiles!students_user_id_fkey(name), languages!students_language_id_fkey(name), levels!students_level_id_fkey(name, code))"
          )
          .eq("teacher_id", id);

        if (tsErr) throw tsErr;
        const parsedStudents: StudentRow[] = (
          (tsRows as TeacherStudentRow[]) ?? []
        )
          .map((r) => r.students)
          .filter((s): s is StudentRow => s !== null);
        setStudents(parsedStudents);

        // 3 & 4. Classes count — use teacher's user_id
        const userId: string = t.user_id;
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const [monthRes, totalRes] = await Promise.all([
          (supabase as any)
            .from("step_completions")
            .select("id", { count: "exact" })
            .eq("teacher_id", userId)
            .gte("completed_at", startOfMonth.toISOString()),
          (supabase as any)
            .from("step_completions")
            .select("id", { count: "exact" })
            .eq("teacher_id", userId),
        ]);

        if (monthRes.error) throw monthRes.error;
        if (totalRes.error) throw totalRes.error;

        setClassesThisMonth(monthRes.count ?? 0);
        setTotalClasses(totalRes.count ?? 0);

        // 5. Groups
        const { data: groupsRaw, error: groupsErr } = await (supabase as any)
          .from("groups")
          .select("id, name, meet_link, group_students(count)")
          .eq("teacher_id", id);

        if (groupsErr) throw groupsErr;
        setGroups((groupsRaw as GroupRow[]) ?? []);
      } catch (err) {
        console.error("Error loading teacher detail:", err);
        setError("Não foi possível carregar os dados do professor.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  const teacherName = teacher?.profiles?.name ?? "Professor";
  const activeStudents = students.filter((s) => s.status === "active").length;
  const languages: LanguageItem[] = (teacher?.teacher_languages ?? [])
    .map((tl) => tl.languages)
    .filter((l): l is LanguageItem => l !== null);

  return (
    <div className="bg-background min-h-screen">
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <img
          src="/brand/logo-reto-darkpurple.webp"
          alt="Steps Academy"
          className="h-10"
        />
        {/* spacer to center logo */}
        <div className="w-9" />
      </header>

      {/* ── Main content ── */}
      <main className="px-4 py-6 max-w-4xl mx-auto space-y-6">
        {error && (
          <div className="rounded-md bg-destructive/10 text-destructive text-sm px-4 py-3">
            {error}
          </div>
        )}

        {/* Profile hero */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
              {/* Avatar */}
              {loading ? (
                <Skeleton className="h-20 w-20 rounded-full shrink-0" />
              ) : (
                <Avatar className="h-20 w-20 shrink-0">
                  <AvatarImage
                    src={teacher?.profiles?.avatar_url ?? undefined}
                    alt={teacherName}
                  />
                  <AvatarFallback className="text-2xl">
                    {getInitials(teacherName)}
                  </AvatarFallback>
                </Avatar>
              )}

              {/* Info */}
              <div className="flex-1 text-center sm:text-left space-y-1.5">
                {loading ? (
                  <>
                    <Skeleton className="h-7 w-40 mx-auto sm:mx-0" />
                    <Skeleton className="h-4 w-24 mx-auto sm:mx-0" />
                    <Skeleton className="h-4 w-full mt-2" />
                    <Skeleton className="h-4 w-3/4" />
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-bold text-foreground">
                      {teacherName}
                    </h2>
                    <p className="text-sm text-muted-foreground font-medium">
                      Professor
                    </p>

                    {teacher?.bio && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {teacher.bio}
                      </p>
                    )}

                    <div className="flex flex-wrap justify-center sm:justify-start gap-3 mt-2 text-sm text-muted-foreground">
                      {teacher?.profiles?.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5" />
                          {teacher.profiles.phone}
                        </span>
                      )}
                    </div>

                    {languages.length > 0 && (
                      <div className="flex flex-wrap justify-center sm:justify-start gap-1.5 mt-2">
                        {languages.map((lang) => (
                          <Badge key={lang.id} variant="secondary">
                            {lang.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            icon={<Flame className="h-3.5 w-3.5" />}
            label="Alunos ativos"
            value={activeStudents}
            loading={loading}
          />
          <KpiCard
            icon={<Users className="h-3.5 w-3.5" />}
            label="Total alunos"
            value={students.length}
            loading={loading}
          />
          <KpiCard
            icon={<CalendarCheck className="h-3.5 w-3.5" />}
            label="Aulas este mês"
            value={classesThisMonth}
            loading={loading}
          />
          <KpiCard
            icon={<BookOpen className="h-3.5 w-3.5" />}
            label="Total aulas"
            value={totalClasses}
            loading={loading}
          />
        </div>

        {/* Students section */}
        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-muted-foreground" />
            Alunos
          </h3>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : students.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                Nenhum aluno vinculado a este professor.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {students.map((student) => (
                <Card key={student.id}>
                  <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className="text-sm">
                          {getInitials(student.profiles?.name ?? "?")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {student.profiles?.name ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[
                            student.languages?.name,
                            student.levels?.code
                              ? `Nível ${student.levels.code}`
                              : student.levels?.name,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={statusVariant(student.status)}
                      className="shrink-0 text-xs"
                    >
                      {statusLabel(student.status)}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Groups / Turmas section */}
        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            Turmas
          </h3>

          {loading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                Nenhuma turma vinculada a este professor.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {groups.map((group) => {
                const studentCount =
                  group.group_students?.[0]?.count ?? 0;
                return (
                  <Card key={group.id}>
                    <CardContent className="py-4 px-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground leading-snug">
                          {group.name}
                        </p>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {studentCount}{" "}
                          {studentCount === 1 ? "aluno" : "alunos"}
                        </Badge>
                      </div>
                      {group.meet_link && (
                        <a
                          href={group.meet_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            "inline-flex items-center gap-1.5 text-xs text-primary hover:underline truncate max-w-full"
                          )}
                        >
                          <LogOut className="h-3 w-3 shrink-0" />
                          <span className="truncate">{group.meet_link}</span>
                        </a>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
