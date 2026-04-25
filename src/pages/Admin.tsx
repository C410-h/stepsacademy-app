import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
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
import { ToastAction } from "@/components/ui/toast";
import { AdminCommandPalette } from "@/components/AdminCommandPalette";
import AdminApprovalsTab from "@/components/AdminApprovalsTab";
import AdminContentByStepTab from "@/components/AdminContentByStepTab";
import AdminPaymentsTab from "@/components/AdminPaymentsTab";
import AdminStoreTab from "@/components/AdminStoreTab";
import AdminSuggestionsDrawer from "@/components/AdminSuggestionsDrawer";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Plus, Upload, LogOut, Users, Copy, GraduationCap,
  BookOpen, CalendarCheck, AlertCircle, Link2, Search,
  Download, Zap, Flame, BookCheck, Settings, Bell,
  ChevronRight, Trash2, PenLine, Eye, FileText, LayoutGrid,
  UserPlus, Globe, CreditCard, RefreshCw, UserCheck, Clock,
  Library, X, MessageSquarePlus, ShoppingBag, Menu,
} from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { updateStudentStep } from "@/lib/studentProgress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentRow {
  id: string; status: string; currentStepNumber: number; userId: string;
  profile: { name: string } | null; language: { name: string } | null;
  level: { name: string; code: string } | null; teacherName: string | null;
  teacherId: string | null;
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
interface PendingStudentRow {
  id: string; name: string; email: string | null; phone: string | null; created_at: string;
}

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

const LANG_COLORS: Record<string, string> = { "Inglês": "var(--theme-brand-on-bg)", "Espanhol": "#F97316", "Libras": "var(--theme-accent)" };
const formatDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

