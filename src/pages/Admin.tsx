import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Plus, Upload, LogOut, Users, Copy, GraduationCap,
  BookOpen, CalendarCheck, AlertCircle, Link2, Search,
  Download, Zap, Flame, BookCheck, Settings, Bell,
  ChevronRight, Trash2, PenLine, Eye, FileText, LayoutGrid,
  UserPlus, Globe, CreditCard,
} from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentRow {
  id: string; status: string; currentStepNumber: number;
  profile: { name: string } | null; language: { name: string } | null;
  level: { name: string; code: string } | null; teacherName: string | null;
  createdAt: string; languageId: string; levelId: string;
}
interface TeacherRow {
  id: string; userId: string; name: string; languages: string[]; studentCount: number;
}
interface DashMetrics {
  activeStudents: number; totalTeachers: number; classesThisMonth: number; studentsInactive7d: number;
}
interface EngagementMetrics {
  missionsToday: number; xpTotal: number; avgStreak: number; exercisesWeek: number;
}
interface LanguageDist { id: string; name: string; count: number; color: string; }
interface LevelDist { languageName: string; levels: { code: string; name: string; count: number }[]; }
interface RecentClass { studentName: string; teacherName: string; stepNumber: number; completedAt: string; }
interface LangOption { id: string; name: string; }
interface LevelOption { id: string; name: string; code: string; language_id: string; }
interface PaymentRow {
  id: string;
  lead_name: string | null;
  lead_email: string | null;
  lead_language: string | null;
  plan_id: string | null;
  amount_cents: number;
  status: string;
  payment_method: string | null;
  created_at: string;
  paid_at: string | null;
  student_id: string | null;
}

const LANG_COLORS: Record<string, string> = { "Inglês": "#520A70", "Espanhol": "#F97316", "Libras": "#FF97CB" };
const formatDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

const NOTIF_TYPE_LABELS: Record<string, string> = {
  material_available: "Material disponível",
  streak_at_risk: "Streak em risco",
  daily_mission_reminder: "Lembrete de missão",
  step_completed: "Passo concluído",
  level_completed: "Nível concluído",
  welcome: "Boas-vindas",
};

// ─── NotifCard (extracted to keep hooks at top level) ────────────────────────

interface NotifCardProps {
  ns: any;
  notifLog: any[];
  savingNotif: string | null;
  onSave: (ns: any, updates: any) => void;
}

