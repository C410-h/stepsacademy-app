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
import { toast } from "@/hooks/use-toast";
import { Plus, Upload, LogOut, Users } from "lucide-react";
import { Navigate } from "react-router-dom";

interface StudentRow {
  id: string;
  status: string;
  currentStepNumber: number;
  profile: { name: string } | null;
  language: { name: string } | null;
  level: { name: string; code: string } | null;
  teacherName: string | null;
}

interface LangOption { id: string; name: string; }
interface LevelOption { id: string; name: string; code: string; language_id: string; }

const Admin = () => {
  const { profile, signOut } = useAuth();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [languages, setLanguages] = useState<LangOption[]>([]);
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [loading, setLoading] = useState(true);

  // New student form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newLangId, setNewLangId] = useState("");
  const [newLevelId, setNewLevelId] = useState("");
  const [creatingStudent, setCreatingStudent] = useState(false);
  const [showNewStudent, setShowNewStudent] = useState(false);

  // Upload material form
  const [matTitle, setMatTitle] = useState("");
  const [matLangId, setMatLangId] = useState("");
  const [matLevelId, setMatLevelId] = useState("");
  const [matType, setMatType] = useState("vocab");
  const [matDelivery, setMatDelivery] = useState("before");
  const [matFile, setMatFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [{ data: langs }, { data: lvls }, { data: studs }] = await Promise.all([
      supabase.from("languages").select("id, name").eq("active", true),
      supabase.from("levels").select("id, name, code, language_id"),
      supabase.from("students").select("id, status, current_step_id, user_id, language_id, level_id"),
    ]);

    setLanguages(langs || []);
    setLevels(lvls || []);

    if (studs) {
      const rows: StudentRow[] = [];
      for (const s of studs) {
        let profileData = null;
        let langData = null;
        let levelData = null;
        let teacherName: string | null = null;
        let stepNum = 0;

        if (s.user_id) {
          const { data: p } = await supabase.from("profiles").select("name").eq("id", s.user_id).single();
          profileData = p;
        }
        if (s.language_id) {
          langData = (langs || []).find(l => l.id === s.language_id) || null;
        }
        if (s.level_id) {
          levelData = (lvls || []).find(l => l.id === s.level_id) || null;
        }
        if (s.current_step_id) {
          const { data: step } = await supabase.from("steps").select("number").eq("id", s.current_step_id).single();
          stepNum = step?.number || 0;
        }

        const { data: ts } = await supabase
          .from("teacher_students")
          .select("teacher_id, teachers(user_id)")
          .eq("student_id", s.id)
          .limit(1)
          .single();

        if (ts?.teachers) {
          const { data: tp } = await supabase.from("profiles").select("name").eq("id", (ts.teachers as any).user_id).single();
          teacherName = tp?.name || null;
        }

        rows.push({
          id: s.id,
          status: s.status,
          currentStepNumber: stepNum,
          profile: profileData,
          language: langData ? { name: langData.name } : null,
          level: levelData ? { name: levelData.name, code: levelData.code } : null,
          teacherName,
        });
      }
      setStudents(rows);
    }
    setLoading(false);
  };

  const handleCreateStudent = async () => {
    if (!newName || !newEmail || !newLangId || !newLevelId) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    setCreatingStudent(true);

    // Create auth user via admin (would need edge function in production)
    // For now, invite user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: newEmail,
      password: crypto.randomUUID().slice(0, 12),
      options: { data: { name: newName, role: "student" } },
    });

    if (authError || !authData.user) {
      toast({ title: "Erro ao criar usuário", description: authError?.message || "Tente novamente.", variant: "destructive" });
      setCreatingStudent(false);
      return;
    }

    // Update profile phone
    if (newPhone) {
      await supabase.from("profiles").update({ phone: newPhone }).eq("id", authData.user.id);
    }

    // Create student record
    await supabase.from("students").insert({
      user_id: authData.user.id,
      language_id: newLangId,
      level_id: newLevelId,
    });

    toast({ title: "Aluno criado com sucesso!" });
    setShowNewStudent(false);
    setNewName(""); setNewEmail(""); setNewPhone(""); setNewLangId(""); setNewLevelId("");
    setCreatingStudent(false);
    loadData();
  };

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
      title: matTitle,
      type: matType,
      delivery: matDelivery,
      level_id: matLevelId,
      file_url: urlData.publicUrl,
      filename: matFile.name,
    }]);

    toast({ title: "Material enviado com sucesso!" });
    setShowUpload(false);
    setMatTitle(""); setMatFile(null);
    setUploading(false);
  };

  if (profile?.role !== "admin") return <Navigate to="/" replace />;

  const filteredLevels = (langId: string) => levels.filter(l => l.language_id === langId);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-background border-b">
        <span className="text-lg font-bold text-primary">steps academy</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-light">Admin</span>
          <Button variant="ghost" size="icon" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
        </div>
      </header>

      <main className="px-4 py-4 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2"><Users className="h-5 w-5" /> Alunos</h2>
          <div className="flex gap-2">
            <Dialog open={showNewStudent} onOpenChange={setShowNewStudent}>
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
                </div>
              </DialogContent>
            </Dialog>

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
                  <div>
                    <Label>Arquivo (PDF ou MP3) *</Label>
                    <Input type="file" accept=".pdf,.mp3" onChange={e => setMatFile(e.target.files?.[0] || null)} />
                  </div>
                  <Button className="w-full" onClick={handleUploadMaterial} disabled={uploading}>
                    {uploading ? "Enviando..." : "Enviar material"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? (
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
      </main>
    </div>
  );
};

export default Admin;
