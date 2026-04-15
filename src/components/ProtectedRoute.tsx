import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import SplashScreen from "@/components/SplashScreen";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
}

const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { session, profile, loading, isActivated } = useAuth();
  const location = useLocation();

  if (loading) {
    return <SplashScreen />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Força troca de senha no primeiro acesso
  const mustChangePassword = session.user?.user_metadata?.must_change_password === true;
  if (mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  // Aluno ainda não ativado pelo admin → tela de espera
  if (profile?.role === "student" && !isActivated) {
    return <Navigate to="/aguardando-ativacao" replace />;
  }

  if (requiredRole && profile?.role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