const NOTIF_TYPE_LABELS: Record<string, string> = {
  material_available: "Material disponível",
  streak_at_risk: "Streak em risco",
  daily_mission_reminder: "Lembrete de missão",
  step_completed: "Passo concluído",
  level_completed: "Nível concluído",
  welcome: "Boas-vindas",
  class_reminder_30min: "Lembrete de aula — 30 min antes",
  class_reminder_10min: "Lembrete de aula — 10 min antes",
  class_reminder_start: "Lembrete de aula — início",
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
  const { theme: activeTheme } = useTheme();
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
  const [drawerPersonalMats, setDrawerPersonalMats] = useState<any[]>([]);
  const [showAddPersonalMat, setShowAddPersonalMat] = useState(false);
  const [personalMatSelect, setPersonalMatSelect] = useState("");
  const [personalMatNote, setPersonalMatNote] = useState("");
  const [addingPersonalMat, setAddingPersonalMat] = useState(false);

  // ── Alternate emails
  const [drawerAltEmails, setDrawerAltEmails] = useState<{ id: string; email: string; label: string | null }[]>([]);
  const [showAddAltEmail, setShowAddAltEmail] = useState(false);
  const [newAltEmail, setNewAltEmail] = useState("");
  const [newAltLabel, setNewAltLabel] = useState("");
  const [addingAltEmail, setAddingAltEmail] = useState(false);

  // ── Add language enrollment
  const [showAddEnrollment, setShowAddEnrollment] = useState(false);
  const [enrollLangId, setEnrollLangId] = useState("");
  const [enrollLevelId, setEnrollLevelId] = useState("");
  const [addingEnrollment, setAddingEnrollment] = useState(false);

  // ── Student step update
  const [stepLevelId, setStepLevelId] = useState("");
  const [stepUnitId, setStepUnitId] = useState("");
  const [newStepId, setNewStepId] = useState("");
  const [stepUnits, setStepUnits] = useState<{ id: string; number: number; title: string }[]>([]);
  const [stepSteps, setStepSteps] = useState<{ id: string; number: number; title: string }[]>([]);
  const [confirmStepOpen, setConfirmStepOpen] = useState(false);
  const [updatingStep, setUpdatingStep] = useState(false);

  // ── Group step update
  const [grpStepLevelId, setGrpStepLevelId] = useState("");
  const [grpStepUnitId, setGrpStepUnitId] = useState("");
  const [grpNewStepId, setGrpNewStepId] = useState("");
  const [grpStepUnits, setGrpStepUnits] = useState<{ id: string; number: number; title: string }[]>([]);
  const [grpStepSteps, setGrpStepSteps] = useState<{ id: string; number: number; title: string }[]>([]);
  const [confirmGrpStepOpen, setConfirmGrpStepOpen] = useState(false);
  const [updatingGrpStep, setUpdatingGrpStep] = useState(false);

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

  // ── New teacher form
  const [showNewTeacher, setShowNewTeacher] = useState(false);
  const [newTeacherName, setNewTeacherName] = useState("");
  const [newTeacherEmail, setNewTeacherEmail] = useState("");
  const [newTeacherLangId, setNewTeacherLangId] = useState("");
  const [creatingTeacher, setCreatingTeacher] = useState(false);
  const [teacherTempPw, setTeacherTempPw] = useState<string | null>(null);

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

  // ── Content tab — Exercise Bank
  const [bankExercises, setBankExercises] = useState<any[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankFilterLang, setBankFilterLang] = useState("all");
  const [bankFilterLevel, setBankFilterLevel] = useState("all");
  const [bankFilterType, setBankFilterType] = useState("all");
  const [bankSearch, setBankSearch] = useState("");
  const [bankOnlyActive, setBankOnlyActive] = useState(true);
  const [selectedBankEx, setSelectedBankEx] = useState<any | null>(null);
  const [bankDrawerOpen, setBankDrawerOpen] = useState(false);
  const [savingBankTags, setSavingBankTags] = useState(false);
  const [bankTagInput, setBankTagInput] = useState("");
  const [bankAddLangId, setBankAddLangId] = useState("");
  const [bankAddLevelId, setBankAddLevelId] = useState("");
  const [bankAddUnitId, setBankAddUnitId] = useState("");
  const [bankAddStepId, setBankAddStepId] = useState("");
  const [bankAddUnits, setBankAddUnits] = useState<{ id: string; number: number; title: string }[]>([]);
  const [bankAddSteps, setBankAddSteps] = useState<{ id: string; number: number; title: string }[]>([]);
  const [bankAddingToStep, setBankAddingToStep] = useState(false);

  // ── Notifications tab
  const [notifSettings, setNotifSettings] = useState<any[]>([]);
  const [notifLog, setNotifLog] = useState<any[]>([]);
  const [notifLoading, setNotifLoading] = useState(true);
  const [adminNotifs, setAdminNotifs] = useState<any[]>([]);
  const [pushPromptStats, setPushPromptStats] = useState<any[]>([]);

  // ── Manual push notification modal
  const [pushModalOpen, setPushModalOpen] = useState(false);
  const [pushStudentId, setPushStudentId] = useState("all");
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [pushUrl, setPushUrl] = useState("/");
  const [sendingPush, setSendingPush] = useState(false);
  const [savingNotif, setSavingNotif] = useState<string | null>(null);

  // ── Active tab (controlled, needed for desktop sidebar)
  const [activeTab, setActiveTab] = useState("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // ── Suggestions drawer
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  // ── Command palette
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ── Payments tab
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentFilter, setPaymentFilter] = useState<"all" | "pending" | "paid" | "failed">("all");
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [plansMap, setPlansMap] = useState<Record<string, string>>({});

  // ── Cadastros tab
  const [regToken, setRegToken] = useState<string | null>(null);
  const [regTokenLoading, setRegTokenLoading] = useState(false);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [pendingStudents, setPendingStudents] = useState<PendingStudentRow[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [activateDrawerOpen, setActivateDrawerOpen] = useState(false);
  const [activatingStudent, setActivatingStudent] = useState<PendingStudentRow | null>(null);
  const [activateLangId, setActivateLangId] = useState("");
  const [activateLevelId, setActivateLevelId] = useState("");
  const [activating, setActivating] = useState(false);

  // ── Settings tab
  const [schoolName, setSchoolName] = useState(() => localStorage.getItem("schoolName") || "Steps Academy");
  const [defaultMeetLink, setDefaultMeetLink] = useState(() => localStorage.getItem("defaultMeetLink") || "");
  const [estimatedRevenue, setEstimatedRevenue] = useState(() => localStorage.getItem("estimatedRevenue") || "");
  const [recessStart, setRecessStart] = useState(() => localStorage.getItem("recessStart") || "");
  const [recessEnd, setRecessEnd] = useState(() => localStorage.getItem("recessEnd") || "");
  const [admins, setAdmins] = useState<any[]>([]);

  // ── Holidays tab
  const [holidays, setHolidays] = useState<any[]>([]);
  const [holidayYear, setHolidayYear] = useState<number>(new Date().getFullYear());
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");
  const [loadingHolidays, setLoadingHolidays] = useState(false);
  const [savingHoliday, setSavingHoliday] = useState(false);

  const [cancellingHoliday, setCancellingHoliday] = useState<string | null>(null);

  const loadHolidays = useCallback(async (year: number) => {
    setLoadingHolidays(true);
    const { data } = await (supabase as any)
      .from("national_holidays")
      .select("id, date, name, message, sessions_cancelled, cancelled_at")
      .gte("date", `${year}-01-01`)
      .lte("date", `${year}-12-31`)
      .order("date", { ascending: true });
    setHolidays(data || []);
    setLoadingHolidays(false);
  }, []);

  const cancelHolidaySessions = async (holiday: any) => {
    setCancellingHoliday(holiday.id);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancel-holiday-sessions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authSession?.access_token}`,
          },
          body: JSON.stringify({ date: holiday.date, force: !!holiday.cancelled_at }),
        }
      );
      const result = await res.json();
      if (result.ok) {
        toast({ title: `${result.cancelled} aulas canceladas, ${result.notified ?? 0} alunos notificados` });
        loadHolidays(holidayYear);
      } else {
        toast({ title: result.message ?? result.error ?? "Erro ao cancelar", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao cancelar aulas", variant: "destructive" });
    }
    setCancellingHoliday(null);
  };

  useEffect(() => { loadHolidays(holidayYear); }, [holidayYear, loadHolidays]);

  const addHoliday = async () => {
    if (!newHolidayDate || !newHolidayName) return;
    setSavingHoliday(true);
    const { error } = await (supabase as any)
      .from("national_holidays")
      .insert({ date: newHolidayDate, name: newHolidayName });
    if (!error) {
      setNewHolidayDate("");
      setNewHolidayName("");
      loadHolidays(holidayYear);
      toast({ title: "Feriado adicionado!" });
    } else {
      toast({ title: "Erro ao adicionar feriado", variant: "destructive" });
    }
    setSavingHoliday(false);
  };

  const deleteHoliday = async (id: string) => {
    const { error } = await (supabase as any)
      .from("national_holidays")
      .delete()
      .eq("id", id);
    if (!error) {
      setHolidays(prev => prev.filter(h => h.id !== id));
      toast({ title: "Feriado removido!" });
    } else {
      toast({ title: "Erro ao remover feriado", variant: "destructive" });
    }
  };

  useEffect(() => {
    loadReference();
    loadStudents();
    loadDashboard();
    loadTeachers();
    loadGroups();
    loadVocabulary();
    loadExercises();
    loadBankExercises();
    loadNotificationSettings();
    loadNotifLog();
    loadAdminNotifs();
    loadPushPromptStats();
    loadMaterials();
    loadAllSteps();
    loadAdmins();
    loadPayments();
    const handlePaletteOpen = () => setPaletteOpen(true);
    window.addEventListener("adminpalette:open", handlePaletteOpen);
    return () => window.removeEventListener("adminpalette:open", handlePaletteOpen);
  }, []);

  // Load cadastros data when tab becomes active
  useEffect(() => {
    if (activeTab === "cadastros") loadCadastros();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ── Reference data ───────────────────────────────────────────────────────────
  const loadReference = async () => {
    const [{ data: langs }, { data: lvls }] = await Promise.all([
      supabase.from("languages").select("id, name").eq("active", true),
      supabase.from("levels").select("id, name, code, language_id"),
    ]);
    setLanguages(langs || []);
    setLevels(lvls || []);
  };

  // ── Cadastros ────────────────────────────────────────────────────────────────
  const loadCadastros = async () => {
    setRegTokenLoading(true);
    setPendingLoading(true);

    // Active registration token
    const { data: tokenData } = await (supabase as any)
      .from("registration_tokens")
      .select("token")
      .eq("active", true)
      .single();
    setRegToken(tokenData?.token ?? null);
    setRegTokenLoading(false);

    // Pending students: profiles with role=student not yet in students table
    const [{ data: activated }, { data: profiles }] = await Promise.all([
      supabase.from("students").select("user_id"),
      supabase.from("profiles").select("id, name, email, phone, created_at").eq("role", "student"),
    ]);
    const activatedIds = new Set((activated ?? []).map((s: any) => s.user_id));
    const pending = (profiles ?? []).filter((p: any) => !activatedIds.has(p.id));
    setPendingStudents(pending as PendingStudentRow[]);
    setPendingLoading(false);
  };

  const generateNewToken = async () => {
    setGeneratingToken(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-registration-token");
      if (error) throw error;
      if (data?.token) setRegToken(data.token);
      toast({ title: "Novo link gerado!", description: "O link anterior foi desativado." });
    } catch {
      toast({ title: "Erro", description: "Não foi possível gerar um novo link.", variant: "destructive" });
    }
    setGeneratingToken(false);
  };

  const handleActivateStudent = async () => {
    if (!activatingStudent || !activateLangId || !activateLevelId) return;
    setActivating(true);
    try {
      // Explicitly pass the session token — functions.invoke may not attach it automatically
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke("activate-student", {
        body: { user_id: activatingStudent.id, language_id: activateLangId, level_id: activateLevelId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;

      // Send welcome email — fire-and-forget, failure does not block activation
      supabase.functions.invoke("send-welcome-email", {
        body: { user_id: activatingStudent.id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      }).then(({ error: emailErr }) => {
        if (emailErr) console.warn("send-welcome-email failed (non-blocking):", emailErr);
      });

      toast({ title: "Aluno ativado!", description: `${activatingStudent.name} foi ativado com sucesso.` });
      setActivateDrawerOpen(false);
      setActivatingStudent(null);
      setActivateLangId("");
      setActivateLevelId("");
      loadCadastros();
      loadStudents();
    } catch {
      toast({ title: "Erro", description: "Não foi possível ativar o aluno.", variant: "destructive" });
    }
    setActivating(false);
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
      teacher_students(teacher_id, teachers(profiles!teachers_user_id_fkey(name)))
    `).order("created_at", { ascending: false });
    if (studs) {
      const rows: StudentRow[] = (studs as any[]).map(s => {
        const teacherEntry = s.teacher_students?.[0];
        const tp = teacherEntry?.teachers?.profiles;
        const teacherName = Array.isArray(tp) ? tp[0]?.name || null : tp?.name || null;
        const teacherId = teacherEntry?.teacher_id || null;
        const langData = (langs || []).find((l: any) => l.id === s.language_id);
        const levelData = (lvls || []).find((l: any) => l.id === s.level_id);
        return {
          id: s.id, status: s.status, currentStepNumber: s.steps?.number || 0, userId: s.user_id,
          profile: s.profiles ? { name: s.profiles.name } : null,
          language: langData ? { name: langData.name } : null,
          level: levelData ? { name: levelData.name, code: levelData.code } : null,
          teacherName, teacherId, createdAt: s.created_at, languageId: s.language_id, levelId: s.level_id,
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
    setDrawerPersonalMats([]);
    setShowAddPersonalMat(false);
    setPersonalMatSelect("");
    setPersonalMatNote("");
    setDrawerAltEmails([]);
    setShowAddAltEmail(false);
    setNewAltEmail("");
    setNewAltLabel("");
    setNewStepId(""); setStepUnitId(""); setStepSteps([]);
    setStepLevelId(student.levelId || "");
    const [
      { data: gamif },
      { data: placements },
      { data: classes },
      { data: progress },
      { data: personalMats },
      { data: altEmails },
    ] = await Promise.all([
      (supabase as any).from("student_gamification").select("xp_total, coins, streak_current, streak_best").eq("student_id", student.id).single(),
      (supabase as any).from("placement_tests").select("assigned_level, test_type, notes, completed_at").eq("student_id", student.id).order("created_at", { ascending: false }).limit(1),
      supabase.from("classes").select("scheduled_at, steps!classes_step_id_fkey(number)").eq("student_id", student.id).eq("status", "completed").order("scheduled_at", { ascending: false }).limit(5),
      supabase.from("student_progress").select("status").eq("student_id", student.id),
      (supabase as any).from("student_materials").select("id, material_id, note, materials(id, title, type)").eq("student_id", student.id).eq("is_personal", true),
      (supabase as any).from("profile_alternate_emails").select("id, email, label").eq("profile_id", student.userId),
    ]);
    setDrawerGamification(gamif || null);
    setDrawerPlacement(placements?.[0] || null);
    setDrawerClasses((classes as any[]) || []);
    const done = (progress || []).filter((p: any) => p.status === "done").length;
    const available = (progress || []).filter((p: any) => p.status === "available").length;
    const locked = (progress || []).filter((p: any) => p.status === "locked").length;
    setDrawerProgress({ done, available, locked });
    setDrawerPersonalMats((personalMats as any[]) || []);
    setDrawerAltEmails((altEmails as any[]) || []);
    setDrawerLoading(false);
    await loadDrawerCerts(student.id);
  };

  const handleAddAltEmail = async () => {
    if (!selectedStudent || !newAltEmail.trim()) return;
    setAddingAltEmail(true);
    try {
      const { error } = await (supabase as any)
        .from("profile_alternate_emails")
        .insert({ profile_id: selectedStudent.userId, email: newAltEmail.trim().toLowerCase(), label: newAltLabel.trim() || null });
      if (error) throw error;
      toast({ title: "Email alternativo adicionado!" });
      setShowAddAltEmail(false);
      setNewAltEmail("");
      setNewAltLabel("");
      const { data } = await (supabase as any).from("profile_alternate_emails").select("id, email, label").eq("profile_id", selectedStudent.userId);
      setDrawerAltEmails(data || []);
    } catch (e: any) {
      toast({ title: "Erro ao adicionar email", description: e.message, variant: "destructive" });
    } finally {
      setAddingAltEmail(false);
    }
  };

  const handleRemoveAltEmail = async (altId: string) => {
    try {
      const { error } = await (supabase as any).from("profile_alternate_emails").delete().eq("id", altId);
      if (error) throw error;
      setDrawerAltEmails(prev => prev.filter(e => e.id !== altId));
      toast({ title: "Email removido." });
    } catch {
      toast({ title: "Erro ao remover email", variant: "destructive" });
    }
  };

  const loadDrawerCerts = async (studentId: string) => {
    const { data } = await (supabase as any)
      .from("certificates")
      .select("id, certificate_number, level_name, language_name, issued_at")
      .eq("student_id", studentId)
      .order("issued_at", { ascending: false });
    setDrawerCerts(data || []);
  };

  // ── Step update cascade (student drawer) ─────────────────────────────────────

  useEffect(() => {
    if (!stepLevelId) { setStepUnits([]); setStepUnitId(""); setStepSteps([]); setNewStepId(""); return; }
    (supabase as any).from("units").select("id, number, title").eq("level_id", stepLevelId).order("number")
      .then(({ data }: any) => { setStepUnits(data || []); setStepUnitId(""); setStepSteps([]); setNewStepId(""); });
  }, [stepLevelId]);

  useEffect(() => {
    if (!stepUnitId) { setStepSteps([]); setNewStepId(""); return; }
    (supabase as any).from("steps").select("id, number, title").eq("unit_id", stepUnitId).order("number")
      .then(({ data }: any) => { setStepSteps(data || []); setNewStepId(""); });
  }, [stepUnitId]);

  const handleUpdateStep = async () => {
    if (!selectedStudent || !newStepId) return;
    setUpdatingStep(true);
    try {
      await updateStudentStep(supabase as any, selectedStudent.id, newStepId);
      toast({ title: "Step atualizado!", description: "O progresso do aluno foi atualizado com sucesso." });
      setConfirmStepOpen(false);
      setNewStepId(""); setStepUnitId(""); setStepLevelId("");
      await loadStudents();
    } catch (e: any) {
      toast({ title: "Erro ao atualizar step", description: e.message, variant: "destructive" });
    }
    setUpdatingStep(false);
  };

  // ── Step update cascade (groups) ──────────────────────────────────────────────

  useEffect(() => {
    if (!grpStepLevelId) { setGrpStepUnits([]); setGrpStepUnitId(""); setGrpStepSteps([]); setGrpNewStepId(""); return; }
    (supabase as any).from("units").select("id, number, title").eq("level_id", grpStepLevelId).order("number")
      .then(({ data }: any) => { setGrpStepUnits(data || []); setGrpStepUnitId(""); setGrpStepSteps([]); setGrpNewStepId(""); });
  }, [grpStepLevelId]);

  useEffect(() => {
    if (!grpStepUnitId) { setGrpStepSteps([]); setGrpNewStepId(""); return; }
    (supabase as any).from("steps").select("id, number, title").eq("unit_id", grpStepUnitId).order("number")
      .then(({ data }: any) => { setGrpStepSteps(data || []); setGrpNewStepId(""); });
  }, [grpStepUnitId]);

  // ── Bank add-to-step cascade ──────────────────────────────────────────────────

  useEffect(() => {
    if (!bankAddLevelId) { setBankAddUnits([]); setBankAddUnitId(""); setBankAddSteps([]); setBankAddStepId(""); return; }
    (supabase as any).from("units").select("id, number, title").eq("level_id", bankAddLevelId).order("number")
      .then(({ data }: any) => { setBankAddUnits(data || []); setBankAddUnitId(""); setBankAddSteps([]); setBankAddStepId(""); });
  }, [bankAddLevelId]);

  useEffect(() => {
    if (!bankAddUnitId) { setBankAddSteps([]); setBankAddStepId(""); return; }
    (supabase as any).from("steps").select("id, number, title").eq("unit_id", bankAddUnitId).order("number")
      .then(({ data }: any) => { setBankAddSteps(data || []); setBankAddStepId(""); });
  }, [bankAddUnitId]);

  const handleUpdateGroupStep = async () => {
    if (!selectedGroup || !grpNewStepId || groupStudents.length === 0) return;
    setUpdatingGrpStep(true);
    try {
      await Promise.all([
        ...groupStudents.map((gs: any) =>
          updateStudentStep(supabase as any, gs.student_id, grpNewStepId)
        ),
        // Keep group's current_step_id in sync so new students inherit it
        (supabase as any).from("groups").update({ current_step_id: grpNewStepId }).eq("id", selectedGroup.id),
      ]);
      setSelectedGroup((prev: any) => prev ? { ...prev, current_step_id: grpNewStepId } : prev);
      toast({ title: "Turma atualizada!", description: `Step atualizado para ${groupStudents.length} aluno(s).` });
      setConfirmGrpStepOpen(false);
      setGrpNewStepId(""); setGrpStepUnitId(""); setGrpStepLevelId("");
    } catch (e: any) {
      toast({ title: "Erro ao atualizar turma", description: e.message, variant: "destructive" });
    }
    setUpdatingGrpStep(false);
  };

  const handleAddEnrollment = async () => {
    if (!selectedStudent || !enrollLangId) return;
    setAddingEnrollment(true);
    try {
      const { error } = await supabase.from("student_enrollments" as any).insert({
        student_id: selectedStudent.id,
        language_id: enrollLangId,
        level_id: enrollLevelId || null,
        status: "active",
      });
      if (error) throw error;
      toast({ title: "Idioma adicionado!", description: "O aluno agora tem acesso a este idioma." });
      setShowAddEnrollment(false);
      setEnrollLangId("");
      setEnrollLevelId("");
    } catch {
      toast({ title: "Erro", description: "Não foi possível adicionar o idioma.", variant: "destructive" });
    }
    setAddingEnrollment(false);
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

  const addPersonalMaterial = async () => {
    if (!selectedStudent || !personalMatSelect) return;
    setAddingPersonalMat(true);
    try {
      const { error } = await (supabase as any).from("student_materials").insert({
        student_id: selectedStudent.id,
        material_id: personalMatSelect,
        is_personal: true,
        note: personalMatNote.trim() || null,
        available_at: new Date().toISOString(),
      });
      if (error) throw error;
      // Refresh personal mats
      const { data: refreshed } = await (supabase as any)
        .from("student_materials")
        .select("id, material_id, note, materials(id, title, type)")
        .eq("student_id", selectedStudent.id)
        .eq("is_personal", true);
      setDrawerPersonalMats(refreshed || []);
      setShowAddPersonalMat(false);
      setPersonalMatSelect("");
      setPersonalMatNote("");
      toast({ title: "Material pessoal adicionado!" });
    } catch {
      toast({ title: "Erro ao adicionar material.", variant: "destructive" });
    } finally {
      setAddingPersonalMat(false);
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
      const recent: StudentRow[] = (recentStudData as any[]).map(s => ({ id: s.id, status: s.status, currentStepNumber: 0, profile: s.profiles ? { name: s.profiles.name } : null, language: s.language_id ? { name: langLookup[s.language_id] || "—" } : null, level: s.level_id ? (levelLookup as any)[s.level_id] || null : null, teacherName: null, teacherId: null, createdAt: s.created_at, languageId: s.language_id, levelId: s.level_id }));
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
    const { data, error } = await (supabase as any).from("groups").select(`
      id, name, meet_link, active, created_at, language_id, level_id,
      languages!groups_language_id_fkey(name),
      levels!groups_level_id_fkey(name, code),
      group_students!group_students_group_id_fkey(student_id)
    `).order("created_at", { ascending: false });
    if (error) console.error("[Admin] loadGroups error:", error);
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

  // ── Exercise Bank ─────────────────────────────────────────────────────────────
  const loadBankExercises = async () => {
    setBankLoading(true);
    const { data } = await (supabase as any)
      .from("exercise_bank")
      .select("id, type, question, options, answer, explanation, tags, times_used, active, level_id, language_id, created_by, created_at")
      .order("created_at", { ascending: false });
    setBankExercises(data || []);
    setBankLoading(false);
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

  const loadAdminNotifs = async () => {
    const { data } = await (supabase as any).from("admin_notifications")
      .select("*").order("created_at", { ascending: false }).limit(100);
    setAdminNotifs(data || []);
  };

  const loadPushPromptStats = async () => {
    const [{ data: logs }, { data: subs }] = await Promise.all([
      (supabase as any)
        .from("push_prompt_log")
        .select("student_id, event, created_at, students!push_prompt_log_student_id_fkey(profiles!students_user_id_fkey(name))")
        .order("created_at", { ascending: false }),
      (supabase as any)
        .from("push_subscriptions")
        .select("student_id"),
    ]);
    const subscribedIds = new Set((subs || []).map((s: any) => s.student_id));
    // Group by student
    const map = new Map<string, any>();
    for (const row of (logs || [])) {
      const sid = row.student_id;
      if (!map.has(sid)) {
        map.set(sid, {
          student_id: sid,
          name: row.students?.profiles?.name ?? "—",
          subscribed: subscribedIds.has(sid),
          shown: 0, dismissed: 0, lastDismissed: null,
        });
      }
      const entry = map.get(sid);
      if (row.event === "shown") entry.shown++;
      if (row.event === "dismissed") {
        entry.dismissed++;
        if (!entry.lastDismissed || row.created_at > entry.lastDismissed) entry.lastDismissed = row.created_at;
      }
    }
    // Sort: not subscribed first, then by most recent dismissal
    setPushPromptStats(
      [...map.values()].sort((a, b) => {
        if (a.subscribed !== b.subscribed) return a.subscribed ? 1 : -1;
        return (b.lastDismissed ?? "") > (a.lastDismissed ?? "") ? 1 : -1;
      })
    );
  };

  const markAdminNotifRead = async (id: string) => {
    await (supabase as any).from("admin_notifications").update({ read: true }).eq("id", id);
    setAdminNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAdminNotifsRead = async () => {
    await (supabase as any).from("admin_notifications").update({ read: true }).eq("read", false);
    setAdminNotifs(prev => prev.map(n => ({ ...n, read: true })));
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

  const handleCreateTeacher = async () => {
    if (!newTeacherName || !newTeacherEmail || !newTeacherLangId) {
      toast({ title: "Preencha nome, e-mail e idioma", variant: "destructive" }); return;
    }
    setCreatingTeacher(true); setTeacherTempPw(null);
    const { data, error } = await supabase.functions.invoke("create-teacher", {
      body: { name: newTeacherName, email: newTeacherEmail, language_id: newTeacherLangId },
    });
    if (error || !data?.success) {
      toast({ title: "Erro ao criar professor", description: data?.error || error?.message || "Tente novamente.", variant: "destructive" });
      setCreatingTeacher(false); return;
    }
    if (data.temp_password) setTeacherTempPw(data.temp_password);
    toast({ title: "Professor criado com sucesso!" });
    setNewTeacherName(""); setNewTeacherEmail(""); setNewTeacherLangId("");
    setCreatingTeacher(false); loadTeachers();
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
    try {
      const { error } = await (supabase as any).from("group_students").insert({ group_id: selectedGroup.id, student_id: addStudentToGroupId });
      if (error) throw error;

      // Sync student to group's language, level, and current step
      const updates: Record<string, string> = {};
      if (selectedGroup.language_id) updates.language_id = selectedGroup.language_id;
      if (selectedGroup.level_id)    updates.level_id    = selectedGroup.level_id;
      if (Object.keys(updates).length) {
        await (supabase as any).from("students").update(updates).eq("id", addStudentToGroupId);
      }
      if (selectedGroup.current_step_id) {
        await updateStudentStep(supabase as any, addStudentToGroupId, selectedGroup.current_step_id, { inherited: true });
      }

      toast({ title: "Aluno adicionado à turma!", description: selectedGroup.current_step_id ? "Progresso da turma aplicado." : undefined });
      setAddStudentToGroupId("");
      loadGroupStudents(selectedGroup.id);
      loadGroups();
    } catch (error: any) {
      toast({ title: "Erro ao adicionar aluno", description: error.message, variant: "destructive" });
    }
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
    const prevWords = [...vocabWords];
    setVocabWords(v => v.filter(w => w.id !== id));
    await (supabase as any).from("vocabulary").update({ active: false }).eq("id", id);
    toast({
      title: "Palavra desativada.",
      action: <ToastAction altText="Desfazer" onClick={async () => {
        await (supabase as any).from("vocabulary").update({ active: true }).eq("id", id);
        setVocabWords(prevWords);
      }}>Desfazer</ToastAction>,
    });
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
    const prevExercises = [...exercises];
    setExercises(e => e.filter(ex => ex.id !== id));
    await (supabase as any).from("lesson_exercises").update({ active: false }).eq("id", id);
    toast({
      title: "Exercício desativado.",
      action: <ToastAction altText="Desfazer" onClick={async () => {
        await (supabase as any).from("lesson_exercises").update({ active: true }).eq("id", id);
        setExercises(prevExercises);
      }}>Desfazer</ToastAction>,
    });
  };

  // ── Exercise Bank handlers ────────────────────────────────────────────────────

  const handleToggleBankExActive = async (ex: any) => {
    const newActive = !ex.active;
    await (supabase as any).from("exercise_bank").update({ active: newActive }).eq("id", ex.id);
    setBankExercises(prev => prev.map(e => e.id === ex.id ? { ...e, active: newActive } : e));
    if (selectedBankEx?.id === ex.id) setSelectedBankEx((prev: any) => prev ? { ...prev, active: newActive } : prev);
  };

  const handleAddBankTag = async (tag: string) => {
    if (!selectedBankEx || !tag.trim()) return;
    const trimmed = tag.trim();
    const current: string[] = selectedBankEx.tags || [];
    if (current.includes(trimmed)) return;
    const newTags = [...current, trimmed];
    setSavingBankTags(true);
    await (supabase as any).from("exercise_bank").update({ tags: newTags }).eq("id", selectedBankEx.id);
    setBankExercises(prev => prev.map(e => e.id === selectedBankEx.id ? { ...e, tags: newTags } : e));
    setSelectedBankEx((prev: any) => prev ? { ...prev, tags: newTags } : prev);
    setSavingBankTags(false);
  };

  const handleRemoveBankTag = async (idx: number) => {
    if (!selectedBankEx) return;
    const current: string[] = selectedBankEx.tags || [];
    const newTags = current.filter((_, i) => i !== idx);
    setSavingBankTags(true);
    await (supabase as any).from("exercise_bank").update({ tags: newTags }).eq("id", selectedBankEx.id);
    setBankExercises(prev => prev.map(e => e.id === selectedBankEx.id ? { ...e, tags: newTags } : e));
    setSelectedBankEx((prev: any) => prev ? { ...prev, tags: newTags } : prev);
    setSavingBankTags(false);
  };

  const handleAddBankExToStep = async () => {
    if (!selectedBankEx || !bankAddStepId) return;
    setBankAddingToStep(true);
    try {
      await (supabase as any).from("lesson_exercises").insert({
        step_id: bankAddStepId,
        type: selectedBankEx.type,
        question: selectedBankEx.question,
        answer: selectedBankEx.answer,
        explanation: selectedBankEx.explanation || null,
        options: selectedBankEx.options || null,
        order_index: 999,
        active: true,
      });
      const newTimesUsed = (selectedBankEx.times_used || 0) + 1;
      await (supabase as any).from("exercise_bank").update({ times_used: newTimesUsed }).eq("id", selectedBankEx.id);
      setBankExercises(prev => prev.map(e => e.id === selectedBankEx.id ? { ...e, times_used: newTimesUsed } : e));
      setSelectedBankEx((prev: any) => prev ? { ...prev, times_used: newTimesUsed } : prev);
      toast({ title: "Exercício adicionado ao passo!", description: "O exercício foi inserido com sucesso." });
      setBankAddStepId(""); setBankAddUnitId(""); setBankAddLevelId(""); setBankAddLangId("");
    } catch (e: any) {
      toast({ title: "Erro ao adicionar", description: e.message, variant: "destructive" });
    }
    setBankAddingToStep(false);
  };

  const handleSaveNotifSetting = async (setting: any, updates: any) => {
    setSavingNotif(setting.id);
    await (supabase as any).from("notification_settings").update(updates).eq("id", setting.id);
    toast({ title: "Configuração salva!" });
    setSavingNotif(null);
    loadNotificationSettings();
  };

  const handleSendPush = async () => {
    if (!pushTitle.trim() || !pushBody.trim()) return;
    setSendingPush(true);
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke("send-push-notification", {
        body: {
          student_id: pushStudentId === "all" ? undefined : pushStudentId,
          title: pushTitle,
          body: pushBody,
          url: pushUrl || "/",
        },
      });
      if (fnError) throw fnError;
      if (fnData?.sent === 0) {
        throw new Error(`Sent: 0. Errors: ${JSON.stringify(fnData?.errors ?? fnData?.message ?? "unknown")}`);
      }
      toast({ title: "Notificação enviada!", description: pushStudentId === "all" ? "Enviada para todos os alunos." : "Enviada para o aluno selecionado." });
      setPushModalOpen(false);
      setPushTitle("");
      setPushBody("");
      setPushUrl("/");
      setPushStudentId("all");
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e?.message ?? "Tente novamente.", variant: "destructive" });
    }
    setSendingPush(false);
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

  const filteredBankExercises = bankExercises.filter(ex => {
    const level = levels.find(l => l.id === ex.level_id);
    const matchLang = bankFilterLang === "all" || ex.language_id === bankFilterLang || level?.language_id === bankFilterLang;
    const matchLevel = bankFilterLevel === "all" || ex.level_id === bankFilterLevel;
    const matchType = bankFilterType === "all" || ex.type === bankFilterType;
    const matchSearch = !bankSearch.trim() || (ex.question || "").toLowerCase().includes(bankSearch.toLowerCase());
    const matchActive = !bankOnlyActive || ex.active;
    return matchLang && matchLevel && matchType && matchSearch && matchActive;
  });

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-background border-b">
        <div className="flex items-center gap-2">
          <button
            className="lg:hidden p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <a href="/"><img src={activeTheme === "bonjour" ? "/brand/logo-reto-cream.webp" : "/brand/logo-reto-darkpurple.webp"} alt="steps academy" className="h-32" /></a>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground border rounded-md px-3 py-1.5 hover:bg-muted transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            Buscar…
            <kbd className="ml-1 font-mono text-[10px] border rounded px-1">⌘K</kbd>
          </button>
          <button
            onClick={() => setSuggestionsOpen(true)}
            title="Sugestões dos alunos"
            className="flex items-center gap-1.5 text-xs text-muted-foreground border rounded-md px-3 py-1.5 hover:bg-muted transition-colors"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sugestões</span>
          </button>
          <span className="text-sm font-light text-muted-foreground hidden sm:block">{firstName} · Admin</span>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="px-4 py-4 md:px-8 lg:px-10 max-w-7xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Mobile: current section label (no scrollable tab bar) */}
          <div className="lg:hidden flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-foreground">
              {[
                { value: "overview", label: "Visão Geral" },
                { value: "students", label: "Alunos" },
                { value: "teachers", label: "Professores" },
                { value: "groups", label: "Turmas" },
                { value: "content", label: "Conteúdo" },
                { value: "notifications", label: "Notificações" },
                { value: "payments", label: "Pagamentos" },
                { value: "cadastros", label: "Cadastros" },
                { value: "store", label: "Loja" },
                { value: "settings", label: "Config" },
              ].find(t => t.value === activeTab)?.label ?? ""}
            </p>
          </div>

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
                  { value: "cadastros", label: "Cadastros", icon: UserCheck },
                  { value: "store", label: "Loja", icon: ShoppingBag },
                  { value: "settings", label: "Config", icon: Settings },
                ].map(item => (
                  <button
                    key={item.value}
                    onClick={() => setActiveTab(item.value)}
                    className={cn(
                      "flex items-center gap-2.5 text-sm px-3 py-2 rounded-md w-full text-left transition-colors",
                      activeTab === item.value
                        ? "bg-[var(--theme-accent)]/15 text-[var(--theme-brand-on-bg)] font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {item.value === "students" && (metrics?.studentsInactive7d ?? 0) > 0 && (
                      <span className="ml-auto text-[10px] font-bold bg-orange-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                        {metrics!.studentsInactive7d}
                      </span>
                    )}
                    {item.value === "notifications" && adminNotifs.filter(n => !n.read).length > 0 && (
                      <span className="ml-auto text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5 leading-none">
                        {adminNotifs.filter(n => !n.read).length}
                      </span>
                    )}
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
                        <Users className="h-4 w-4 text-[var(--theme-brand-on-bg)]" />
                        <span className="text-xs text-muted-foreground font-light">Alunos ativos</span>
                      </div>
                      <p className="text-3xl font-bold text-[var(--theme-brand-on-bg)]">{metrics?.activeStudents ?? 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <GraduationCap className="h-4 w-4 text-[var(--theme-brand-on-bg)]" />
                        <span className="text-xs text-muted-foreground font-light">Professores</span>
                      </div>
                      <p className="text-3xl font-bold text-[var(--theme-brand-on-bg)]">{metrics?.totalTeachers ?? 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <CalendarCheck className="h-4 w-4 text-[var(--theme-brand-on-bg)]" />
                        <span className="text-xs text-muted-foreground font-light">Aulas este mês</span>
                      </div>
                      <p className="text-3xl font-bold text-[var(--theme-brand-on-bg)]">{metrics?.classesThisMonth ?? 0}</p>
                    </CardContent>
                  </Card>
                  <Card className={metrics?.studentsInactive7d ? "border-orange-300" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                        <span className="text-xs text-muted-foreground font-light">Sem aula (7d)</span>
                      </div>
                      <p className={`text-3xl font-bold ${metrics?.studentsInactive7d ? "text-orange-500" : "text-[var(--theme-brand-on-bg)]"}`}>
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
                        <BookCheck className="h-4 w-4 text-[var(--theme-brand-on-bg)]" />
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
                        <BookOpen className="h-4 w-4 text-[var(--theme-brand-on-bg)]" />
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
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="aulas" fill="var(--theme-brand-on-bg)" radius={[3, 3, 0, 0]} />
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
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                        <Tooltip />
                        <Bar dataKey="xp" fill="var(--theme-brand-on-bg)" radius={[0, 3, 3, 0]} />
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
                              <p className="text-xs font-bold text-[var(--theme-brand-on-bg)]">{lv.code}</p>
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
                          <Badge variant={s.status === "active" ? "default" : "secondary"} className={s.status === "active" ? "bg-[var(--theme-accent)] text-[var(--theme-text-on-accent)] text-[10px]" : "text-[10px]"}>
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
            <Sheet open={studentDrawerOpen} onOpenChange={v => { setStudentDrawerOpen(v); if (!v) { setShowAddEnrollment(false); setEnrollLangId(""); setEnrollLevelId(""); setShowAddAltEmail(false); setNewAltEmail(""); setNewAltLabel(""); } }}>
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
                          <Badge variant={selectedStudent.status === "active" ? "default" : "secondary"} className={selectedStudent.status === "active" ? "bg-[var(--theme-accent)] text-[var(--theme-text-on-accent)] text-[10px]" : "text-[10px]"}>
                            {selectedStudent.status}
                          </Badge>
                        </div>
                        {selectedStudent.teacherName && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Professor</span>
                            {selectedStudent.teacherId ? (
                              <button
                                className="text-[var(--theme-brand-on-bg)] underline underline-offset-2 hover:opacity-70 transition-opacity"
                                onClick={() => { setStudentDrawerOpen(false); navigate(`/admin/professor/${selectedStudent.teacherId}`); }}
                              >
                                {selectedStudent.teacherName}
                              </button>
                            ) : (
                              <span>{selectedStudent.teacherName}</span>
                            )}
                          </div>
                        )}
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
                    {/* Adicionar idioma */}
                    <div className="space-y-3 pt-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Idiomas matriculados</p>
                      {!showAddEnrollment ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs gap-1.5"
                          onClick={() => setShowAddEnrollment(true)}
                        >
                          <Globe className="h-3.5 w-3.5" />
                          Adicionar idioma
                        </Button>
                      ) : (
                        <div className="space-y-2 p-2 rounded-lg border bg-muted/30">
                          <Select value={enrollLangId} onValueChange={v => { setEnrollLangId(v); setEnrollLevelId(""); }}>
                            <SelectTrigger className="text-xs h-8">
                              <SelectValue placeholder="Selecionar idioma…" />
                            </SelectTrigger>
                            <SelectContent>
                              {languages.map(l => (
                                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {enrollLangId && (
                            <Select value={enrollLevelId} onValueChange={setEnrollLevelId}>
                              <SelectTrigger className="text-xs h-8">
                                <SelectValue placeholder="Selecionar nível (opcional)…" />
                              </SelectTrigger>
                              <SelectContent>
                                {levels.filter(l => l.language_id === enrollLangId).map(l => (
                                  <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1 text-xs"
                              disabled={!enrollLangId || addingEnrollment}
                              onClick={handleAddEnrollment}
                            >
                              {addingEnrollment ? "Adicionando…" : "Adicionar"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs"
                              onClick={() => { setShowAddEnrollment(false); setEnrollLangId(""); setEnrollLevelId(""); }}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

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
                            <a href={`/certificado/${c.id}`} target="_blank" className="text-xs text-[var(--theme-brand-on-bg)] font-bold hover:underline">Ver</a>
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

                    {/* Emails alternativos */}
                    <div className="space-y-3 pt-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Emails alternativos</p>
                      {drawerAltEmails.length === 0 && !showAddAltEmail && (
                        <p className="text-xs text-muted-foreground font-light">Nenhum email alternativo cadastrado.</p>
                      )}
                      {drawerAltEmails.map(ae => (
                        <div key={ae.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border text-xs">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{ae.email}</p>
                            {ae.label && <p className="text-muted-foreground">{ae.label}</p>}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs h-7 px-2 shrink-0"
                            onClick={() => handleRemoveAltEmail(ae.id)}
                          >
                            Remover
                          </Button>
                        </div>
                      ))}
                      {!showAddAltEmail ? (
                        <Button size="sm" variant="outline" className="w-full text-xs gap-1.5" onClick={() => setShowAddAltEmail(true)}>
                          + Adicionar email alternativo
                        </Button>
                      ) : (
                        <div className="space-y-2 p-2 rounded-lg border bg-muted/30">
                          <Input type="email" placeholder="email@exemplo.com" className="text-xs h-8" value={newAltEmail} onChange={e => setNewAltEmail(e.target.value)} />
                          <Input placeholder="Label (ex: AllGreen, Trabalho)" className="text-xs h-8" value={newAltLabel} onChange={e => setNewAltLabel(e.target.value)} />
                          <div className="flex gap-2">
                            <Button size="sm" className="flex-1 text-xs" onClick={handleAddAltEmail} disabled={!newAltEmail || addingAltEmail}>
                              {addingAltEmail ? "Salvando..." : "Salvar"}
                            </Button>
                            <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setShowAddAltEmail(false); setNewAltEmail(""); setNewAltLabel(""); }}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Materiais pessoais */}
                    <div className="space-y-3 pt-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Materiais pessoais</p>
                      {drawerPersonalMats.length === 0 ? (
                        <p className="text-xs text-muted-foreground font-light">Nenhum material pessoal adicionado.</p>
                      ) : (
                        drawerPersonalMats.map((pm: any) => (
                          <div key={pm.id} className="flex items-start justify-between gap-2 p-2 rounded-lg border text-xs">
                            <div>
                              <p className="font-bold">{pm.materials?.title || "—"}</p>
                              <p className="text-muted-foreground">{pm.materials?.type || ""}</p>
                              {pm.note && <p className="italic text-muted-foreground mt-0.5">{pm.note}</p>}
                            </div>
                          </div>
                        ))
                      )}
                      {!showAddPersonalMat ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs gap-1.5"
                          onClick={() => setShowAddPersonalMat(true)}
                        >
                          + Adicionar material pessoal
                        </Button>
                      ) : (
                        <div className="space-y-2 p-2 rounded-lg border bg-muted/30">
                          <select
                            className="w-full text-xs rounded border px-2 py-1.5 bg-background"
                            value={personalMatSelect}
                            onChange={e => setPersonalMatSelect(e.target.value)}
                          >
                            <option value="">Selecionar material…</option>
                            {materials.map((m: any) => (
                              <option key={m.id} value={m.id}>{m.title} ({m.type})</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="Observação (opcional)"
                            className="w-full text-xs rounded border px-2 py-1.5 bg-background"
                            value={personalMatNote}
                            onChange={e => setPersonalMatNote(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" className="flex-1 text-xs" onClick={addPersonalMaterial} disabled={!personalMatSelect || addingPersonalMat}>
                              {addingPersonalMat ? "Adicionando…" : "Adicionar"}
                            </Button>
                            <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setShowAddPersonalMat(false); setPersonalMatSelect(""); setPersonalMatNote(""); }}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Atualizar step */}
                    <div className="space-y-3 pt-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Step atual</p>
                      <div className="space-y-2">
                        <Select value={stepLevelId} onValueChange={setStepLevelId}>
                          <SelectTrigger className="text-xs h-8">
                            <SelectValue placeholder="Selecionar nível…" />
                          </SelectTrigger>
                          <SelectContent>
                            {levels.filter(l => l.language_id === selectedStudent?.languageId).map(l => (
                              <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {stepLevelId && (
                          <Select value={stepUnitId} onValueChange={setStepUnitId}>
                            <SelectTrigger className="text-xs h-8">
                              <SelectValue placeholder="Selecionar unidade…" />
                            </SelectTrigger>
                            <SelectContent>
                              {stepUnits.map(u => (
                                <SelectItem key={u.id} value={u.id}>Unidade {u.number} — {u.title}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {stepUnitId && (
                          <Select value={newStepId} onValueChange={setNewStepId}>
                            <SelectTrigger className="text-xs h-8">
                              <SelectValue placeholder="Selecionar step…" />
                            </SelectTrigger>
                            <SelectContent>
                              {stepSteps.map(s => (
                                <SelectItem key={s.id} value={s.id}>Step {s.number} — {s.title}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs"
                          disabled={!newStepId}
                          onClick={() => setConfirmStepOpen(true)}
                        >
                          Atualizar step
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </SheetContent>
            </Sheet>

            <AlertDialog open={confirmStepOpen} onOpenChange={setConfirmStepOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Atualizar step do aluno?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Todos os steps anteriores serão marcados como concluídos. O step selecionado será definido como o atual. Esta ação não pode ser desfeita facilmente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={updatingStep}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction disabled={updatingStep} onClick={handleUpdateStep}>
                    {updatingStep ? "Atualizando…" : "Confirmar"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </TabsContent>

          {/* ── Tab: Professores ──────────────────────────────────────────────── */}
          <TabsContent value="teachers" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{teachers.length} professor{teachers.length !== 1 ? "es" : ""}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate("/nivelamento")}>
                  <Globe className="h-4 w-4 mr-1" />Nivelamento
                </Button>
                <Dialog open={showNewTeacher} onOpenChange={open => { setShowNewTeacher(open); if (!open) { setTeacherTempPw(null); } }}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-primary text-white">
                      <Plus className="h-4 w-4 mr-1" />Novo professor
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Novo professor</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>Nome completo *</Label>
                        <Input value={newTeacherName} onChange={e => setNewTeacherName(e.target.value)} placeholder="Nome do professor" />
                      </div>
                      <div>
                        <Label>E-mail *</Label>
                        <Input value={newTeacherEmail} onChange={e => setNewTeacherEmail(e.target.value)} type="email" placeholder="email@stepsacademy.com.br" />
                      </div>
                      <div>
                        <Label>Idioma que leciona *</Label>
                        <Select value={newTeacherLangId} onValueChange={setNewTeacherLangId}>
                          <SelectTrigger><SelectValue placeholder="Selecione o idioma" /></SelectTrigger>
                          <SelectContent>
                            {languages.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      {teacherTempPw && (
                        <div className="rounded-lg bg-muted p-3 space-y-1">
                          <p className="text-xs text-muted-foreground font-light">Senha temporária — compartilhe com o professor:</p>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-mono font-bold">{teacherTempPw}</p>
                            <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(teacherTempPw); toast({ title: "Copiado!" }); }}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                      <Button onClick={handleCreateTeacher} disabled={creatingTeacher} className="w-full bg-primary text-white">
                        {creatingTeacher ? "Criando..." : "Criar professor"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
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
                  <Card key={t.id} className="cursor-pointer hover:border-[var(--theme-accent)]/40 transition-colors" onClick={() => navigate(`/admin/professor/${t.id}`)}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium">{t.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t.languages.join(", ") || "Sem idiomas"} · {t.studentCount} aluno{t.studentCount !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                          <Button variant="outline" size="sm" onClick={() => navigate(`/admin/professor/${t.id}`)}>
                            <Eye className="h-3 w-3 mr-1" />Ver
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setLinkTeacherId(t.id)}>
                            <Link2 className="h-3 w-3 mr-1" />Vincular
                          </Button>
                        </div>
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
                        if (selectedGroup?.id === g.id) { setSelectedGroup(null); setGroupStudents([]); setGrpStepLevelId(""); setGrpStepUnitId(""); setGrpNewStepId(""); }
                        else { setSelectedGroup(g); loadGroupStudents(g.id); setGrpStepLevelId(g.level_id || ""); setGrpStepUnitId(""); setGrpNewStepId(""); }
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
                            <Badge variant={g.active ? "default" : "secondary"} className={g.active ? "bg-[var(--theme-accent)] text-[var(--theme-text-on-accent)] text-[10px]" : "text-[10px]"}>
                              {g.active ? "ativa" : "inativa"}
                            </Badge>
                            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${selectedGroup?.id === g.id ? "rotate-90" : ""}`} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {selectedGroup?.id === g.id && (
                      <Card className="mt-1 border-[var(--theme-accent)]/20 bg-[var(--theme-accent)]/5">
                        <CardContent className="p-3 space-y-3">
                          {g.meet_link && (
                            <a href={g.meet_link} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--theme-brand-on-bg)] underline flex items-center gap-1">
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

                          {/* Step atual da turma */}
                          {groupStudents.length > 0 && (
                            <div className="space-y-2 pt-1 border-t">
                              <p className="text-xs font-bold pt-1">Step atual da turma</p>
                              <Select value={grpStepLevelId} onValueChange={setGrpStepLevelId}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar nível…" /></SelectTrigger>
                                <SelectContent>
                                  {levels.filter(l => l.language_id === g.language_id).map(l => (
                                    <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {grpStepLevelId && (
                                <Select value={grpStepUnitId} onValueChange={setGrpStepUnitId}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar unidade…" /></SelectTrigger>
                                  <SelectContent>
                                    {grpStepUnits.map(u => (
                                      <SelectItem key={u.id} value={u.id}>Unidade {u.number} — {u.title}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              {grpStepUnitId && (
                                <Select value={grpNewStepId} onValueChange={setGrpNewStepId}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar step…" /></SelectTrigger>
                                  <SelectContent>
                                    {grpStepSteps.map(s => (
                                      <SelectItem key={s.id} value={s.id}>Step {s.number} — {s.title}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full text-xs"
                                disabled={!grpNewStepId}
                                onClick={() => setConfirmGrpStepOpen(true)}
                              >
                                Atualizar turma inteira
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ))}
              </div>
            )}

            <AlertDialog open={confirmGrpStepOpen} onOpenChange={setConfirmGrpStepOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Atualizar step da turma?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Todos os steps anteriores de cada aluno desta turma serão marcados como concluídos. O step selecionado será definido como o atual para todos os {groupStudents.length} aluno(s).
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={updatingGrpStep}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction disabled={updatingGrpStep} onClick={handleUpdateGroupStep}>
                    {updatingGrpStep ? "Atualizando…" : "Confirmar"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </TabsContent>

          {/* ── Tab: Conteúdo ─────────────────────────────────────────────────── */}
          <TabsContent value="content" className="space-y-4">
            <Tabs defaultValue="materials">
              <TabsList className="w-full flex overflow-x-auto gap-1 h-auto p-1" style={{ justifyContent: "flex-start" }}>
                <TabsTrigger value="materials" className="shrink-0 text-xs px-3 py-1.5">Materiais</TabsTrigger>
                <TabsTrigger value="vocabulary" className="shrink-0 text-xs px-3 py-1.5">Vocabulário</TabsTrigger>
                <TabsTrigger value="exercises" className="shrink-0 text-xs px-3 py-1.5">Exercícios da Aula</TabsTrigger>
                <TabsTrigger value="exercise_bank" className="shrink-0 text-xs px-3 py-1.5">Banco de Exercícios</TabsTrigger>
                <TabsTrigger value="approvals" className="shrink-0 text-xs px-3 py-1.5">Aprovações</TabsTrigger>
                <TabsTrigger value="step_content" className="shrink-0 text-xs px-3 py-1.5">Por Passo</TabsTrigger>
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
                                  <Badge variant="default" className="bg-[var(--theme-accent)] text-[var(--theme-text-on-accent)] text-[10px] cursor-pointer">✓ Arquivo</Badge>
                                </a>
                              ) : (
                                <Badge variant="secondary" className="text-[10px]">Sem arquivo</Badge>
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
                            <Input value={newPartOfSpeech} onChange={e => setNewPartOfSpeech(e.target.value)} placeholder="Ex: substantivo, verbo..." />
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

              {/* Sub-tab: Banco de Exercícios */}
              <TabsContent value="exercise_bank" className="space-y-3 mt-3">
                {/* Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={bankFilterLang} onValueChange={v => { setBankFilterLang(v); setBankFilterLevel("all"); }}>
                    <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Idioma" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos idiomas</SelectItem>
                      {languages.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={bankFilterLevel} onValueChange={setBankFilterLevel}>
                    <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Nível" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos níveis</SelectItem>
                      {(bankFilterLang === "all" ? levels : filteredLevels(bankFilterLang)).map(l => (
                        <SelectItem key={l.id} value={l.id}>{l.code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={bankFilterType} onValueChange={setBankFilterType}>
                    <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os tipos</SelectItem>
                      <SelectItem value="fill_blank">Preencher lacuna</SelectItem>
                      <SelectItem value="association">Associação</SelectItem>
                      <SelectItem value="open_answer">Resposta aberta</SelectItem>
                      <SelectItem value="rewrite">Reescrita</SelectItem>
                      <SelectItem value="production">Produção</SelectItem>
                      <SelectItem value="dialogue">Diálogo</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="relative flex-1 min-w-[140px]">
                    <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Buscar enunciado…"
                      value={bankSearch}
                      onChange={e => setBankSearch(e.target.value)}
                      className="pl-7 h-8 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <Switch
                      id="bank-only-active"
                      checked={bankOnlyActive}
                      onCheckedChange={setBankOnlyActive}
                    />
                    <Label htmlFor="bank-only-active" className="text-xs cursor-pointer">Apenas ativos</Label>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={loadBankExercises}>
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>

                {/* Count */}
                <p className="text-xs text-muted-foreground">
                  {filteredBankExercises.length} exercício{filteredBankExercises.length !== 1 ? "s" : ""} encontrado{filteredBankExercises.length !== 1 ? "s" : ""}
                </p>

                {/* List */}
                {bankLoading ? (
                  <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded" />)}</div>
                ) : filteredBankExercises.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Library className="h-10 w-10 mb-2 opacity-30" />
                    <p className="text-sm">Nenhum exercício no banco.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {filteredBankExercises.map(ex => {
                      const level = levels.find(l => l.id === ex.level_id);
                      return (
                        <Card key={ex.id} className={cn(!ex.active && "opacity-50")}>
                          <CardContent className="p-3">
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <Badge variant="outline" className="text-[10px] shrink-0">{ex.type?.replace(/_/g, " ")}</Badge>
                                  {level && <span className="text-[10px] text-muted-foreground">{level.code}</span>}
                                  <span className="text-[10px] text-muted-foreground ml-auto">usado {ex.times_used || 0}×</span>
                                </div>
                                <p className="text-sm truncate">{(ex.question || "").slice(0, 90)}{(ex.question || "").length > 90 ? "…" : ""}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Switch
                                  checked={ex.active}
                                  onCheckedChange={() => handleToggleBankExActive(ex)}
                                  title={ex.active ? "Desativar" : "Ativar"}
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1 px-2"
                                  onClick={() => {
                                    setSelectedBankEx(ex);
                                    setBankAddLangId(""); setBankAddLevelId(""); setBankAddUnitId(""); setBankAddStepId("");
                                    setBankTagInput("");
                                    setBankDrawerOpen(true);
                                  }}
                                >
                                  <Eye className="h-3 w-3" />
                                  Detalhes
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}

                {/* Detail Drawer */}
                <Sheet open={bankDrawerOpen} onOpenChange={v => { setBankDrawerOpen(v); if (!v) setSelectedBankEx(null); }}>
                  <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto flex flex-col">
                    <SheetHeader>
                      <SheetTitle className="flex items-center gap-2">
                        <Library className="h-4 w-4" />
                        Exercício do Banco
                      </SheetTitle>
                    </SheetHeader>

                    {selectedBankEx && (
                      <div className="flex-1 space-y-5 py-4 overflow-y-auto">
                        {/* Status badge */}
                        <div className="flex items-center gap-2">
                          <Badge variant={selectedBankEx.active ? "default" : "secondary"}>
                            {selectedBankEx.active ? "Ativo" : "Inativo"}
                          </Badge>
                          <Badge variant="outline" className="text-xs">{selectedBankEx.type?.replace(/_/g, " ")}</Badge>
                          <span className="text-xs text-muted-foreground ml-auto">usado {selectedBankEx.times_used || 0}×</span>
                        </div>

                        {/* Level / Language */}
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Nível</p>
                          <p className="text-sm">{levels.find(l => l.id === selectedBankEx.level_id)?.name || "—"}</p>
                        </div>

                        {/* Question */}
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Enunciado</p>
                          <p className="text-sm whitespace-pre-wrap">{selectedBankEx.question}</p>
                        </div>

                        {/* Answer */}
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Resposta</p>
                          <p className="text-sm">{selectedBankEx.answer || "—"}</p>
                        </div>

                        {/* Explanation */}
                        {selectedBankEx.explanation && (
                          <div className="space-y-0.5">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Explicação</p>
                            <p className="text-sm text-muted-foreground">{selectedBankEx.explanation}</p>
                          </div>
                        )}

                        {/* Tags */}
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Tags {savingBankTags && <span className="font-normal normal-case">(salvando…)</span>}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {(selectedBankEx.tags || []).map((tag: string, idx: number) => (
                              <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-[var(--theme-accent)]/15 text-[var(--theme-brand-on-bg)] border border-[var(--theme-accent)]/30">
                                {tag}
                                <button onClick={() => handleRemoveBankTag(idx)} className="hover:text-destructive transition-colors">
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Nova tag…"
                              value={bankTagInput}
                              onChange={e => setBankTagInput(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter" && bankTagInput.trim()) {
                                  handleAddBankTag(bankTagInput);
                                  setBankTagInput("");
                                }
                              }}
                              className="h-8 text-xs flex-1"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-3 text-xs"
                              disabled={!bankTagInput.trim() || savingBankTags}
                              onClick={() => { handleAddBankTag(bankTagInput); setBankTagInput(""); }}
                            >
                              Adicionar
                            </Button>
                          </div>
                        </div>

                        {/* Toggle active */}
                        <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                          <Switch
                            checked={selectedBankEx.active}
                            onCheckedChange={() => handleToggleBankExActive(selectedBankEx)}
                          />
                          <div>
                            <p className="text-sm font-medium">{selectedBankEx.active ? "Exercício ativo" : "Exercício inativo"}</p>
                            <p className="text-xs text-muted-foreground">Exercícios inativos não aparecem para reutilização</p>
                          </div>
                        </div>

                        {/* Add to step */}
                        <div className="space-y-3 p-3 rounded-lg border bg-muted/10">
                          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Adicionar a um step</p>
                          <Select value={bankAddLangId} onValueChange={v => { setBankAddLangId(v); setBankAddLevelId(""); setBankAddUnitId(""); setBankAddStepId(""); }}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Idioma" /></SelectTrigger>
                            <SelectContent>
                              {languages.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Select value={bankAddLevelId} onValueChange={setBankAddLevelId} disabled={!bankAddLangId}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Nível" /></SelectTrigger>
                            <SelectContent>
                              {filteredLevels(bankAddLangId).map(l => <SelectItem key={l.id} value={l.id}>{l.name} ({l.code})</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Select value={bankAddUnitId} onValueChange={setBankAddUnitId} disabled={!bankAddLevelId || bankAddUnits.length === 0}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Unidade" /></SelectTrigger>
                            <SelectContent>
                              {bankAddUnits.map(u => <SelectItem key={u.id} value={u.id}>Unidade {u.number}{u.title ? ` — ${u.title}` : ""}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Select value={bankAddStepId} onValueChange={setBankAddStepId} disabled={!bankAddUnitId || bankAddSteps.length === 0}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Step" /></SelectTrigger>
                            <SelectContent>
                              {bankAddSteps.map(s => <SelectItem key={s.id} value={s.id}>Step {s.number}{s.title ? ` — ${s.title}` : ""}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            className="w-full text-xs gap-1.5"
                            disabled={!bankAddStepId || bankAddingToStep}
                            onClick={handleAddBankExToStep}
                          >
                            {bankAddingToStep ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                            Adicionar ao step
                          </Button>
                        </div>
                      </div>
                    )}
                  </SheetContent>
                </Sheet>
              </TabsContent>

              {/* Sub-tab: Aprovações */}
              <TabsContent value="approvals" className="mt-3">
                <AdminApprovalsTab />
              </TabsContent>

              {/* Sub-tab: Conteúdo por Passo */}
              <TabsContent value="step_content" className="mt-3">
                <AdminContentByStepTab />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* ── Tab: Notificações ─────────────────────────────────────────────── */}
          <TabsContent value="notifications" className="space-y-6">

            {/* ── Atividade dos alunos ── */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Atividade dos alunos
                    {adminNotifs.filter(n => !n.read).length > 0 && (
                      <span className="bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                        {adminNotifs.filter(n => !n.read).length} nova{adminNotifs.filter(n => !n.read).length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </CardTitle>
                  {adminNotifs.some(n => !n.read) && (
                    <Button size="sm" variant="ghost" className="text-xs h-7" onClick={markAllAdminNotifsRead}>
                      Marcar todas como lidas
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {adminNotifs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Nenhuma atividade ainda.</p>
                ) : (
                  <div className="divide-y">
                    {adminNotifs.map((n: any) => (
                      <div
                        key={n.id}
                        className={cn("flex items-start gap-3 py-3 cursor-pointer", !n.read && "bg-[var(--theme-accent)]/8 -mx-6 px-6 rounded")}
                        onClick={() => !n.read && markAdminNotifRead(n.id)}
                      >
                        <div className={cn("h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold",
                          n.type === "first_login" ? "bg-lime-500" : "bg-blue-500"
                        )}>
                          {n.type === "first_login" ? "🎉" : "🔑"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-tight">
                            {n.type === "first_login" ? "Primeiro acesso" : "Senha alterada"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {n.user_name || n.user_email || "Aluno desconhecido"}
                            {n.user_name && n.user_email && <span className="opacity-60"> · {n.user_email}</span>}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(n.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(n.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                          {!n.read && <span className="inline-block h-2 w-2 rounded-full bg-destructive mt-1" />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Push subscription tracker ── */}
            {pushPromptStats.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Push — Alunos que viram o modal
                    <span className="text-xs font-normal text-muted-foreground ml-1">
                      {pushPromptStats.filter(s => s.subscribed).length}/{pushPromptStats.length} ativaram
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="divide-y text-sm">
                    {pushPromptStats.map(s => (
                      <div key={s.student_id} className="flex items-center gap-3 py-2.5">
                        <div className={cn(
                          "h-2 w-2 rounded-full shrink-0",
                          s.subscribed ? "bg-green-500" : "bg-amber-400"
                        )} />
                        <span className="flex-1 font-medium truncate">{s.name}</span>
                        {s.subscribed ? (
                          <span className="text-xs text-green-600 font-medium shrink-0">Ativo</span>
                        ) : (
                          <span className="text-xs text-muted-foreground shrink-0">
                            {s.dismissed > 0
                              ? `Recusou ${s.dismissed}× · ${s.lastDismissed ? new Date(s.lastDismissed).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : ""}`
                              : `Viu ${s.shown}× · sem resposta`}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Configurações de notificações push</p>
              <Button size="sm" className="gap-1.5" onClick={() => setPushModalOpen(true)}>
                <Bell className="h-3.5 w-3.5" />
                Enviar notificação
              </Button>
            </div>

            {/* ── Manual push modal ── */}
            <Dialog open={pushModalOpen} onOpenChange={v => { setPushModalOpen(v); if (!v) { setPushTitle(""); setPushBody(""); setPushUrl("/"); setPushStudentId("all"); } }}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Enviar notificação push</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Destinatário</Label>
                    <Select value={pushStudentId} onValueChange={setPushStudentId}>
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Selecionar aluno…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">📢 Todos os alunos</SelectItem>
                        {students.filter(s => s.status === "active").map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.profile?.name || "—"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Título</Label>
                    <Input
                      value={pushTitle}
                      onChange={e => setPushTitle(e.target.value)}
                      placeholder="steps academy"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Mensagem</Label>
                    <Textarea
                      value={pushBody}
                      onChange={e => setPushBody(e.target.value)}
                      placeholder="Sua aula está disponível!"
                      className="text-sm resize-none"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">URL de destino (opcional)</Label>
                    <Input
                      value={pushUrl}
                      onChange={e => setPushUrl(e.target.value)}
                      placeholder="/"
                      className="text-sm"
                    />
                  </div>
                  <Button
                    className="w-full font-bold"
                    disabled={!pushTitle.trim() || !pushBody.trim() || sendingPush}
                    onClick={handleSendPush}
                  >
                    {sendingPush ? "Enviando…" : "Enviar notificação"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

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
            {/* Theme switcher */}
            <ThemeSwitcher />

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

            {/* Holidays management */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4" />Feriados nacionais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Select value={String(holidayYear)} onValueChange={v => setHolidayYear(Number(v))}>
                    <SelectTrigger className="h-8 w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2025, 2026, 2027].map(y => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">{holidays.length} feriados</span>
                </div>

                {loadingHolidays ? (
                  <Skeleton className="h-20 w-full" />
                ) : holidays.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum feriado cadastrado para {holidayYear}.</p>
                ) : (
                  <div className="space-y-0 max-h-72 overflow-y-auto">
                    {holidays.map(h => (
                      <div key={h.id} className="py-2 border-b last:border-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium text-xs shrink-0">
                              {new Date(h.date + "T12:00:00").toLocaleDateString("pt-BR")}
                            </span>
                            <span className="text-xs text-muted-foreground truncate">{h.name}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {h.cancelled_at ? (
                              <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded-full bg-muted">
                                {h.sessions_cancelled} canceladas
                              </span>
                            ) : (
                              <button
                                onClick={() => cancelHolidaySessions(h)}
                                disabled={cancellingHoliday === h.id}
                                className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                              >
                                {cancellingHoliday === h.id ? "..." : "Cancelar aulas"}
                              </button>
                            )}
                            <button
                              onClick={() => deleteHoliday(h.id)}
                              className="text-destructive/40 hover:text-destructive transition-colors p-1"
                              aria-label="Remover feriado"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        {h.message && (
                          <p className="text-[10px] text-muted-foreground font-light leading-snug line-clamp-2 pl-0.5">
                            {h.message}
                          </p>
                        )}
                        {h.cancelled_at && (
                          <p className="text-[10px] text-muted-foreground pl-0.5">
                            Processado em {new Date(h.cancelled_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2 pt-2 border-t">
                  <p className="text-xs font-medium">Adicionar feriado</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="date"
                      value={newHolidayDate}
                      onChange={e => setNewHolidayDate(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <Input
                      value={newHolidayName}
                      onChange={e => setNewHolidayName(e.target.value)}
                      placeholder="Nome do feriado"
                      className="h-8 text-xs"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={!newHolidayDate || !newHolidayName || savingHoliday}
                    onClick={addHoliday}
                  >
                    {savingHoliday ? "Adicionando..." : "Adicionar feriado"}
                  </Button>
                </div>
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
            <AdminPaymentsTab />
          </TabsContent>

          {/* ── Tab: Loja ────────────────────────────────────────────────────── */}
          <TabsContent value="store" className="space-y-4">
            <AdminStoreTab />
          </TabsContent>

          {/* ── Tab: Cadastros ──────────────────────────────────────────────── */}
          <TabsContent value="cadastros" className="space-y-6">

            {/* Registration link */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-[var(--theme-brand-on-bg)]" />
                  Link de Cadastro
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Compartilhe este link com novos alunos. O código curto é único por token — ao gerar um novo, o link anterior para de funcionar.
                </p>
                {regTokenLoading ? (
                  <div className="space-y-2">
                    <div className="h-10 rounded-md bg-muted animate-pulse" />
                    <div className="h-8 w-32 rounded-md bg-muted animate-pulse" />
                  </div>
                ) : regToken ? (
                  <>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={`https://stepsacademy.com.br/r/${regToken.slice(0, 8)}`}
                        className="text-sm font-medium text-foreground"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => {
                          navigator.clipboard.writeText(`https://stepsacademy.com.br/r/${regToken.slice(0, 8)}`);
                          toast({ title: "Link copiado!", description: "Cole e envie ao novo aluno." });
                        }}
                      >
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        Copiar
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={generateNewToken}
                      disabled={generatingToken}
                      className="text-muted-foreground text-xs"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${generatingToken ? "animate-spin" : ""}`} />
                      {generatingToken ? "Gerando…" : "Gerar novo link"}
                    </Button>
                  </>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Nenhum link ativo encontrado.</p>
                    <Button size="sm" onClick={generateNewToken} disabled={generatingToken}>
                      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${generatingToken ? "animate-spin" : ""}`} />
                      {generatingToken ? "Gerando…" : "Gerar link"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pending students */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Alunos Pendentes de Ativação
                  {pendingStudents.length > 0 && (
                    <span className="text-[11px] font-bold bg-orange-500 text-white rounded-full px-2 py-0.5 leading-none">
                      {pendingStudents.length}
                    </span>
                  )}
                </h3>
                <Button variant="ghost" size="sm" onClick={loadCadastros} className="text-xs text-muted-foreground">
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Atualizar
                </Button>
              </div>

              {pendingLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}
                </div>
              ) : pendingStudents.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-sm text-muted-foreground font-light">
                    Nenhum aluno aguardando ativação.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {pendingStudents.map(student => (
                    <Card key={student.id}>
                      <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-sm font-medium truncate">{student.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{student.email}</p>
                          {student.phone && (
                            <p className="text-xs text-muted-foreground">{student.phone}</p>
                          )}
                          <p className="text-[11px] text-muted-foreground/60">
                            Cadastrado em {new Date(student.created_at).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          className="shrink-0"
                          onClick={() => {
                            setActivatingStudent(student);
                            setActivateLangId("");
                            setActivateLevelId("");
                            setActivateDrawerOpen(true);
                          }}
                        >
                          <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                          Ativar
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Activation dialog */}
            <Dialog open={activateDrawerOpen} onOpenChange={setActivateDrawerOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Ativar aluno</DialogTitle>
                </DialogHeader>
                {activatingStudent && (
                  <div className="space-y-4 pt-1">
                    {/* Student info */}
                    <div className="rounded-lg bg-muted px-4 py-3 space-y-0.5">
                      <p className="text-sm font-semibold">{activatingStudent.name}</p>
                      <p className="text-xs text-muted-foreground">{activatingStudent.email}</p>
                      {activatingStudent.phone && (
                        <p className="text-xs text-muted-foreground">{activatingStudent.phone}</p>
                      )}
                    </div>

                    {/* Language select */}
                    <div className="space-y-2">
                      <Label>Idioma</Label>
                      <Select value={activateLangId} onValueChange={v => { setActivateLangId(v); setActivateLevelId(""); }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o idioma" />
                        </SelectTrigger>
                        <SelectContent>
                          {languages.map(l => (
                            <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Level select */}
                    <div className="space-y-2">
                      <Label>Nível</Label>
                      <Select
                        value={activateLevelId}
                        onValueChange={setActivateLevelId}
                        disabled={!activateLangId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={activateLangId ? "Selecione o nível" : "Selecione o idioma primeiro"} />
                        </SelectTrigger>
                        <SelectContent>
                          {levels
                            .filter(l => l.language_id === activateLangId)
                            .map(l => (
                              <SelectItem key={l.id} value={l.id}>{l.name} ({l.code})</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      className="w-full"
                      disabled={!activateLangId || !activateLevelId || activating}
                      onClick={handleActivateStudent}
                    >
                      {activating ? (
                        <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Ativando…</>
                      ) : (
                        <><UserCheck className="h-4 w-4 mr-2" />Confirmar ativação</>
                      )}
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>

          </TabsContent>

          </div>{/* end tab content */}
          </div>{/* end lg:flex wrapper */}
        </Tabs>
      </main>

      {/* ── Command Palette ─────────────────────────────────────────────────── */}
      <AdminCommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        students={students}
        teachers={teachers}
        groups={groups}
        onNavigate={(type, id) => {
          setPaletteOpen(false);
          if (type === "student") {
            const s = students.find(st => st.id === id);
            if (s) openStudentDrawer(s);
          } else if (type === "teacher") {
            navigate(`/admin/professor/${id}`);
          } else if (type === "group") {
            setActiveTab("groups");
          }
        }}
      />

      <AdminSuggestionsDrawer
        open={suggestionsOpen}
        onOpenChange={setSuggestionsOpen}
      />

      {/* ── Mobile nav drawer ─────────────────────────────────────────────────── */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="px-5 py-4 border-b">
            <SheetTitle className="text-left">
              <img src="/brand/logo-reto-darkpurple.webp" alt="steps academy" className="h-10 w-auto object-contain" />
            </SheetTitle>
          </SheetHeader>
          <nav className="p-3 space-y-0.5">
            {[
              { value: "overview",       label: "Visão Geral",   icon: LayoutGrid },
              { value: "students",       label: "Alunos",        icon: Users },
              { value: "teachers",       label: "Professores",   icon: GraduationCap },
              { value: "groups",         label: "Turmas",        icon: BookOpen },
              { value: "content",        label: "Conteúdo",      icon: FileText },
              { value: "notifications",  label: "Notificações",  icon: Bell },
              { value: "payments",       label: "Pagamentos",    icon: CreditCard },
              { value: "cadastros",      label: "Cadastros",     icon: UserCheck },
              { value: "store",          label: "Loja",          icon: ShoppingBag },
              { value: "settings",       label: "Config",        icon: Settings },
            ].map(item => (
              <button
                key={item.value}
                onClick={() => { setActiveTab(item.value); setMobileNavOpen(false); }}
                className={cn(
                  "flex items-center gap-3 text-sm px-3 py-2.5 rounded-md w-full text-left transition-colors",
                  activeTab === item.value
                    ? "bg-[var(--theme-accent)]/15 text-[var(--theme-brand-on-bg)] font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
                {item.value === "notifications" && adminNotifs.filter(n => !n.read).length > 0 && (
                  <span className="ml-auto bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                    {adminNotifs.filter(n => !n.read).length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Admin;