const NotifCard = ({ ns, notifLog, savingNotif, onSave }: NotifCardProps) => {
  const [localEnabled, setLocalEnabled] = useState(ns.enabled);
  const [localTitle, setLocalTitle] = useState(ns.title_template || "");
  const [localBody, setLocalBody] = useState(ns.body_template || "");
  const [localSendTime, setLocalSendTime] = useState(ns.send_time || "");
  const countThisMonth = notifLog.filter((n: any) => n.type === ns.type && new Date(n.sent_at).getMonth() === new Date().getMonth()).length;
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold">{NOTIF_TYPE_LABELS[ns.type] || ns.type}</p>
            <p className="text-xs text-muted-foreground">{countThisMonth} enviadas este mês</p>
          </div>
          <Switch checked={localEnabled} onCheckedChange={setLocalEnabled} />
        </div>
        <div>
          <Label className="text-xs">Título</Label>
          <Input value={localTitle} onChange={e => setLocalTitle(e.target.value)} className="h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs">Mensagem</Label>
          <Textarea value={localBody} onChange={e => setLocalBody(e.target.value)} rows={2} className="text-xs" />
        </div>
        {ns.send_time !== null && (
          <div>
            <Label className="text-xs">Horário de envio</Label>
            <Input type="time" value={localSendTime} onChange={e => setLocalSendTime(e.target.value)} className="h-8 text-xs" />
          </div>
        )}
        <Button size="sm" className="w-full bg-primary text-white" disabled={savingNotif === ns.id}
          onClick={() => onSave(ns, { enabled: localEnabled, title_template: localTitle, body_template: localBody, ...(ns.send_time !== null ? { send_time: localSendTime } : {}) })}>
          {savingNotif === ns.id ? "Salvando..." : "Salvar"}
        </Button>
      </CardContent>
    </Card>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

const Admin = () => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  // ── Reference data
  const [languages, setLanguages] = useState<LangOption[]>([]);
  const [levels, setLevels] = useState<LevelOption[]>([]);

  // ── Alunos tab
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentFilterLang, setStudentFilterLang] = useState("all");
  const [studentFilterLevel, setStudentFilterLevel] = useState("all");
  const [studentFilterStatus, setStudentFilterStatus] = useState("all");
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);
  const [studentDrawerOpen, setStudentDrawerOpen] = useState(false);
  const [drawerGamification, setDrawerGamification] = useState<any>(null);
  const [drawerPlacement, setDrawerPlacement] = useState<any>(null);
  const [drawerClasses, setDrawerClasses] = useState<any[]>([]);
  const [drawerProgress, setDrawerProgress] = useState<{ done: number; available: number; locked: number }>({ done: 0, available: 0, locked: 0 });
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerCerts, setDrawerCerts] = useState<any[]>([]);
  const [issuingCert, setIssuingCert] = useState(false);

  // ── Dashboard tab
  const [metrics, setMetrics] = useState<DashMetrics | null>(null);
  const [engagement, setEngagement] = useState<EngagementMetrics | null>(null);
  const [weeklyClasses, setWeeklyClasses] = useState<{ week: string; aulas: number }[]>([]);
  const [topXpStudents, setTopXpStudents] = useState<{ name: string; xp: number }[]>([]);
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

  // ── Groups tab
  const [groups, setGroups] = useState<any[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);
  const [groupStudents, setGroupStudents] = useState<any[]>([]);
  const [grpName, setGrpName] = useState("");
  const [grpLangId, setGrpLangId] = useState("");
  const [grpLevelId, setGrpLevelId] = useState("");
  const [grpMeetLink, setGrpMeetLink] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [addStudentToGroupId, setAddStudentToGroupId] = useState("");
  const [addingToGroup, setAddingToGroup] = useState(false);

  // ── Content tab — Materials
  const [materials, setMaterials] = useState<any[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(true);
  const [matFilterLang, setMatFilterLang] = useState("all");
  const [matFilterLevel, setMatFilterLevel] = useState("all");

  // ── Content tab — Vocabulary
  const [vocabWords, setVocabWords] = useState<any[]>([]);
  const [vocabLoading, setVocabLoading] = useState(true);
  const [showNewVocab, setShowNewVocab] = useState(false);
  const [vocabFilterLang, setVocabFilterLang] = useState("all");
  const [vocabFilterLevel, setVocabFilterLevel] = useState("all");
  const [newWord, setNewWord] = useState("");
  const [newTranslation, setNewTranslation] = useState("");
  const [newExample, setNewExample] = useState("");
  const [newPartOfSpeech, setNewPartOfSpeech] = useState("");
  const [newDifficulty, setNewDifficulty] = useState("1");
  const [newVocabLangId, setNewVocabLangId] = useState("");
  const [newVocabLevelId, setNewVocabLevelId] = useState("");
  const [savingVocab, setSavingVocab] = useState(false);

  // ── Content tab — Exercises
  const [exercises, setExercises] = useState<any[]>([]);
  const [exercisesLoading, setExercisesLoading] = useState(true);
  const [showNewExercise, setShowNewExercise] = useState(false);
  const [exerciseFilterLevel, setExerciseFilterLevel] = useState("all");
  const [exerciseFilterStep, setExerciseFilterStep] = useState("all");
  const [newExType, setNewExType] = useState("fill_blank");
  const [newExStepId, setNewExStepId] = useState("");
  const [newExQuestion, setNewExQuestion] = useState("");
  const [newExAnswer, setNewExAnswer] = useState("");
  const [newExExplanation, setNewExExplanation] = useState("");
  const [newExOrderIndex, setNewExOrderIndex] = useState("0");
  const [assocPairs, setAssocPairs] = useState([{ left: "", right: "" }, { left: "", right: "" }]);
  const [savingExercise, setSavingExercise] = useState(false);
  const [allSteps, setAllSteps] = useState<any[]>([]);

  // ── Notifications tab
  const [notifSettings, setNotifSettings] = useState<any[]>([]);
  const [notifLog, setNotifLog] = useState<any[]>([]);
  const [notifLoading, setNotifLoading] = useState(true);
  const [savingNotif, setSavingNotif] = useState<string | null>(null);

  // ── Active tab (controlled, needed for desktop sidebar)
  const [activeTab, setActiveTab] = useState("overview");

  // ── Payments tab
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentFilter, setPaymentFilter] = useState<"all" | "pending" | "paid" | "failed">("all");
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [plansMap, setPlansMap] = useState<Record<string, string>>({});

  // ── Settings tab
  const [schoolName, setSchoolName] = useState(() => localStorage.getItem("schoolName") || "Steps Academy");
  const [defaultMeetLink, setDefaultMeetLink] = useState(() => localStorage.getItem("defaultMeetLink") || "");
  const [estimatedRevenue, setEstimatedRevenue] = useState(() => localStorage.getItem("estimatedRevenue") || "");
  const [recessStart, setRecessStart] = useState(() => localStorage.getItem("recessStart") || "");
  const [recessEnd, setRecessEnd] = useState(() => localStorage.getItem("recessEnd") || "");
  const [admins, setAdmins] = useState<any[]>([]);

  useEffect(() => {
    loadReference();
    loadStudents();
    loadDashboard();
    loadTeachers();
    loadGroups();
    loadVocabulary();
    loadExercises();
    loadNotificationSettings();
    loadNotifLog();
    loadMaterials();
    loadAllSteps();
    loadAdmins();
    loadPayments();
  }, []);

  // ── Reference data ───────────────────────────────────────────────────────────
  const loadReference = async () => {
    const [{ data: langs }, { data: lvls }] = await Promise.all([
      supabase.from("languages").select("id, name").eq("active", true),
      supabase.from("levels").select("id, name, code, language_id"),
    ]);
    setLanguages(langs || []);
    setLevels(lvls || []);
  };

  // ── Students ─────────────────────────────────────────────────────────────────
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
        const langData = (langs || []).find((l: any) => l.id === s.language_id);
        const levelData = (lvls || []).find((l: any) => l.id === s.level_id);
        return {
          id: s.id, status: s.status, currentStepNumber: s.steps?.number || 0,
          profile: s.profiles ? { name: s.profiles.name } : null,
          language: langData ? { name: langData.name } : null,
          level: levelData ? { name: levelData.name, code: levelData.code } : null,
          teacherName, createdAt: s.created_at, languageId: s.language_id, levelId: s.level_id,
        };
      });
      setStudents(rows);
    }
    setStudentsLoading(false);
  };

  const openStudentDrawer = async (student: StudentRow) => {
    setSelectedStudent(student);
    setStudentDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerGamification(null);
    setDrawerPlacement(null);
    setDrawerClasses([]);
    setDrawerProgress({ done: 0, available: 0, locked: 0 });
    setDrawerCerts([]);
    const [
      { data: gamif },
      { data: placements },
      { data: classes },
      { data: progress },
    ] = await Promise.all([
      (supabase as any).from("student_gamification").select("xp_total, coins, streak_current, streak_best").eq("student_id", student.id).single(),
      (supabase as any).from("placement_tests").select("assigned_level, test_type, notes, completed_at").eq("student_id", student.id).order("created_at", { ascending: false }).limit(1),
      supabase.from("classes").select("scheduled_at, steps!classes_step_id_fkey(number)").eq("student_id", student.id).eq("status", "completed").order("scheduled_at", { ascending: false }).limit(5),
      supabase.from("student_progress").select("status").eq("student_id", student.id),
    ]);
    setDrawerGamification(gamif || null);
    setDrawerPlacement(placements?.[0] || null);
    setDrawerClasses((classes as any[]) || []);
    const done = (progress || []).filter((p: any) => p.status === "done").length;
    const available = (progress || []).filter((p: any) => p.status === "available").length;
    const locked = (progress || []).filter((p: any) => p.status === "locked").length;
    setDrawerProgress({ done, available, locked });
    setDrawerLoading(false);
    await loadDrawerCerts(student.id);
  };

  const loadDrawerCerts = async (studentId: string) => {
    const { data } = await (supabase as any)
      .from("certificates")
      .select("id, certificate_number, level_name, language_name, issued_at")
      .eq("student_id", studentId)
      .order("issued_at", { ascending: false });
    setDrawerCerts(data || []);
  };

  const issueManualCert = async (studentId?: string) => {
    if (!studentId || !selectedStudent) return;
    setIssuingCert(true);
    try {
      const year = new Date().getFullYear();
      const rand = Math.floor(100000 + Math.random() * 900000);
      const certNumber = `SA-${year}-${rand}`;

      const { error: certError } = await (supabase as any).from("certificates").insert({
        student_id: studentId,
        student_name: selectedStudent.profile?.name || "Aluno",
        level_id: selectedStudent.levelId,
        language_id: selectedStudent.languageId,
        level_name: selectedStudent.level?.name || "—",
        language_name: selectedStudent.language?.name || "—",
        certificate_number: certNumber,
        issued_at: new Date().toISOString(),
      });

      if (certError) throw certError;
      toast({ title: "Certificado emitido com sucesso!" });
      await loadDrawerCerts(studentId);
    } catch {
      toast({ title: "Erro ao emitir certificado.", variant: "destructive" });
    } finally {
      setIssuingCert(false);
    }
  };

  // ── Dashboard ─────────────────────────────────────────────────────────────────
  const loadDashboard = async () => {
    setDashLoading(true);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const todayStr = now.toISOString().split("T")[0];

    const [
      { data: activeStuds }, { data: teacherCount }, { data: monthClasses },
      { data: recentClassData }, { data: studsWithLang }, { data: allLangs },
      { data: allLevels }, { data: recentStudData },
    ] = await Promise.all([
      supabase.from("students").select("id, language_id, level_id", { count: "exact" }).eq("status", "active"),
      supabase.from("teachers").select("id", { count: "exact" }),
      supabase.from("classes").select("id, student_id", { count: "exact" }).eq("status", "completed").gte("scheduled_at", monthStart),
      supabase.from("classes").select(`scheduled_at, step_id, students!classes_student_id_fkey(profiles!students_user_id_fkey(name)), teachers!classes_teacher_id_fkey(profiles!teachers_user_id_fkey(name)), steps!classes_step_id_fkey(number)`).eq("status", "completed").order("scheduled_at", { ascending: false }).limit(10),
      supabase.from("students").select("id, language_id, level_id, status").eq("status", "active"),
      supabase.from("languages").select("id, name").eq("active", true),
      supabase.from("levels").select("id, name, code, language_id"),
      supabase.from("students").select(`id, created_at, language_id, level_id, status, profiles!students_user_id_fkey(name)`).order("created_at", { ascending: false }).limit(5),
    ]);

    const { data: activeClasses7d } = await supabase.from("classes").select("student_id").eq("status", "completed").gte("scheduled_at", sevenDaysAgo);
    const activeSet = new Set((activeClasses7d || []).map((c: any) => c.student_id));
    const inactiveCount = (activeStuds || []).filter(s => !activeSet.has(s.id)).length;

    setMetrics({ activeStudents: activeStuds?.length || 0, totalTeachers: teacherCount?.length || 0, classesThisMonth: monthClasses?.length || 0, studentsInactive7d: inactiveCount });

    // lang dist
    const langMap: Record<string, number> = {};
    (studsWithLang || []).forEach((s: any) => { if (s.language_id) langMap[s.language_id] = (langMap[s.language_id] || 0) + 1; });
    const langDistArr: LanguageDist[] = (allLangs || []).map((l: any) => ({ id: l.id, name: l.name, count: langMap[l.id] || 0, color: LANG_COLORS[l.name] || "#6B7280" })).filter(l => l.count > 0);
    setLangDist(langDistArr);

    // level dist
    const levelMap: Record<string, number> = {};
    (studsWithLang || []).forEach((s: any) => { if (s.level_id) levelMap[s.level_id] = (levelMap[s.level_id] || 0) + 1; });
    const groupedByLang: Record<string, LevelDist> = {};
    (allLevels || []).forEach((lv: any) => {
      const lang = (allLangs || []).find((l: any) => l.id === lv.language_id);
      if (!lang) return;
      const cnt = levelMap[lv.id] || 0;
      if (cnt === 0) return;
      if (!groupedByLang[lang.id]) groupedByLang[lang.id] = { languageName: lang.name, levels: [] };
      groupedByLang[lang.id].levels.push({ code: lv.code, name: lv.name, count: cnt });
    });
    setLevelDist(Object.values(groupedByLang));

    // recent students
    if (recentStudData) {
      const langLookup = Object.fromEntries((allLangs || []).map((l: any) => [l.id, l.name]));
      const levelLookup = Object.fromEntries((allLevels || []).map((l: any) => [l.id, { name: l.name, code: l.code }]));
      const recent: StudentRow[] = (recentStudData as any[]).map(s => ({ id: s.id, status: s.status, currentStepNumber: 0, profile: s.profiles ? { name: s.profiles.name } : null, language: s.language_id ? { name: langLookup[s.language_id] || "—" } : null, level: s.level_id ? (levelLookup as any)[s.level_id] || null : null, teacherName: null, createdAt: s.created_at, languageId: s.language_id, levelId: s.level_id }));
      setRecentStudents(recent);
    }

    // recent classes
    if (recentClassData) {
      const classes: RecentClass[] = (recentClassData as any[]).map((c: any) => {
        const sp = c.students?.profiles; const studentName = Array.isArray(sp) ? sp[0]?.name : sp?.name || "—";
        const tp = c.teachers?.profiles; const teacherName = Array.isArray(tp) ? tp[0]?.name : tp?.name || "—";
        return { studentName, teacherName, stepNumber: c.steps?.number || 0, completedAt: c.scheduled_at };
      });
      setRecentClasses(classes);
    }

    // Engagement metrics
    try {
      const [
        { data: missionsData },
        { data: xpData },
        { data: streakData },
        { data: exercisesData },
      ] = await Promise.all([
        (supabase as any).from("daily_missions").select("id", { count: "exact" }).eq("completed", true).eq("date", todayStr),
        (supabase as any).from("xp_events").select("xp"),
        (supabase as any).from("student_gamification").select("streak_current"),
        (supabase as any).from("xp_events").select("id", { count: "exact" }).in("event_type", ["lesson_exercise", "stepbystep"]).gte("created_at", weekStart),
      ]);
      const xpTotal = (xpData || []).reduce((sum: number, e: any) => sum + (e.xp || 0), 0);
      const streakArr = streakData || [];
      const avgStreak = streakArr.length > 0 ? Math.round(streakArr.reduce((sum: number, s: any) => sum + (s.streak_current || 0), 0) / streakArr.length) : 0;
      setEngagement({ missionsToday: missionsData?.length || 0, xpTotal, avgStreak, exercisesWeek: exercisesData?.length || 0 });
    } catch (_) {}

    // Weekly classes chart (last 8 weeks)
    try {
      const { data: allClasses } = await supabase.from("classes").select("scheduled_at").eq("status", "completed").gte("scheduled_at", new Date(Date.now() - 56 * 24 * 60 * 60 * 1000).toISOString());
      const weeks: { week: string; aulas: number }[] = [];
      for (let i = 7; i >= 0; i--) {
        const wStart = new Date(Date.now() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
        const wEnd = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000);
        const count = (allClasses || []).filter((c: any) => {
          const d = new Date(c.scheduled_at);
          return d >= wStart && d < wEnd;
        }).length;
        const label = `${wStart.getDate()}/${wStart.getMonth() + 1}`;
        weeks.push({ week: label, aulas: count });
      }
      setWeeklyClasses(weeks);
    } catch (_) {}

    // Top 5 students by XP
    try {
      const { data: topStudents } = await (supabase as any).from("student_gamification")
        .select("xp_total, student_id, students!student_gamification_student_id_fkey(profiles!students_user_id_fkey(name))")
        .order("xp_total", { ascending: false })
        .limit(5);
      const top = (topStudents || []).map((s: any) => {
        const p = s.students?.profiles;
        const name = Array.isArray(p) ? p[0]?.name || "—" : p?.name || "—";
        return { name, xp: s.xp_total || 0 };
      });
      setTopXpStudents(top);
    } catch (_) {}

    setDashLoading(false);
  };

  // ── Teachers ──────────────────────────────────────────────────────────────────
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
        return { id: t.id, userId: t.user_id, name, languages: langs, studentCount: t.teacher_students?.length || 0 };
      });
      setTeachers(rows);
    }
    setTeachersLoading(false);
  };

  // ── Groups ────────────────────────────────────────────────────────────────────
  const loadGroups = async () => {
    setGroupsLoading(true);
    const { data } = await (supabase as any).from("groups").select(`
      id, name, meet_link, active, created_at,
      languages!groups_language_id_fkey(name),
      levels!groups_level_id_fkey(name, code),
      group_students(student_id)
    `).order("created_at", { ascending: false });
    setGroups(data || []);
    setGroupsLoading(false);
  };

  const loadGroupStudents = async (groupId: string) => {
    const { data } = await (supabase as any).from("group_students").select(`
      id, student_id, joined_at,
      students!group_students_student_id_fkey(profiles!students_user_id_fkey(name))
    `).eq("group_id", groupId);
    setGroupStudents(data || []);
  };

  // ── Materials ─────────────────────────────────────────────────────────────────
  const loadMaterials = async () => {
    setMaterialsLoading(true);
    const { data } = await supabase.from("materials").select(`
      id, title, type, delivery, file_url, filename, active, created_at, level_id,
      levels!materials_level_id_fkey(name, code, language_id)
    `).order("created_at", { ascending: false });
    setMaterials(data || []);
    setMaterialsLoading(false);
  };

  // ── Vocabulary ────────────────────────────────────────────────────────────────
  const loadVocabulary = async () => {
    setVocabLoading(true);
    const { data } = await (supabase as any).from("vocabulary")
      .select("id, word, translation, example_sentence, part_of_speech, difficulty, level_id, unit_id, active, created_at, levels!vocabulary_level_id_fkey(name, code, language_id)")
      .order("created_at", { ascending: false });
    setVocabWords(data || []);
    setVocabLoading(false);
  };

  // ── Exercises ─────────────────────────────────────────────────────────────────
  const loadExercises = async () => {
    setExercisesLoading(true);
    const { data } = await (supabase as any).from("lesson_exercises")
      .select("id, type, question, answer, order_index, active, step_id, steps!lesson_exercises_step_id_fkey(number, title, units!steps_unit_id_fkey(level_id, number, levels!units_level_id_fkey(name, code, language_id)))")
      .order("order_index", { ascending: true });
    setExercises(data || []);
    setExercisesLoading(false);
  };

  const loadAllSteps = async () => {
    const { data } = await supabase.from("steps").select(`id, number, title, units!steps_unit_id_fkey(level_id, levels!units_level_id_fkey(name, code))`).order("number", { ascending: true });
    setAllSteps((data as any[]) || []);
  };

  // ── Notifications ─────────────────────────────────────────────────────────────
  const loadNotificationSettings = async () => {
    setNotifLoading(true);
    const { data } = await (supabase as any).from("notification_settings").select("*").order("type");
    setNotifSettings(data || []);
    setNotifLoading(false);
  };

  const loadNotifLog = async () => {
    const { data } = await (supabase as any).from("notification_log")
      .select("id, type, title, body, sent_at, delivered, opened, student_id, students!notification_log_student_id_fkey(profiles!students_user_id_fkey(name))")
      .order("sent_at", { ascending: false }).limit(50);
    setNotifLog(data || []);
  };

  // ── Admins ────────────────────────────────────────────────────────────────────
  const loadAdmins = async () => {
    const { data } = await supabase.from("profiles").select("id, name, phone").eq("role", "admin");
    setAdmins(data || []);
  };

  const loadPayments = async () => {
    const { data: paysData } = await (supabase as any)
      .from("payments")
      .select("id, lead_name, lead_email, lead_language, plan_id, amount_cents, status, payment_method, created_at, paid_at, student_id")
      .order("created_at", { ascending: false })
      .limit(100);

    const { data: plansData } = await (supabase as any)
      .from("payment_plans")
      .select("id, name");

    const pm: Record<string, string> = {};
    (plansData || []).forEach((p: any) => { pm[p.id] = p.name; });
    setPlansMap(pm);
    setPayments(paysData || []);
  };

  const markAsPaid = async (paymentId: string) => {
    setMarkingPaid(paymentId);
    try {
      await (supabase as any)
        .from("payments")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", paymentId);
      toast({ title: "Pagamento marcado como pago!" });
      setPayments(prev => prev.map(p => p.id === paymentId ? { ...p, status: "paid", paid_at: new Date().toISOString() } : p));
    } catch {
      toast({ title: "Erro ao atualizar pagamento.", variant: "destructive" });
    } finally {
      setMarkingPaid(null);
    }
  };

  // ── Actions ───────────────────────────────────────────────────────────────────

  // PRESERVE ORIGINAL - não alterar
  const handleCreateStudent = async () => {
    if (!newName || !newEmail || !newLangId || !newLevelId) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" }); return;
    }
    setCreatingStudent(true); setTempPassword(null);
    const { data, error } = await supabase.functions.invoke("create-student", {
      body: { name: newName, email: newEmail, phone: newPhone || null, language_id: newLangId, level_id: newLevelId },
    });
    if (error || !data?.success) {
      toast({ title: "Erro ao criar aluno", description: data?.error || error?.message || "Tente novamente.", variant: "destructive" });
      setCreatingStudent(false); return;
    }
    if (data.temp_password) setTempPassword(data.temp_password);
    toast({ title: "Aluno criado com sucesso!" });
    setNewName(""); setNewEmail(""); setNewPhone(""); setNewLangId(""); setNewLevelId("");
    setCreatingStudent(false); loadStudents(); loadDashboard();
  };

  // PRESERVE ORIGINAL - não alterar
  const handleUploadMaterial = async () => {
    if (!matTitle || !matFile || !matLangId || !matLevelId) {
      toast({ title: "Preencha todos os campos", variant: "destructive" }); return;
    }
    setUploading(true);
    const fileExt = matFile.name.split(".").pop();
    const filePath = `${matLangId}/${matLevelId}/${Date.now()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from("materials").upload(filePath, matFile);
    if (uploadError) {
      toast({ title: "Erro no upload", description: uploadError.message, variant: "destructive" });
      setUploading(false); return;
    }
    const { data: urlData } = supabase.storage.from("materials").getPublicUrl(filePath);
    await supabase.from("materials").insert([{
      title: matTitle, type: matType, delivery: matDelivery,
      level_id: matLevelId, file_url: urlData.publicUrl, filename: matFile.name,
    }]);
    toast({ title: "Material enviado com sucesso!" });
    setShowUpload(false); setMatTitle(""); setMatFile(null); setUploading(false);
  };

  const handleLinkStudent = async () => {
    if (!linkTeacherId || !linkStudentId) return;
    setLinking(true);
    const { error } = await supabase.from("teacher_students").insert({ teacher_id: linkTeacherId, student_id: linkStudentId });
    if (error) { toast({ title: "Erro ao vincular aluno", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Aluno vinculado com sucesso!" }); setLinkTeacherId(null); setLinkStudentId(""); loadTeachers(); }
    setLinking(false);
  };

  const handleCreateGroup = async () => {
    if (!grpName || !grpLangId || !grpLevelId) { toast({ title: "Preencha nome, idioma e nível", variant: "destructive" }); return; }
    setCreatingGroup(true);
    await (supabase as any).from("groups").insert({ name: grpName, language_id: grpLangId, level_id: grpLevelId, meet_link: grpMeetLink || null });
    toast({ title: "Turma criada!" });
    setShowNewGroup(false); setGrpName(""); setGrpLangId(""); setGrpLevelId(""); setGrpMeetLink("");
    setCreatingGroup(false); loadGroups();
  };

  const handleAddStudentToGroup = async () => {
    if (!selectedGroup || !addStudentToGroupId) return;
    setAddingToGroup(true);
    const { error } = await (supabase as any).from("group_students").insert({ group_id: selectedGroup.id, student_id: addStudentToGroupId });
    if (error) { toast({ title: "Erro ao adicionar aluno", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Aluno adicionado à turma!" }); setAddStudentToGroupId(""); loadGroupStudents(selectedGroup.id); loadGroups(); }
    setAddingToGroup(false);
  };

  const handleRemoveStudentFromGroup = async (groupStudentId: string) => {
    await (supabase as any).from("group_students").delete().eq("id", groupStudentId);
    toast({ title: "Aluno removido da turma." });
    if (selectedGroup) loadGroupStudents(selectedGroup.id);
    loadGroups();
  };

  const handleSaveVocab = async () => {
    if (!newWord || !newTranslation || !newVocabLevelId) {
      toast({ title: "Preencha palavra, tradução e nível", variant: "destructive" }); return;
    }
    setSavingVocab(true);
    await (supabase as any).from("vocabulary").insert({
      word: newWord, translation: newTranslation, example_sentence: newExample || null,
      part_of_speech: newPartOfSpeech || null, difficulty: parseInt(newDifficulty),
      level_id: newVocabLevelId, active: true,
    });
    toast({ title: "Palavra adicionada!" });
    setShowNewVocab(false);
    setNewWord(""); setNewTranslation(""); setNewExample(""); setNewPartOfSpeech(""); setNewDifficulty("1"); setNewVocabLevelId(""); setNewVocabLangId("");
    setSavingVocab(false);
    loadVocabulary();
  };

  const handleDeleteVocab = async (id: string) => {
    await (supabase as any).from("vocabulary").update({ active: false }).eq("id", id);
    toast({ title: "Palavra desativada." });
    loadVocabulary();
  };

  const handleImportVocabCSV = async (file: File) => {
    const text = await file.text();
    const lines = text.split("\n").filter(l => l.trim());
    const rows = lines.slice(1).map(l => {
      const [word, translation, example_sentence, part_of_speech, difficulty, level_code] = l.split(",").map(s => s.trim());
      const level = levels.find(lv => lv.code === level_code);
      if (!level) return null;
      return { word, translation, example_sentence: example_sentence || null, part_of_speech: part_of_speech || null, difficulty: parseInt(difficulty) || 1, level_id: level.id, active: true };
    }).filter(Boolean);
    if (rows.length === 0) { toast({ title: "Nenhuma linha válida encontrada.", variant: "destructive" }); return; }
    await (supabase as any).from("vocabulary").insert(rows);
    toast({ title: `${rows.length} palavras importadas!` });
    loadVocabulary();
  };

  const handleSaveExercise = async () => {
    if (!newExQuestion || !newExStepId || !newExType) {
      toast({ title: "Preencha tipo, passo e questão", variant: "destructive" }); return;
    }
    setSavingExercise(true);
    let options = null;
    let answer = newExAnswer;
    if (newExType === "association") {
      options = assocPairs.filter(p => p.left && p.right);
      answer = options.map((p, i) => `${String.fromCharCode(65 + i)}→${i + 1}`).join(", ");
    }
    await (supabase as any).from("lesson_exercises").insert({
      type: newExType, step_id: newExStepId, question: newExQuestion,
      answer: answer || null, explanation: newExExplanation || null,
      options: options, order_index: parseInt(newExOrderIndex) || 0, active: true,
    });
    toast({ title: "Exercício criado!" });
    setShowNewExercise(false);
    setNewExType("fill_blank"); setNewExStepId(""); setNewExQuestion(""); setNewExAnswer(""); setNewExExplanation(""); setNewExOrderIndex("0");
    setAssocPairs([{ left: "", right: "" }, { left: "", right: "" }]);
    setSavingExercise(false);
    loadExercises();
  };

  const handleDeleteExercise = async (id: string) => {
    await (supabase as any).from("lesson_exercises").update({ active: false }).eq("id", id);
    toast({ title: "Exercício desativado." });
    loadExercises();
  };

  const handleSaveNotifSetting = async (setting: any, updates: any) => {
    setSavingNotif(setting.id);
    await (supabase as any).from("notification_settings").update(updates).eq("id", setting.id);
    toast({ title: "Configuração salva!" });
    setSavingNotif(null);
    loadNotificationSettings();
  };

  const handleExportCSV = () => {
    const csv = "Nome,Idioma,Nível,Passo\n" + filteredStudents.map(s => `${s.profile?.name},${s.language?.name},${s.level?.code},${s.currentStepNumber}`).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "alunos.csv"; a.click();
  };

  if (profile?.role !== "admin") return <Navigate to="/" replace />;

  const filteredLevels = (langId: string) => levels.filter(l => l.language_id === langId);
  const firstName = profile?.name?.split(" ")[0] || "Admin";

  const filteredStudents = students.filter(s => {
    const matchSearch = !studentSearch || s.profile?.name?.toLowerCase().includes(studentSearch.toLowerCase());
    const matchLang = studentFilterLang === "all" || s.languageId === studentFilterLang;
    const matchLevel = studentFilterLevel === "all" || s.levelId === studentFilterLevel;
    const matchStatus = studentFilterStatus === "all" || s.status === studentFilterStatus;
    return matchSearch && matchLang && matchLevel && matchStatus;
  });

  const filteredMaterials = materials.filter(m => {
    const matchLang = matFilterLang === "all" || (m.levels as any)?.language_id === matFilterLang;
    const matchLevel = matFilterLevel === "all" || m.level_id === matFilterLevel;
    return matchLang && matchLevel;
  });

  const filteredVocab = vocabWords.filter(v => {
    const matchLang = vocabFilterLang === "all" || (v.levels as any)?.language_id === vocabFilterLang;
    const matchLevel = vocabFilterLevel === "all" || v.level_id === vocabFilterLevel;
    return matchLang && matchLevel;
  });

  const filteredExercises = exercises.filter(ex => {
    const step = ex.steps;
    const levelId = step?.units?.level_id;
    const matchLevel = exerciseFilterLevel === "all" || levelId === exerciseFilterLevel;
    const matchStep = exerciseFilterStep === "all" || ex.step_id === exerciseFilterStep;
    return matchLevel && matchStep;
  });

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-background border-b">
        <img src="/brand/logo-reto-darkpurple.svg" alt="steps academy" className="h-7" />
        <div className="flex items-center gap-3">
          <span className="text-sm font-light text-muted-foreground hidden sm:block">{firstName} · Admin</span>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="px-4 py-4 md:px-8 lg:px-10 max-w-7xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Mobile: horizontal scrollable tab bar */}
          <TabsList className="lg:hidden w-full mb-4 flex overflow-x-auto gap-1 h-auto p-1 justify-start">
            <TabsTrigger value="overview" className="shrink-0 text-xs px-3 py-1.5">Visão Geral</TabsTrigger>
            <TabsTrigger value="students" className="shrink-0 text-xs px-3 py-1.5">Alunos</TabsTrigger>
            <TabsTrigger value="teachers" className="shrink-0 text-xs px-3 py-1.5">Professores</TabsTrigger>
            <TabsTrigger value="groups" className="shrink-0 text-xs px-3 py-1.5">Turmas</TabsTrigger>
            <TabsTrigger value="content" className="shrink-0 text-xs px-3 py-1.5">Conteúdo</TabsTrigger>
            <TabsTrigger value="notifications" className="shrink-0 text-xs px-3 py-1.5">Notificações</TabsTrigger>
            <TabsTrigger value="settings" className="shrink-0 text-xs px-3 py-1.5">Config</TabsTrigger>
            <TabsTrigger value="payments" className="shrink-0 text-xs px-3 py-1.5">Pagamentos</TabsTrigger>
          </TabsList>

          {/* Desktop: sidebar + content */}
          <div className="lg:flex lg:gap-8">
            {/* Desktop sidebar nav */}
            <aside className="hidden lg:flex flex-col w-44 shrink-0 border-r pr-4 pt-1">
              <nav className="space-y-0.5 sticky top-20">
                {[
                  { value: "overview", label: "Visão Geral", icon: LayoutGrid },
                  { value: "students", label: "Alunos", icon: Users },
                  { value: "teachers", label: "Professores", icon: GraduationCap },
                  { value: "groups", label: "Turmas", icon: BookOpen },
                  { value: "content", label: "Conteúdo", icon: FileText },
                  { value: "notifications", label: "Notificações", icon: Bell },
                  { value: "payments", label: "Pagamentos", icon: CreditCard },
                  { value: "settings", label: "Config", icon: Settings },
                ].map(item => (
                  <button
                    key={item.value}
                    onClick={() => setActiveTab(item.value)}
                    className={cn(
                      "flex items-center gap-2.5 text-sm px-3 py-2 rounded-md w-full text-left transition-colors",
                      activeTab === item.value
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </button>
                ))}
              </nav>
            </aside>

            {/* Tab content */}
            <div className="flex-1 min-w-0">

          {/* ── Tab: Visão Geral ─────────────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-5">

            {/* Metric cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {dashLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />) : (
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

            {/* Engagement row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {dashLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />) : (
                <>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <BookCheck className="h-4 w-4 text-[#C1FE00]" />
                        <span className="text-xs text-muted-foreground font-light">Missões hoje</span>
                      </div>
                      <p className="text-2xl font-bold">{engagement?.missionsToday ?? 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Zap className="h-4 w-4 text-yellow-500" />
                        <span className="text-xs text-muted-foreground font-light">XP total</span>
                      </div>
                      <p className="text-2xl font-bold">{(engagement?.xpTotal ?? 0).toLocaleString("pt-BR")}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Flame className="h-4 w-4 text-orange-500" />
                        <span className="text-xs text-muted-foreground font-light">Média streak</span>
                      </div>
                      <p className="text-2xl font-bold">{engagement?.avgStreak ?? 0}d</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <BookOpen className="h-4 w-4 text-primary" />
                        <span className="text-xs text-muted-foreground font-light">Exercícios (7d)</span>
                      </div>
                      <p className="text-2xl font-bold">{engagement?.exercisesWeek ?? 0}</p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* Charts row 1: weekly classes + top XP */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold">Aulas por semana (últimas 8 semanas)</CardTitle>
                </CardHeader>
                <CardContent>
                  {dashLoading ? <Skeleton className="h-40 w-full" /> : (
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={weeklyClasses} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="aulas" fill="#520A70" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {!dashLoading && topXpStudents.length > 0 ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold">Top 5 alunos por XP</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart layout="vertical" data={topXpStudents} margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                        <Tooltip />
                        <Bar dataKey="xp" fill="#C1FE00" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              ) : <div />}
            </div>

            {/* Charts row 2: language dist + level dist */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold">Alunos por idioma</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {dashLoading ? <Skeleton className="h-20 w-full" /> : langDist.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhum dado disponível.</p>
                  ) : langDist.map(l => (
                    <div key={l.id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-bold" style={{ color: l.color }}>{l.name}</span>
                        <span className="text-muted-foreground">{l.count} aluno{l.count !== 1 ? "s" : ""}</span>
                      </div>
                      <Progress value={(l.count / (metrics?.activeStudents || 1)) * 100} className="h-2" style={{ "--progress-foreground": l.color } as React.CSSProperties} />
                    </div>
                  ))}
                </CardContent>
              </Card>

              {!dashLoading && levelDist.length > 0 ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold">Distribuição por nível</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {levelDist.map(group => (
                      <div key={group.languageName}>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">{group.languageName}</p>
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
              ) : <div />}
            </div>

            {/* Bottom row: recent activity + recent students */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold">Atividade recente</CardTitle>
                </CardHeader>
                <CardContent>
                  {dashLoading ? <Skeleton className="h-32 w-full" /> : recentClasses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                      <CalendarCheck className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-xs">Nenhuma aula recente.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recentClasses.map((c, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                          <div>
                            <span className="font-medium">{c.studentName}</span>
                            <span className="text-muted-foreground"> · {c.teacherName}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span>Passo {c.stepNumber}</span>
                            <span>{formatDate(c.completedAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold">Alunos recentes</CardTitle>
                </CardHeader>
                <CardContent>
                  {dashLoading ? <Skeleton className="h-24 w-full" /> : recentStudents.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhum aluno recente.</p>
                  ) : (
                    <div className="space-y-2">
                      {recentStudents.map(s => (
                        <div key={s.id} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                          <span className="font-medium">{s.profile?.name || "—"}</span>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span>{s.language?.name}</span>
                            <span>{s.level?.code}</span>
                            <span>{formatDate(s.createdAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>{/* end bottom row grid */}
          </TabsContent>

          {/* ── Tab: Alunos ──────────────────────────────────────────────────── */}
          <TabsContent value="students" className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar por nome..." className="pl-8" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} />
                </div>
                <Button variant="outline" size="sm" onClick={handleExportCSV}>
                  <Download className="h-4 w-4" />
                </Button>
                <Dialog open={showNewStudent} onOpenChange={setShowNewStudent}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-primary text-white">
                      <Plus className="h-4 w-4 mr-1" />Novo
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Novo aluno</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>Nome *</Label>
                        <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome completo" />
                      </div>
                      <div>
                        <Label>E-mail *</Label>
                        <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" placeholder="email@exemplo.com" />
                      </div>
                      <div>
                        <Label>Telefone</Label>
                        <Input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="(11) 99999-9999" />
                      </div>
                      <div>
                        <Label>Idioma *</Label>
                        <Select value={newLangId} onValueChange={v => { setNewLangId(v); setNewLevelId(""); }}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>{languages.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Nível *</Label>
                        <Select value={newLevelId} onValueChange={setNewLevelId} disabled={!newLangId}>
                          <SelectTrigger><SelectValue placeholder="Selecione o idioma primeiro" /></SelectTrigger>
                          <SelectContent>{filteredLevels(newLangId).map(l => <SelectItem key={l.id} value={l.id}>{l.name} ({l.code})</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      {tempPassword && (
                        <div className="bg-lime-50 border border-lime-200 rounded-lg p-3 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-bold text-lime-700">Senha temporária</p>
                            <p className="text-sm font-mono font-bold">{tempPassword}</p>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(tempPassword); toast({ title: "Copiado!" }); }}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      <Button onClick={handleCreateStudent} disabled={creatingStudent} className="w-full bg-primary text-white">
                        {creatingStudent ? "Criando..." : "Criar aluno"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Select value={studentFilterLang} onValueChange={v => { setStudentFilterLang(v); setStudentFilterLevel("all"); }}>
                  <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Idioma" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos idiomas</SelectItem>
                    {languages.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={studentFilterLevel} onValueChange={setStudentFilterLevel}>
                  <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Nível" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos níveis</SelectItem>
                    {(studentFilterLang === "all" ? levels : filteredLevels(studentFilterLang)).map(l => <SelectItem key={l.id} value={l.id}>{l.code}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={studentFilterStatus} onValueChange={setStudentFilterStatus}>
                  <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos status</SelectItem>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="paused">Pausado</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Student list */}
            {studentsLoading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
            ) : filteredStudents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Users className="h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm">Nenhum aluno encontrado.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredStudents.map(s => (
                  <Card key={s.id} className="cursor-pointer hover:shadow-sm transition-shadow" onClick={() => openStudentDrawer(s)}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{s.profile?.name || "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.language?.name} · {s.level?.code} · Passo {s.currentStepNumber}
                          </p>
                          {s.teacherName && <p className="text-xs text-muted-foreground">Prof: {s.teacherName}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={s.status === "active" ? "default" : "secondary"} className={s.status === "active" ? "bg-[#C1FE00] text-[#1D1D1B] text-[10px]" : "text-[10px]"}>
                            {s.status === "active" ? "ativo" : s.status}
                          </Badge>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Student Drawer */}
            <Sheet open={studentDrawerOpen} onOpenChange={setStudentDrawerOpen}>
              <SheetContent className="w-full sm:max-w-lg lg:max-w-2xl overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>{selectedStudent?.profile?.name || "Aluno"}</SheetTitle>
                </SheetHeader>
                {drawerLoading ? (
                  <div className="space-y-3 mt-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                ) : selectedStudent && (
                  <div className="space-y-4 mt-4">
                    {/* Basic info */}
                    <Card>
                      <CardContent className="p-3 space-y-1 text-xs">
                        <div className="flex justify-between"><span className="text-muted-foreground">Idioma</span><span>{selectedStudent.language?.name || "—"}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Nível</span><span>{selectedStudent.level?.code} — {selectedStudent.level?.name}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Passo atual</span><span>{selectedStudent.currentStepNumber}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Status</span>
                          <Badge variant={selectedStudent.status === "active" ? "default" : "secondary"} className={selectedStudent.status === "active" ? "bg-[#C1FE00] text-[#1D1D1B] text-[10px]" : "text-[10px]"}>
                            {selectedStudent.status}
                          </Badge>
                        </div>
                        {selectedStudent.teacherName && <div className="flex justify-between"><span className="text-muted-foreground">Professor</span><span>{selectedStudent.teacherName}</span></div>}
                        <div className="flex justify-between"><span className="text-muted-foreground">Cadastro</span><span>{formatDate(selectedStudent.createdAt)}</span></div>
                      </CardContent>
                    </Card>

                    {/* Gamification */}
                    {drawerGamification && (
                      <Card>
                        <CardHeader className="pb-1 pt-3 px-3">
                          <CardTitle className="text-xs font-bold">Gamificação</CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-muted rounded p-2 text-center">
                            <p className="text-muted-foreground">XP total</p>
                            <p className="font-bold text-lg">{drawerGamification.xp_total}</p>
                          </div>
                          <div className="bg-muted rounded p-2 text-center">
                            <p className="text-muted-foreground">Moedas</p>
                            <p className="font-bold text-lg">{drawerGamification.coins}</p>
                          </div>
                          <div className="bg-muted rounded p-2 text-center">
                            <p className="text-muted-foreground">Streak atual</p>
                            <p className="font-bold text-lg">{drawerGamification.streak_current}d</p>
                          </div>
                          <div className="bg-muted rounded p-2 text-center">
                            <p className="text-muted-foreground">Melhor streak</p>
                            <p className="font-bold text-lg">{drawerGamification.streak_best}d</p>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Placement test */}
                    {drawerPlacement && (
                      <Card>
                        <CardHeader className="pb-1 pt-3 px-3">
                          <CardTitle className="text-xs font-bold">Nivelamento</CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 text-xs space-y-1">
                          <div className="flex justify-between"><span className="text-muted-foreground">Tipo</span><span>{drawerPlacement.test_type}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Nível atribuído</span><span>{drawerPlacement.assigned_level || "—"}</span></div>
                          {drawerPlacement.notes && <p className="text-muted-foreground italic mt-1">{drawerPlacement.notes}</p>}
                          {drawerPlacement.completed_at && <div className="flex justify-between"><span className="text-muted-foreground">Data</span><span>{formatDate(drawerPlacement.completed_at)}</span></div>}
                        </CardContent>
                      </Card>
                    )}

                    {/* Progress */}
                    <Card>
                      <CardHeader className="pb-1 pt-3 px-3">
                        <CardTitle className="text-xs font-bold">Progresso nos passos</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0 grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-green-50 rounded p-2 text-center">
                          <p className="text-muted-foreground">Concluídos</p>
                          <p className="font-bold text-lg text-green-600">{drawerProgress.done}</p>
                        </div>
                        <div className="bg-blue-50 rounded p-2 text-center">
                          <p className="text-muted-foreground">Disponíveis</p>
                          <p className="font-bold text-lg text-blue-600">{drawerProgress.available}</p>
                        </div>
                        <div className="bg-muted rounded p-2 text-center">
                          <p className="text-muted-foreground">Bloqueados</p>
                          <p className="font-bold text-lg">{drawerProgress.locked}</p>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Recent classes */}
                    {drawerClasses.length > 0 && (
                      <Card>
                        <CardHeader className="pb-1 pt-3 px-3">
                          <CardTitle className="text-xs font-bold">Últimas aulas</CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 space-y-1">
                          {(drawerClasses as any[]).map((c: any, i: number) => (
                            <div key={i} className="flex justify-between text-xs py-1 border-b last:border-0">
                              <span>Passo {c.steps?.number || "—"}</span>
                              <span className="text-muted-foreground">{formatDate(c.scheduled_at)}</span>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}
                    {/* Certificados do aluno */}
                    <div className="space-y-3 pt-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Certificados</p>
                      {drawerCerts.length === 0 ? (
                        <p className="text-xs text-muted-foreground font-light">Nenhum certificado emitido.</p>
                      ) : (
                        drawerCerts.map(c => (
                          <div key={c.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border">
                            <div>
                              <p className="text-xs font-bold">{c.language_name} · {c.level_name}</p>
                              <p className="text-[10px] text-muted-foreground">{new Date(c.issued_at).toLocaleDateString("pt-BR")}</p>
                            </div>
                            <a href={`/certificado/${c.id}`} target="_blank" className="text-xs text-primary font-bold hover:underline">Ver</a>
                          </div>
                        ))
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs gap-1.5"
                        disabled={issuingCert}
                        onClick={() => issueManualCert(selectedStudent?.id)}
                      >
                        <GraduationCap className="h-3.5 w-3.5" />
                        {issuingCert ? "Emitindo..." : "Emitir certificado manualmente"}
                      </Button>
                    </div>
                  </div>
                )}
              </SheetContent>
            </Sheet>
          </TabsContent>

          {/* ── Tab: Professores ──────────────────────────────────────────────── */}
          <TabsContent value="teachers" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{teachers.length} professor{teachers.length !== 1 ? "es" : ""}</p>
              <Button variant="outline" size="sm" onClick={() => navigate("/nivelamento")}>
                <Globe className="h-4 w-4 mr-1" />Nivelamento
              </Button>
            </div>

            {teachersLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
            ) : teachers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <GraduationCap className="h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm">Nenhum professor cadastrado.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {teachers.map(t => (
                  <Card key={t.id}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium">{t.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t.languages.join(", ") || "Sem idiomas"} · {t.studentCount} aluno{t.studentCount !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setLinkTeacherId(t.id)}>
                          <Link2 className="h-3 w-3 mr-1" />Vincular
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Link student dialog */}
            <Dialog open={!!linkTeacherId} onOpenChange={open => { if (!open) setLinkTeacherId(null); }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Vincular aluno ao professor</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Selecione o aluno</Label>
                    <Select value={linkStudentId} onValueChange={setLinkStudentId}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {students.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.profile?.name || s.id}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleLinkStudent} disabled={linking || !linkStudentId} className="w-full bg-primary text-white">
                    {linking ? "Vinculando..." : "Vincular"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* ── Tab: Turmas ───────────────────────────────────────────────────── */}
          <TabsContent value="groups" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{groups.length} turma{groups.length !== 1 ? "s" : ""}</p>
              <Dialog open={showNewGroup} onOpenChange={setShowNewGroup}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-primary text-white">
                    <Plus className="h-4 w-4 mr-1" />Nova turma
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nova turma</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Nome *</Label>
                      <Input value={grpName} onChange={e => setGrpName(e.target.value)} placeholder="Ex: Inglês A1 - Manhã" />
                    </div>
                    <div>
                      <Label>Idioma *</Label>
                      <Select value={grpLangId} onValueChange={v => { setGrpLangId(v); setGrpLevelId(""); }}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{languages.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Nível *</Label>
                      <Select value={grpLevelId} onValueChange={setGrpLevelId} disabled={!grpLangId}>
                        <SelectTrigger><SelectValue placeholder="Selecione o idioma primeiro" /></SelectTrigger>
                        <SelectContent>{filteredLevels(grpLangId).map(l => <SelectItem key={l.id} value={l.id}>{l.name} ({l.code})</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Link do Meet</Label>
                      <Input value={grpMeetLink} onChange={e => setGrpMeetLink(e.target.value)} placeholder="https://meet.google.com/..." />
                    </div>
                    <Button onClick={handleCreateGroup} disabled={creatingGroup} className="w-full bg-primary text-white">
                      {creatingGroup ? "Criando..." : "Criar turma"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {groupsLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
            ) : groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <LayoutGrid className="h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm">Nenhuma turma cadastrada.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {groups.map(g => (
                  <div key={g.id}>
                    <Card className={`cursor-pointer hover:shadow-sm transition-shadow ${selectedGroup?.id === g.id ? "border-primary" : ""}`}
                      onClick={() => {
                        if (selectedGroup?.id === g.id) { setSelectedGroup(null); setGroupStudents([]); }
                        else { setSelectedGroup(g); loadGroupStudents(g.id); }
                      }}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{g.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {g.languages?.name} · {g.levels?.code} · {g.group_students?.length || 0} aluno{g.group_students?.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={g.active ? "default" : "secondary"} className={g.active ? "bg-[#C1FE00] text-[#1D1D1B] text-[10px]" : "text-[10px]"}>
                              {g.active ? "ativa" : "inativa"}
                            </Badge>
                            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${selectedGroup?.id === g.id ? "rotate-90" : ""}`} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {selectedGroup?.id === g.id && (
                      <Card className="mt-1 border-primary/20 bg-primary/5">
                        <CardContent className="p-3 space-y-3">
                          {g.meet_link && (
                            <a href={g.meet_link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline flex items-center gap-1">
                              <Globe className="h-3 w-3" />Link do Meet
                            </a>
                          )}
                          <div>
                            <p className="text-xs font-bold mb-2">Alunos na turma</p>
                            {groupStudents.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Nenhum aluno nesta turma.</p>
                            ) : (
                              <div className="space-y-1">
                                {groupStudents.map((gs: any) => {
                                  const p = gs.students?.profiles;
                                  const name = Array.isArray(p) ? p[0]?.name : p?.name || "—";
                                  return (
                                    <div key={gs.id} className="flex items-center justify-between text-xs bg-background rounded px-2 py-1">
                                      <span>{name}</span>
                                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleRemoveStudentFromGroup(gs.id)}>
                                        <Trash2 className="h-3 w-3 text-destructive" />
                                      </Button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Select value={addStudentToGroupId} onValueChange={setAddStudentToGroupId}>
                              <SelectTrigger className="flex-1 h-8 text-xs"><SelectValue placeholder="Adicionar aluno" /></SelectTrigger>
                              <SelectContent>
                                {students.map(s => <SelectItem key={s.id} value={s.id}>{s.profile?.name || s.id}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Button size="sm" className="h-8 bg-primary text-white" onClick={handleAddStudentToGroup} disabled={addingToGroup || !addStudentToGroupId}>
                              <UserPlus className="h-3 w-3" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Tab: Conteúdo ─────────────────────────────────────────────────── */}
          <TabsContent value="content" className="space-y-4">
            <Tabs defaultValue="materials">
              <TabsList className="w-full flex overflow-x-auto gap-1 h-auto p-1" style={{ justifyContent: "flex-start" }}>
                <TabsTrigger value="materials" className="shrink-0 text-xs px-3 py-1.5">Materiais</TabsTrigger>
                <TabsTrigger value="vocabulary" className="shrink-0 text-xs px-3 py-1.5">Vocabulário</TabsTrigger>
                <TabsTrigger value="exercises" className="shrink-0 text-xs px-3 py-1.5">Exercícios da Aula</TabsTrigger>
              </TabsList>

              {/* Sub-tab: Materiais */}
              <TabsContent value="materials" className="space-y-3 mt-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={matFilterLang} onValueChange={v => { setMatFilterLang(v); setMatFilterLevel("all"); }}>
                    <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Idioma" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos idiomas</SelectItem>
                      {languages.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={matFilterLevel} onValueChange={setMatFilterLevel}>
                    <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Nível" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos níveis</SelectItem>
                      {(matFilterLang === "all" ? levels : filteredLevels(matFilterLang)).map(l => <SelectItem key={l.id} value={l.id}>{l.code}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Dialog open={showUpload} onOpenChange={setShowUpload}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="h-8 bg-primary text-white ml-auto">
                        <Upload className="h-3 w-3 mr-1" />Upload
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Enviar material</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3">
                        <div>
                          <Label>Título *</Label>
                          <Input value={matTitle} onChange={e => setMatTitle(e.target.value)} placeholder="Nome do material" />
                        </div>
                        <div>
                          <Label>Idioma *</Label>
                          <Select value={matLangId} onValueChange={v => { setMatLangId(v); setMatLevelId(""); }}>
                            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>{languages.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Nível *</Label>
                          <Select value={matLevelId} onValueChange={setMatLevelId} disabled={!matLangId}>
                            <SelectTrigger><SelectValue placeholder="Selecione o idioma primeiro" /></SelectTrigger>
                            <SelectContent>{filteredLevels(matLangId).map(l => <SelectItem key={l.id} value={l.id}>{l.name} ({l.code})</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Tipo</Label>
                          <Select value={matType} onValueChange={setMatType}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="vocab">Vocabulário</SelectItem>
                              <SelectItem value="grammar">Gramática</SelectItem>
                              <SelectItem value="reading">Leitura</SelectItem>
                              <SelectItem value="listening">Listening</SelectItem>
                              <SelectItem value="other">Outro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Entrega</Label>
                          <Select value={matDelivery} onValueChange={setMatDelivery}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="before">Antes da aula</SelectItem>
                              <SelectItem value="after">Após a aula</SelectItem>
                              <SelectItem value="during">Durante a aula</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Arquivo *</Label>
                          <Input type="file" onChange={e => setMatFile(e.target.files?.[0] || null)} />
                        </div>
                        <Button onClick={handleUploadMaterial} disabled={uploading} className="w-full bg-primary text-white">
                          {uploading ? "Enviando..." : "Enviar"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                {materialsLoading ? (
                  <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}</div>
                ) : filteredMaterials.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <FileText className="h-10 w-10 mb-2 opacity-30" />
                    <p className="text-sm">Nenhum material encontrado.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredMaterials.map(m => (
                      <Card key={m.id}>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{m.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {m.type} · {m.delivery} · {(m.levels as any)?.code || "—"}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {m.file_url ? (
                                <a href={m.file_url} target="_blank" rel="noopener noreferrer">
                                  <Badge variant="default" className="bg-[#C1FE00] text-[#1D1D1B] text-[10px] cursor-pointer">✓ arquivo</Badge>
                                </a>
                              ) : (
                                <Badge variant="secondary" className="text-[10px]">sem arquivo</Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Sub-tab: Vocabulário */}
              <TabsContent value="vocabulary" className="space-y-3 mt-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={vocabFilterLang} onValueChange={v => { setVocabFilterLang(v); setVocabFilterLevel("all"); }}>
                    <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Idioma" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos idiomas</SelectItem>
                      {languages.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={vocabFilterLevel} onValueChange={setVocabFilterLevel}>
                    <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Nível" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos níveis</SelectItem>
                      {(vocabFilterLang === "all" ? levels : filteredLevels(vocabFilterLang)).map(l => <SelectItem key={l.id} value={l.id}>{l.code}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="ml-auto flex gap-2">
                    <Label htmlFor="import-csv" className="cursor-pointer">
                      <Button variant="outline" size="sm" className="h-8" asChild>
                        <span><Upload className="h-3 w-3 mr-1" />Importar CSV</span>
                      </Button>
                    </Label>
                    <input id="import-csv" type="file" accept=".csv" className="hidden" onChange={e => { if (e.target.files?.[0]) handleImportVocabCSV(e.target.files[0]); }} />
                    <Dialog open={showNewVocab} onOpenChange={setShowNewVocab}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="h-8 bg-primary text-white">
                          <Plus className="h-3 w-3 mr-1" />Nova palavra
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Nova palavra</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                          <div>
                            <Label>Idioma</Label>
                            <Select value={newVocabLangId} onValueChange={v => { setNewVocabLangId(v); setNewVocabLevelId(""); }}>
                              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                              <SelectContent>{languages.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Nível *</Label>
                            <Select value={newVocabLevelId} onValueChange={setNewVocabLevelId} disabled={!newVocabLangId}>
                              <SelectTrigger><SelectValue placeholder="Selecione o idioma primeiro" /></SelectTrigger>
                              <SelectContent>{filteredLevels(newVocabLangId).map(l => <SelectItem key={l.id} value={l.id}>{l.name} ({l.code})</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Palavra *</Label>
                            <Input value={newWord} onChange={e => setNewWord(e.target.value)} />
                          </div>
                          <div>
                            <Label>Tradução *</Label>
                            <Input value={newTranslation} onChange={e => setNewTranslation(e.target.value)} />
                          </div>
                          <div>
                            <Label>Exemplo</Label>
                            <Input value={newExample} onChange={e => setNewExample(e.target.value)} placeholder="Frase exemplo" />
                          </div>
                          <div>
                            <Label>Classe gramatical</Label>
                            <Input value={newPartOfSpeech} onChange={e => setNewPartOfSpeech(e.target.value)} placeholder="ex: substantivo, verbo..." />
                          </div>
                          <div>
                            <Label>Dificuldade</Label>
                            <Select value={newDifficulty} onValueChange={setNewDifficulty}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">1 — Fácil</SelectItem>
                                <SelectItem value="2">2 — Médio</SelectItem>
                                <SelectItem value="3">3 — Difícil</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button onClick={handleSaveVocab} disabled={savingVocab} className="w-full bg-primary text-white">
                            {savingVocab ? "Salvando..." : "Salvar"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">Formato CSV: palavra, tradução, exemplo, classe_gramatical, dificuldade(1-3), código_nível</p>

                {vocabLoading ? (
                  <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}</div>
                ) : filteredVocab.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <BookOpen className="h-10 w-10 mb-2 opacity-30" />
                    <p className="text-sm">Nenhuma palavra encontrada.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredVocab.map(v => (
                      <Card key={v.id}>
                        <CardContent className="p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{v.word}</span>
                                <span className="text-xs text-muted-foreground">→ {v.translation}</span>
                                <Badge variant="outline" className="text-[10px] shrink-0">{"⭐".repeat(v.difficulty || 1)}</Badge>
                              </div>
                              {v.example_sentence && <p className="text-xs text-muted-foreground truncate">{v.example_sentence}</p>}
                              <p className="text-[10px] text-muted-foreground">{(v.levels as any)?.code}</p>
                            </div>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => handleDeleteVocab(v.id)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Sub-tab: Exercícios da Aula */}
              <TabsContent value="exercises" className="space-y-3 mt-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={exerciseFilterLevel} onValueChange={setExerciseFilterLevel}>
                    <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Nível" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos níveis</SelectItem>
                      {levels.map(l => <SelectItem key={l.id} value={l.id}>{l.code}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Dialog open={showNewExercise} onOpenChange={setShowNewExercise}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="h-8 bg-primary text-white ml-auto">
                        <Plus className="h-3 w-3 mr-1" />Novo exercício
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[85vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Novo exercício</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3">
                        <div>
                          <Label>Tipo *</Label>
                          <Select value={newExType} onValueChange={setNewExType}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="fill_blank">Completar lacuna</SelectItem>
                              <SelectItem value="association">Associação</SelectItem>
                              <SelectItem value="rewrite">Reescrever</SelectItem>
                              <SelectItem value="dialogue">Diálogo</SelectItem>
                              <SelectItem value="production">Produção</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Passo *</Label>
                          <Select value={newExStepId} onValueChange={setNewExStepId}>
                            <SelectTrigger><SelectValue placeholder="Selecione o passo" /></SelectTrigger>
                            <SelectContent>
                              {(allSteps as any[]).map((s: any) => (
                                <SelectItem key={s.id} value={s.id}>
                                  Passo {s.number} — {s.title} ({(s.units as any)?.levels?.code})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Questão *</Label>
                          <Textarea value={newExQuestion} onChange={e => setNewExQuestion(e.target.value)} rows={3} />
                        </div>
                        {newExType === "association" ? (
                          <div>
                            <Label className="mb-2 block">Pares de associação</Label>
                            <div className="space-y-2">
                              {assocPairs.map((pair, idx) => (
                                <div key={idx} className="flex gap-2 items-center">
                                  <Input placeholder="Esquerda" value={pair.left} onChange={e => { const p = [...assocPairs]; p[idx].left = e.target.value; setAssocPairs(p); }} className="flex-1" />
                                  <span className="text-muted-foreground">→</span>
                                  <Input placeholder="Direita" value={pair.right} onChange={e => { const p = [...assocPairs]; p[idx].right = e.target.value; setAssocPairs(p); }} className="flex-1" />
                                  {assocPairs.length > 2 && (
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setAssocPairs(assocPairs.filter((_, i) => i !== idx))}>
                                      <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>
                            <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => setAssocPairs([...assocPairs, { left: "", right: "" }])}>
                              <Plus className="h-3 w-3 mr-1" />Adicionar par
                            </Button>
                          </div>
                        ) : (
                          <div>
                            <Label>Resposta</Label>
                            <Input value={newExAnswer} onChange={e => setNewExAnswer(e.target.value)} />
                          </div>
                        )}
                        <div>
                          <Label>Explicação (opcional)</Label>
                          <Textarea value={newExExplanation} onChange={e => setNewExExplanation(e.target.value)} rows={2} />
                        </div>
                        <div>
                          <Label>Ordem</Label>
                          <Input type="number" value={newExOrderIndex} onChange={e => setNewExOrderIndex(e.target.value)} />
                        </div>
                        <Button onClick={handleSaveExercise} disabled={savingExercise} className="w-full bg-primary text-white">
                          {savingExercise ? "Salvando..." : "Salvar exercício"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                {exercisesLoading ? (
                  <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded" />)}</div>
                ) : filteredExercises.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <PenLine className="h-10 w-10 mb-2 opacity-30" />
                    <p className="text-sm">Nenhum exercício encontrado.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredExercises.map(ex => (
                      <Card key={ex.id}>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-[10px] shrink-0">{ex.type?.replace("_", " ")}</Badge>
                                <span className="text-[10px] text-muted-foreground">Passo {ex.steps?.number}</span>
                              </div>
                              <p className="text-sm truncate">{ex.question}</p>
                            </div>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => handleDeleteExercise(ex.id)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* ── Tab: Notificações ─────────────────────────────────────────────── */}
          <TabsContent value="notifications" className="space-y-4">
            <p className="text-sm font-medium text-muted-foreground">Configurações de notificações push</p>

            {notifLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}</div>
            ) : notifSettings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Bell className="h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm">Nenhuma configuração encontrada.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {notifSettings.map((ns: any) => (
                  <NotifCard key={ns.id} ns={ns} notifLog={notifLog} savingNotif={savingNotif} onSave={handleSaveNotifSetting} />
                ))}
              </div>
            )}

            {/* Notification log */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold">Log de notificações</CardTitle>
              </CardHeader>
              <CardContent>
                {notifLog.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma notificação enviada.</p>
                ) : (
                  <div className="space-y-1 overflow-x-auto">
                    <div className="grid grid-cols-6 gap-2 text-[10px] font-bold text-muted-foreground pb-1 border-b min-w-[500px]">
                      <span>Data</span><span>Aluno</span><span>Tipo</span><span>Título</span><span>Entregue</span><span>Aberta</span>
                    </div>
                    {notifLog.map((n: any) => {
                      const p = n.students?.profiles;
                      const name = Array.isArray(p) ? p[0]?.name : p?.name || "—";
                      return (
                        <div key={n.id} className="grid grid-cols-6 gap-2 text-[10px] py-1 border-b last:border-0 min-w-[500px]">
                          <span className="text-muted-foreground">{formatDate(n.sent_at)}</span>
                          <span className="truncate">{name}</span>
                          <span className="truncate">{NOTIF_TYPE_LABELS[n.type] || n.type}</span>
                          <span className="truncate">{n.title}</span>
                          <span>{n.delivered ? "✓" : "✗"}</span>
                          <span>{n.opened ? "✓" : "✗"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab: Configurações ───────────────────────────────────────────── */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Settings className="h-4 w-4" />Configurações gerais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Nome da escola</Label>
                  <Input value={schoolName} onChange={e => setSchoolName(e.target.value)} />
                </div>
                <div>
                  <Label>Link padrão Meet</Label>
                  <Input value={defaultMeetLink} onChange={e => setDefaultMeetLink(e.target.value)} placeholder="https://meet.google.com/..." />
                </div>
                <div>
                  <Label>Receita estimada (R$/mês)</Label>
                  <Input type="number" value={estimatedRevenue} onChange={e => setEstimatedRevenue(e.target.value)} placeholder="0" />
                  {estimatedRevenue && <p className="text-xs text-muted-foreground mt-1">R$ {Number(estimatedRevenue).toLocaleString("pt-BR")}/mês</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Recesso — início</Label>
                    <Input type="date" value={recessStart} onChange={e => setRecessStart(e.target.value)} />
                  </div>
                  <div>
                    <Label>Recesso — fim</Label>
                    <Input type="date" value={recessEnd} onChange={e => setRecessEnd(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Versão da plataforma</Label>
                  <Input value="1.0.0" readOnly className="bg-muted text-muted-foreground" />
                </div>
                <Button className="w-full bg-primary text-white" onClick={() => {
                  localStorage.setItem("schoolName", schoolName);
                  localStorage.setItem("defaultMeetLink", defaultMeetLink);
                  localStorage.setItem("estimatedRevenue", estimatedRevenue);
                  localStorage.setItem("recessStart", recessStart);
                  localStorage.setItem("recessEnd", recessEnd);
                  toast({ title: "Configurações salvas!" });
                }}>
                  Salvar configurações
                </Button>
              </CardContent>
            </Card>

            {/* Admins section */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Users className="h-4 w-4" />Gestão de admins
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {admins.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum admin encontrado.</p>
                ) : (
                  <div className="space-y-1">
                    {admins.map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                        <span className="font-medium">{a.name}</span>
                        <span className="text-muted-foreground">{a.phone || "—"}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="bg-muted rounded p-3 text-xs text-muted-foreground">
                  Para promover um usuário a admin, use o painel do Supabase e altere o campo <code className="font-mono bg-background px-1 rounded">role</code> na tabela <code className="font-mono bg-background px-1 rounded">profiles</code>.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab: Pagamentos ──────────────────────────────────────────────── */}
          <TabsContent value="payments" className="space-y-5">
            {/* Metric cards */}
            {(() => {
              const pending = payments.filter(p => p.status === "pending");
              const paidThisMonth = payments.filter(p => p.status === "paid" && p.paid_at && new Date(p.paid_at).getMonth() === new Date().getMonth());
              const today = payments.filter(p => new Date(p.created_at).toDateString() === new Date().toDateString());
              return (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Pendentes", value: pending.length, color: "text-yellow-600" },
                    { label: "Pagos este mês", value: paidThisMonth.length, color: "text-green-600" },
                    { label: "Leads hoje", value: today.length, color: "text-primary" },
                  ].map(m => (
                    <Card key={m.label}>
                      <CardContent className="py-3 text-center">
                        <p className={`text-2xl font-black ${m.color}`}>{m.value}</p>
                        <p className="text-[10px] text-muted-foreground font-light">{m.label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              );
            })()}

            {/* Filter */}
            <div className="flex gap-2 flex-wrap">
              {(["all", "pending", "paid", "failed"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setPaymentFilter(f)}
                  className={cn("px-3 py-1 rounded-full text-xs font-bold border transition-all",
                    paymentFilter === f ? "bg-primary text-primary-foreground border-transparent" : "border-border text-muted-foreground hover:border-primary/40"
                  )}
                >
                  {f === "all" ? "Todos" : f === "pending" ? "Pendente" : f === "paid" ? "Pago" : "Falhou"}
                </button>
              ))}
            </div>

            {/* Payments list */}
            <div className="space-y-3">
              {payments
                .filter(p => paymentFilter === "all" || p.status === paymentFilter)
                .map(pay => (
                  <Card key={pay.id}>
                    <CardContent className="py-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-sm truncate">{pay.lead_name || "—"}</p>
                          <p className="text-xs text-muted-foreground font-light truncate">{pay.lead_email || "—"}</p>
                          <p className="text-xs text-muted-foreground font-light">{pay.lead_language || "—"} · {plansMap[pay.plan_id || ""] || "—"}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-sm">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((pay.amount_cents || 0) / 100)}</p>
                          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                            pay.status === "paid" ? "bg-green-100 text-green-700" :
                            pay.status === "failed" ? "bg-red-100 text-red-700" :
                            "bg-yellow-100 text-yellow-700"
                          )}>
                            {pay.status === "paid" ? "Pago" : pay.status === "failed" ? "Falhou" : "Pendente"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-light">
                        <span>{pay.payment_method?.toUpperCase() || "—"} · {new Date(pay.created_at).toLocaleDateString("pt-BR")}</span>
                        {pay.paid_at && <span>Pago em {new Date(pay.paid_at).toLocaleDateString("pt-BR")}</span>}
                      </div>
                      {pay.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs"
                          disabled={markingPaid === pay.id}
                          onClick={() => markAsPaid(pay.id)}
                        >
                          {markingPaid === pay.id ? "Marcando..." : "✓ Marcar como pago"}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              {payments.filter(p => paymentFilter === "all" || p.status === paymentFilter).length === 0 && (
                <Card>
                  <CardContent className="py-10 text-center text-sm text-muted-foreground font-light">
                    Nenhum pagamento encontrado.
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
          </div>{/* end tab content */}
          </div>{/* end lg:flex wrapper */}
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
