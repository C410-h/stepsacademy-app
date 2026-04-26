import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { GamificationProvider } from "@/contexts/GamificationContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import SplashScreen from "@/components/SplashScreen";
import AdminTeacherDetail from "./pages/AdminTeacherDetail";
import AdminUITest from "./pages/AdminUITest";
import LandingPage from "./pages/LandingPage";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import ChangePassword from "./pages/ChangePassword";
import Dashboard from "./pages/Dashboard";
import AulaPage from "./pages/AulaPage";
import ProgressPage from "./pages/ProgressPage";
import Help from "./pages/Help";
import Admin from "./pages/Admin";
import Teacher from "./pages/Teacher";
import StepByStep from "./pages/StepByStep";
import Perfil from "./pages/Perfil";
import Nivelamento from "./pages/Nivelamento";
import Recompensas from "./pages/Recompensas";
import Certificado from "./pages/Certificado";
import Planos from "./pages/Planos";
import Cadastro from "./pages/Cadastro";
import ShortLink from "./pages/ShortLink";
import AuthCallback from "./pages/AuthCallback";
import AguardandoAtivacao from "./pages/AguardandoAtivacao";
import AcessoSuspensoPage from "./pages/AcessoSuspensoPage";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import NotFound from "./pages/NotFound";
import { Navigate } from "react-router-dom";

const queryClient = new QueryClient();

const HomeRedirect = () => {
  const { profile, loading, session, isActivated } = useAuth();
  if (loading) return <SplashScreen />;
  if (!session) return <LandingPage />;
  if (!profile) return <SplashScreen />;
  if (profile.role === "admin") return <Navigate to="/admin" replace />;
  if (profile.role === "teacher") return <Navigate to="/teacher" replace />;
  // Force password change must happen before activation check so temp-password
  // users are redirected even before their account is fully activated.
  // We ONLY check user_metadata (GoTrue JWT) — the profiles.force_password_change
  // DB column can silently fail to update due to RLS, causing a redirect loop.
  const mustChangePassword =
    session.user?.user_metadata?.must_change_password === true;
  if (mustChangePassword) return <Navigate to="/change-password" replace />;
  if (profile.role === "student" && !isActivated) return <Navigate to="/aguardando-ativacao" replace />;
  return <Dashboard />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <GamificationProvider>
              <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
              <Route path="/" element={<HomeRedirect />} />
              <Route path="/aula" element={<ProtectedRoute><AulaPage /></ProtectedRoute>} />
              <Route path="/materiais" element={<Navigate to="/aula" replace />} />
              <Route path="/exercicios-da-aula" element={<Navigate to="/aula" replace />} />
              <Route path="/progresso" element={<ProtectedRoute><ProgressPage /></ProtectedRoute>} />
              <Route path="/ajuda" element={<ProtectedRoute><Help /></ProtectedRoute>} />
              <Route path="/step-by-step" element={<ProtectedRoute><StepByStep /></ProtectedRoute>} />
              <Route path="/perfil" element={<ProtectedRoute><Perfil /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><Admin /></ProtectedRoute>} />
              <Route path="/teacher" element={<ProtectedRoute requiredRole="teacher"><Teacher /></ProtectedRoute>} />
              <Route path="/perfil-professor" element={<Navigate to="/teacher?tab=profile" replace />} />
              <Route path="/admin/professor/:id" element={<ProtectedRoute requiredRole="admin"><AdminTeacherDetail /></ProtectedRoute>} />
              <Route path="/nivelamento" element={<ProtectedRoute><Nivelamento /></ProtectedRoute>} />
              <Route path="/recompensas" element={<ProtectedRoute><Recompensas /></ProtectedRoute>} />
              <Route path="/loja" element={<Navigate to="/recompensas" replace />} />
              <Route path="/ranking" element={<Navigate to="/recompensas?tab=ranking" replace />} />
              <Route path="/certificado/:id" element={<Certificado />} />
              <Route path="/planos" element={<Planos />} />
              <Route path="/cadastro" element={<Cadastro />} />
              <Route path="/r/:code" element={<ShortLink />} />
              <Route path="/aguardando-ativacao" element={<AguardandoAtivacao />} />
              <Route path="/acesso-suspenso" element={<AcessoSuspensoPage />} />
              <Route path="/privacidade" element={<PrivacyPolicy />} />
              <Route path="/termos" element={<TermsOfService />} />
              <Route path="/admin-ui-test" element={<AdminUITest />} />
              <Route path="*" element={<NotFound />} />
              </Routes>
            </GamificationProvider>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
