import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import {
  Plus, Upload, LogOut, Users, Copy, GraduationCap,
  BookOpen, CalendarCheck, AlertCircle, Link2
} from "lucide-react";
import { Navigate } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentRow {
  id: string;
  status: string;
  currentStepNumber: number;
  profile: { name: string } | null;
  language: { name: string } | null;
  level: { name: string; code: string } | null;
  teacherName: string | null;
  createdAt: string;
  languageId: string;
  levelId: string;
}

interface TeacherRow {
  id: string;
  userId: string;
  name: string;
  languages: string[];
  studentCount: number;
}

interface DashMetrics {
  activeStudents: number;
  totalTeachers: number;
  classesThisMonth: number;
  studentsInactive7d: number;
}

interface LanguageDist {
  id: string;
  name: string;
  count: number;
  color: string;
}

interface LevelDist {
  languageName: string;
  levels: { code: string; name: string; count: number }[];
}

interface RecentClass {
  studentName: string;
  teacherName: string;
  stepNumber: number;
  completedAt: string;
}

interface LangOption { id: string; name: string; }
interface LevelOption { id: string; name: string; code: string; language_id: string; }

const LANG_COLORS: Record<string, string> = {
  "Inglês": "#520A70",
  "Espanhol": "#F97316",
  "Libras": "#FF97CB",
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

// ─── Component ────────────────────────────────────────────────────────────────

const Admin = () => {
  const { profile, signOut } = useAuth();

  // ── Reference data
  const [languages, setLanguages] = useState<LangOption[]>([]);
  const [levels, setLevels] = useState<LevelOption[]>([]);

  // ── Alunos tab
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);

  // ── Dashboard tab
  const [metrics, setMetrics] = useState<DashMetrics | null>(null);
  const [langDist, setLangDist] = useState<LanguageDist[]>([]);
  const [levelDist, setLevelDist] = useState<LevelDist[]>([]);
  const [recentStudents, setRecentStudents] = useState<StudentRow[]>([]);
  const [recentClasses, setRecentClasses] = useState<RecentClass[]>([]);
  const [dashLoading, setDashLoading] = useState(true);

  // ── Professores tab
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(true);

  // ── New student form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newLangId, setNewLangId] = useState("");
  const [newLevelId, setNewLevelId] = useState("");
  const [creatingStudent, setCreatingStudent] = useState(false);
  const [showNewStudent, setShowNewStudent] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  // ── Upload material form
  const [matTitle, setMatTitle] = useState("");
  const [matLangId, setMatLangId] = useState("");
  const [matLevelId, setMatLevelId] = useState("");
  const [matType, setMatType] = useState("vocab");
  const [matDelivery, setMatDelivery] = useState("before");
  const [matFile, setMatFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  // ── Link student to teacher modal
  const [linkTeacherId, setLinkTeacherId] = useState<string | null>(null);
  const [linkStudentId, setLinkStudentId] = useState("");
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    loadReference();
    loadStudents();
    loadDashboard();
    loadTeachers();
  }, []);

  // ── Reference data (languages + levels) ─────────────────────────────────────
  const loadReference = async () => {
    const [{ data: langs }, { data: lvls }] = await Promise.all([
      supabase.from("languages").select("id, name").eq("active", true),
      supabase.from("levels").select("id, name, code, language_id"),
    ]);
    setLanguages(langs || []);
    setLevels(lvls || []);
  };

  // ── Students tab ─────────────────────────────────────────────────────────────
  const loadStudents = async () => {
    setStudentsLoading(true);
    const { data: langs } = await supabase.from("languages").select("id, name").eq("active", true);
    const { data: lvls } = await supabase.from("levels").select("id, name, code, language_id");

    const { data: studs } = await supabase.from("students").select(`
      id, status, user_id, language_id, level_id, current_step_id, created_at,
      profiles!students_user_id_fkey(name),
      steps!students_current_step_id_fkey(number),
      teacher_students(teachers(profiles!teachers_user_id_fkey(name)))
    `).order("created_at", { ascending: false });

    if (studs) {
      const rows: StudentRow[] = (studs as any[]).map(s => {
        const teacherEntry = s.teacher_students?.[0];
        const tp = teacherEntry?.teachers?.profiles;
        const teacherName = Array.isArray(tp) ? tp[0]?.name || null : tp?.name || null;
        const langData = (langs || []).find(l => l.id === s.language_id);
        const levelData = (lvls || []).find(l => l.id === s.level_id);
        return {
          id: s.id,
          status: s.status,
          currentStepNumber: s.steps?.number || 0,
          profile: s.profiles ? { name: s.profiles.name } : null,
          language: langData ? { name: langData.name } : null,
          level: levelData ? { name: levelData.name, code: levelData.code } : null,
          teacherName,
          createdAt: s.created_at,
          languageId: s.language_id,
          levelId: s.level_id,
        };
      });
      setStudents(rows);
    }
    setStudentsLoading(false);
  };

  // ── Dashboard ─────────────────────────────────────────────────────────────────
  const loadDashboard = async () => {
    setDashLoading(true);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: activeStuds },
      { data: teacherCount },
      { data: monthClasses },
      { data: recentClassData },
      { data: studsWithLang },
      { data: allLangs },
      { data: allLevels },
      { data: recentStudData },
    ] = await Promise.all([
      supabase.from("students").select("id, language_id, level_id", { count: "exact" }).eq("status", "active"),
      supabase.from("teachers").select("id", { count: "exact" }),
      supabase.from("classes").select("id, student_id", { count: "exact" })
        .eq("status", "completed")
        .gte("scheduled_at", monthStart),
      supabase.from("classes").select(`
        scheduled_at, step_id,
        students!classes_student_id_fkey(profiles!students_user_id_fkey(name)),
        teachers!classes_teacher_id_fkey(profiles!teachers_user_id_fkey(name)),
        steps!classes_step_id_fkey(number)
      `).eq("status", "completed").order("scheduled_at", { ascending: false }).limit(5),
      supabase.from("students").select("id, language_id, level_id, status").eq("status", "active"),
      supabase.from("languages").select("id, name").eq("active", true),
      supabase.from("levels").select("id, name, code, language_id"),
      supabase.from("students").select(`
        id, created_at, language_id, level_id, status,
        profiles!students_user_id_fkey(name)
      `).order("created_at", { ascending: false }).limit(5),
    ]);

    // Alunos sem aula nos últimos 7 dias
    const { data: activeClasses7d } = await supabase
      .from("classes")
      .select("student_id")
      .eq("status", "completed")
      .gte("scheduled_at", sevenDaysAgo);

    const activeSet = new Set((activeClasses7d || []).map((c: any) => c.student_id));
    const inactiveCount = (activeStuds || []).filter(s => !activeSet.has(s.id)).length;

    setMetrics({
      activeStudents: activeStuds?.length || 0,
      totalTeachers: teacherCount?.length || 0,
      classesThisMonth: monthClasses?.length || 0,
      studentsInactive7d: inactiveCount,
    });

    // Distribuição por idioma
    const langMap: Record<string, number> = {};
    (studsWithLang || []).forEach((s: any) => {
      if (s.language_id) langMap[s.language_id] = (langMap[s.language_id] || 0) + 1;
    });
    const totalActive = studsWithLang?.length || 0;
    const langDistArr: LanguageDist[] = (allLangs || []).map(l => ({
      id: l.id,
      name: l.name,
      count: langMap[l.id] || 0,
      color: LANG_COLORS[l.name] || "#6B7280",
    })).filter(l => l.count > 0);
    setLangDist(langDistArr);

    // Distribuição por nível (agrupado por idioma)
    const levelMap: Record<string, number> = {};
    (studsWithLang || []).forEach((s: any) => {
      if (s.level_id) levelMap[s.level_id] = (levelMap[s.level_id] || 0) + 1;
    });
    const groupedByLang: Record<string, LevelDist> = {};
    (allLevels || []).forEach(lv => {
      const lang = (allLangs || []).find(l => l.id === lv.language_id);
      if (!lang) return;
      const cnt = levelMap[lv.id] || 0;
      if (cnt === 0) return;
      if (!groupedByLang[lang.id]) groupedByLang[lang.id] = { languageName: lang.name, levels: [] };
      groupedByLang[lang.id].levels.push({ code: lv.code, name: lv.name, count: cnt });
    });
    setLevelDist(Object.values(groupedByLang));

    // Alunos recentes
    if (recentStudData) {
      const langLookup = Object.fromEntries((allLangs || []).map(l => [l.id, l.name]));
      const levelLookup = Object.fromEntries((allLevels || []).map(l => [l.id, { name: l.name, code: l.code }]));
      const recent: StudentRow[] = (recentStudData as any[]).map(s => ({
        id: s.id,
        status: s.status,
        currentStepNumber: 0,
        profile: s.profiles ? { name: s.profiles.name } : null,
        language: s.language_id ? { name: langLookup[s.language_id] || "—" } : null,
        level: s.level_id ? levelLookup[s.level_id] || null : null,
        teacherName: null,
        createdAt: s.created_at,
        languageId: s.language_id,
        levelId: s.level_id,
      }));
      setRecentStudents(recent);
    }

    // Atividade recente
    if (recentClassData) {
      const classes: RecentClass[] = (recentClassData as any[]).map((c: any) => {
        const sp = c.students?.profiles;
        const studentName = Array.isArray(sp) ? sp[0]?.name : sp?.name || "—";
        const tp = c.teachers?.profiles;
        const teacherName = Array.isArray(tp) ? tp[0]?.name : tp?.name || "—";
        return {
          studentName,
          teacherName,
          stepNumber: c.steps?.number || 0,
          completedAt: c.scheduled_at,
        };
      });
      setRecentClasses(classes);
    }

    setDashLoading(false);
  };

  // ── Teachers tab ──────────────────────────────────────────────────────────────
  const loadTeachers = async () => {
    setTeachersLoading(true);
    const { data: teacherData } = await supabase.from("teachers").select(`
      id, user_id,
      profiles!teachers_user_id_fkey(name),
      teacher_languages(languages!teacher_languages_language_id_fkey(name)),
      teacher_students(student_id)
    `);

    if (teacherData) {
      const rows: TeacherRow[] = (teacherData as any[]).map(t => {
        const tp = t.profiles;
        const name = Array.isArray(tp) ? tp[0]?.name || "—" : tp?.name || "—";
        const langs = (t.teacher_languages || []).map((tl: any) => tl.languages?.name).filter(Boolean);
        return {
          id: t.id,
          userId: t.user_id,
          name,
          languages: langs,
          studentCount: t.teacher_students?.length || 0,
        };
      });
      setTeachers(rows);
    }
    setTeachersLoading(false);
  };

  // ── Actions ──────────────────────────────────────────────────────────────────

  // PRESERVE ORIGINAL - não alterar
  const handleCreateStudent = async () => {
    if (!newName || !newEmail || !newLangId || !newLevelId) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    setCreatingStudent(true);
    setTempPassword(null);

    const { data, error } = await supabase.functions.invoke("create-student", {
      body: { name: newName, email: newEmail, phone: newPhone || null, language_id: newLangId, level_id: newLevelId },
    });

    if (error || !data?.success) {
      toast({ title: "Erro ao criar aluno", description: data?.error || error?.message || "Tente novamente.", variant: "destructive" });
      setCreatingStudent(false);
      return;
    }
    if (data.temp_password) setTempPassword(data.temp_password);
    toast({ title: "Aluno criado com sucesso!" });
    setNewName(""); setNewEmail(""); setNewPhone(""); setNewLangId(""); setNewLevelId("");
    setCreatingStudent(false);
    loadStudents();
    loadDashboard();
  };

  // PRESERVE ORIGINAL - não alterar
  const handleUploadMaterial = async () => {
    if (!matTitle || !matFile || !matLangId || !matLevelId) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    setUploading(true);
    const fileExt = matFile.name.split(".").pop();
    const filePath = `${matLangId}/${matLevelId}/${Date.now()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from("materials").upload(filePath, matFile);
    if (uploadError) {
      toast({ title: "Erro no upload", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("materials").getPublicUrl(filePath);
    await supabase.from("materials").insert([{
      title: matTitle, type: matType, delivery: matDelivery,
      level_id: matLevelId, file_url: urlData.publicUrl, filename: matFile.name,
    }]);
    toast({ title: "Material enviado com sucesso!" });
    setShowUpload(false);
    setMatTitle(""); setMatFile(null);
    setUploading(false);
  };

  const handleLinkStudent = async () => {
    if (!linkTeacherId || !linkStudentId) return;
    setLinking(true);
    const { error } = await supabase.from("teacher_students").insert({
      teacher_id: linkTeacherId,
      student_id: linkStudentId,
    });
    if (error) {
      toast({ title: "Erro ao vincular aluno", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Aluno vinculado com sucesso!" });
      setLinkTeacherId(null);
      setLinkStudentId("");
      loadTeachers();
    }
    setLinking(false);
  };

  if (profile?.role !== "admin") return <Navigate to="/" replace />;

  const filteredLevels = (langId: string) => levels.filter(l => l.language_id === langId);
  const firstName = profile?.name?.split(" ")[0] || "Admin";

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-background border-b">
        <span className="text-lg font-bold text-primary">steps academy</span>
        <div className="flex items-center gap-3">
          <span className="text-sm font-light text-muted-foreground hidden sm:block">{firstName} · Admin</span>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="px-4 py-4 max-w-4xl mx-auto">
        <Tabs defaultValue="overview">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="overview" className="flex-1">Visão Geral</TabsTrigger>
            <TabsTrigger value="students" className="flex-1">Alunos</TabsTrigger>
            <TabsTrigger value="teachers" className="flex-1">Professores</TabsTrigger>
          </TabsList>

          {/* ── Visão Geral ─────────────────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-5">

            {/* Metric cards */}
            <div className="grid grid-cols-2 gap-3">
              {dashLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-lg" />
                ))
              ) : (
                <>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Users className="h-4 w-4 text-primary" />
                        <span className="text-xs text-muted-foreground font-light">Alunos ativos</span>
                      </div>
                      <p className="text-3xl font-bold text-primary">{metrics?.activeStudents ?? 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <GraduationCap className="h-4 w-4 text-primary" />
                        <span className="text-xs text-muted-foreground font-light">Professores</span>
                      </div>
                      <p className="text-3xl font-bold text-primary">{metrics?.totalTeachers ?? 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <CalendarCheck className="h-4 w-4 text-primary" />
                        <span className="text-xs text-muted-foreground font-light">Aulas este mês</span>
                      </div>
                      <p className="text-3xl font-bold text-primary">{metrics?.classesThisMonth ?? 0}</p>
                    </CardContent>
                  </Card>
                  <Card className={metrics?.studentsInactive7d ? "border-orange-300" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                        <span className="text-xs text-muted-foreground font-light">Sem aula (7d)</span>
                      </div>
                      <p className={`text-3xl font-bold ${metrics?.studentsInactive7d ? "text-orange-500" : "text-primary"}`}>
                        {metrics?.studentsInactive7d ?? 0}
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* Distribuição por idioma */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold">Alunos por idioma</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {dashLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : langDist.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum dado disponível.</p>
                ) : (
                  langDist.map(l => (
                    <div key={l.id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-bold" style={{ color: l.color }}>{l.name}</span>
                        <span className="text-muted-foreground">{l.count} aluno{l.count !== 1 ? "s" : ""}</span>
                      </div>
                      <Progress
                        value={(l.count / (metrics?.activeStudents || 1)) * 100}
                        className="h-2"
                        style={{ "--progress-foreground": l.color } as React.CSSProperties}
                      />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Distribuição por nível */}
            {!dashLoading && levelDist.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold">Distribuição por nível</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {levelDist.map(group => (
                    <div key={group.languageName}>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
                        {group.languageName}
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        {group.levels.map(lv => (
                          <div key={lv.code} className="text-center bg-muted rounded-lg py-2 px-1">
                            <p className="text-xs font-bold text-primary">{lv.code}</p>
                            <p className="text-lg font-bold">{lv.count}</p>
                            <p className="text-[10px] text-muted-foreground font-light leading-tight">{lv.name}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Alunos recentes */}
            <Card>
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold">Alunos recentes</CardTitle>
                <button
                  className="text-xs text-primary font-light hover:underline"
                  onClick={() => {
                    const tab = document.querySelector('[data-value="students"]') as HTMLElement;
                    tab?.click();
                  }}
                >
                  Ver todos →
                </button>
              </CardHeader>
              <CardContent className="space-y-2">
                {dashLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : recentStudents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum aluno cadastrado ainda.</p>
                ) : (
                  recentStudents.map(s => (
                    <div key={s.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                      <div>
                        <p className="text-sm font-bold">{s.profile?.name || "—"}</p>
                        <p className="text-xs text-muted-foreground font-light">
                          {s.language?.name || "—"} · {s.level?.code || "—"}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">{formatDate(s.createdAt)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Atividade recente */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold">Atividade recente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dashLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : recentClasses.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma aula registrada ainda.</p>
                ) : (
                  recentClasses.map((c, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0">
                      <div>
                        <p className="text-sm font-bold">{c.studentName}</p>
                        <p className="text-xs text-muted-foreground font-light">
                          Prof. {c.teacherName} · Passo {c.stepNumber}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">{formatDate(c.completedAt)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Alunos ──────────────────────────────────────────────────────── */}
          <TabsContent value="students" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Users className="h-5 w-5" /> Alunos
              </h2>
              <div className="flex gap-2">
                {/* Novo aluno */}
                <Dialog open={showNewStudent} onOpenChange={open => { setShowNewStudent(open); if (!open) setTempPassword(null); }}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo aluno</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Novo aluno</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div><Label>Nome *</Label><Input value={newName} onChange={e => setNewName(e.target.value)} /></div>
                      <div><Label>E-mail *</Label><Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} /></div>
                      <div><Label>Telefone</Label><Input value={newPhone} onChange={e => setNewPhone(e.target.value)} /></div>
                      <div>
                        <Label>Idioma *</Label>
                        <Select value={newLangId} onValueChange={v => { setNewLangId(v); setNewLevelId(""); }}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>{languages.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Nível *</Label>
                        <Select value={newLevelId} onValueChange={setNewLevelId}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>{filteredLevels(newLangId).map(l => <SelectItem key={l.id} value={l.id}>{l.name} ({l.code})</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <Button className="w-full" onClick={handleCreateStudent} disabled={creatingStudent}>
                        {creatingStudent ? "Criando..." : "Criar aluno"}
                      </Button>
                      {tempPassword && (
                        <div className="mt-3 p-3 bg-muted rounded-lg space-y-2">
                          <p className="text-xs font-bold text-muted-foreground">Senha temporária do aluno:</p>
                          <p className="text-sm font-mono font-bold text-primary tracking-widest">{tempPassword}</p>
                          <p className="text-xs text-muted-foreground font-light">O aluno será solicitado a criar uma nova senha no primeiro acesso.</p>
                          <Button size="sm" variant="outline" className="w-full text-xs"
                            onClick={() => { navigator.clipboard.writeText(tempPassword); toast({ title: "Senha copiada!" }); }}>
                            <Copy className="h-3 w-3 mr-1" /> Copiar senha
                          </Button>
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Upload de material */}
                <Dialog open={showUpload} onOpenChange={setShowUpload}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline"><Upload className="h-4 w-4 mr-1" /> Upload</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Upload de material</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div><Label>Título *</Label><Input value={matTitle} onChange={e => setMatTitle(e.target.value)} /></div>
                      <div>
                        <Label>Idioma *</Label>
                        <Select value={matLangId} onValueChange={v => { setMatLangId(v); setMatLevelId(""); }}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>{languages.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Nível *</Label>
                        <Select value={matLevelId} onValueChange={setMatLevelId}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>{filteredLevels(matLangId).map(l => <SelectItem key={l.id} value={l.id}>{l.name} ({l.code})</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Tipo</Label>
                        <Select value={matType} onValueChange={setMatType}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="vocab">Vocabulário</SelectItem>
                            <SelectItem value="audio">Áudio</SelectItem>
                            <SelectItem value="grammar">Gramática</SelectItem>
                            <SelectItem value="exercise">Exercício</SelectItem>
                            <SelectItem value="slide">Slide</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Momento de entrega</Label>
                        <Select value={matDelivery} onValueChange={setMatDelivery}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="before">Antes da aula</SelectItem>
                            <SelectItem value="during">Durante a aula</SelectItem>
                            <SelectItem value="after">Após a aula</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div><Label>Arquivo (PDF ou MP3) *</Label><Input type="file" accept=".pdf,.mp3" onChange={e => setMatFile(e.target.files?.[0] || null)} /></div>
                      <Button className="w-full" onClick={handleUploadMaterial} disabled={uploading}>
                        {uploading ? "Enviando..." : "Enviar material"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {studentsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
              </div>
            ) : students.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Users className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum aluno cadastrado.</p>
                  <p className="text-xs text-muted-foreground font-light mt-1">Clique em "Novo aluno" para começar.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {students.map(s => (
                  <Card key={s.id}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold">{s.profile?.name || "Sem nome"}</p>
                          <p className="text-xs text-muted-foreground font-light">
                            {s.language?.name || "—"} · {s.level?.name || "—"} · Passo {s.currentStepNumber}
                          </p>
                          {s.teacherName && <p className="text-xs text-muted-foreground font-light">Prof. {s.teacherName}</p>}
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-bold ${s.status === "active" ? "bg-lime/20 text-steps-black" : "bg-muted text-muted-foreground"}`}>
                          {s.status === "active" ? "Ativo" : s.status}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Professores ─────────────────────────────────────────────────── */}
          <TabsContent value="teachers" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <GraduationCap className="h-5 w-5" /> Professores
              </h2>
            </div>

            {teachersLoading ? (
              <div className="space-y-3">
                {[1, 2].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
              </div>
            ) : teachers.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <GraduationCap className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum professor cadastrado.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {teachers.map(t => (
                  <Card key={t.id}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold">{t.name}</p>
                          <p className="text-xs text-muted-foreground font-light mt-0.5">
                            {t.languages.length > 0 ? t.languages.join(", ") : "Sem idioma vinculado"}
                          </p>
                          <p className="text-xs text-muted-foreground font-light">
                            {t.studentCount} {t.studentCount === 1 ? "aluno" : "alunos"} vinculado{t.studentCount !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs shrink-0"
                          onClick={() => { setLinkTeacherId(t.id); setLinkStudentId(""); }}
                        >
                          <Link2 className="h-3 w-3 mr-1" /> Vincular aluno
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Modal: vincular aluno */}
            <Dialog open={!!linkTeacherId} onOpenChange={open => { if (!open) setLinkTeacherId(null); }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Vincular aluno ao professor</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground font-light">
                    Professor: <span className="font-bold text-foreground">
                      {teachers.find(t => t.id === linkTeacherId)?.name}
                    </span>
                  </p>
                  <div>
                    <Label>Selecione o aluno</Label>
                    <Select value={linkStudentId} onValueChange={setLinkStudentId}>
                      <SelectTrigger><SelectValue placeholder="Escolha um aluno" /></SelectTrigger>
                      <SelectContent>
                        {students.map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.profile?.name || "Sem nome"} — {s.language?.name || "—"} {s.level?.code || ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full" onClick={handleLinkStudent} disabled={linking || !linkStudentId}>
                    {linking ? "Vinculando..." : "Vincular"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
