import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { PaymentAlertProvider } from "@/contexts/PaymentAlertContext";
import SplashScreen from "@/components/SplashScreen";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
}

interface StudentPaymentInfo {
  payment_status: string;
  is_corporate: boolean;
  overdue_since: string | null;
}

const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { session, profile, loading, isActivated } = useAuth();
  const location = useLocation();

  const [paymentInfo, setPaymentInfo] = useState<StudentPaymentInfo | null>(null);
  const [paymentChecked, setPaymentChecked] = useState(false);

  useEffect(() => {
    if (!profile) return; // wait for profile to load

    if (profile.role !== "student" || !session) {
      setPaymentChecked(true);
      return;
    }
    (supabase as any)
      .from("students")
      .select("payment_status, is_corporate, overdue_since")
      .eq("user_id", profile.id)
      .maybeSingle()
      .then(({ data }: { data: StudentPaymentInfo | null }) => {
        setPaymentInfo(data);
        setPaymentChecked(true);
      })
      .catch(() => {
        setPaymentChecked(true);
      });
  }, [profile?.id]);

  // Show splash while auth loading OR while waiting for payment check (for students)
  const waitingForPaymentCheck = profile?.role === "student" && !paymentChecked;
  if (loading || waitingForPaymentCheck) {
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

  // Lógica de inadimplência apenas para estudantes após o check
  if (profile?.role === "student" && paymentChecked && paymentInfo) {
    const { payment_status, is_corporate, overdue_since } = paymentInfo;

    // Corporativos (AllGreen) passam sem restrição
    if (!is_corporate && payment_status === "overdue" && overdue_since) {
      const diasOverdue = differenceInDays(new Date(), new Date(overdue_since));

      if (diasOverdue > 5 && location.pathname !== "/acesso-suspenso") {
        return <Navigate to="/acesso-suspenso" replace />;
      }

      // Até 5 dias: deixa passar mas com alerta
      return (
        <PaymentAlertProvider value={{ showPaymentAlert: true, diasOverdue, isCorporate: false }}>
          {children}
        </PaymentAlertProvider>
      );
    }
  }

  return (
    <PaymentAlertProvider value={{ showPaymentAlert: false, diasOverdue: 0, isCorporate: paymentInfo?.is_corporate ?? false }}>
      {children}
    </PaymentAlertProvider>
  );
};

export default ProtectedRoute;
