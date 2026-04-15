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
import TeacherProfilePage from "./pages/TeacherProfile";
import AdminTeacherDetail from "./pages/AdminTeacherDetail";
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
import Loja from "./pages/Loja";
import Certificado from "./pages/Certificado";
import Planos from "./pages/Planos";
import Cadastro from "./pages/Cadastro";
import NotFound from "./pages/NotFound";
import { Navigate } from "react-router-dom";

const queryClient = new QueryClient();

const HomeRedirect = () => {
  const { profile, loading, session } = useAuth();
  if (loading) return <SplashScreen />;
  if (!session) return <LandingPage />;
  if (!profile) return <SplashScreen />;
  if (profile.role === "admin") return <Navigate to="/admin" replace />;
  if (profile.role === "teacher") return <Navigate to="/teacher" replace />;
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
              <Route path="/perfil-professor" element={<ProtectedRoute requiredRole="teacher"><TeacherProfilePage /></ProtectedRoute>} />
              <Route path="/admin/professor/:id" element={<ProtectedRoute requiredRole="admin"><AdminTeacherDetail /></ProtectedRoute>} />
              <Route path="/nivelamento" element={<ProtectedRoute><Nivelamento /></ProtectedRoute>} />
              <Route path="/loja" element={<ProtectedRoute><Loja /></ProtectedRoute>} />
              <Route path="/certificado/:id" element={<Certificado />} />
              <Route path="/planos" element={<Planos />} />
              <Route path="/cadastro" element={<Cadastro />} />
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
