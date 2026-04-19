import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      scopes: "openid email profile https://www.googleapis.com/auth/calendar.events",
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) throw error;
}

interface Profile {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  avatar_url: string | null;
  force_password_change: boolean | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isActivated: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  isActivated: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isActivated, setIsActivated] = useState(true);

  // Busca o perfil e, para alunos, verifica se já foi ativado pelo admin
  const fetchProfile = async (userId: string) => {
    try {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, name, role, phone, avatar_url, force_password_change")
        .eq("id", userId)
        .single();

      setProfile(profileData);

      if (profileData?.role === "student") {
        const { data: studentData } = await supabase
          .from("students")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        setIsActivated(!!studentData);
      } else {
        // Admins e teachers nunca ficam bloqueados
        setIsActivated(true);
      }
    } catch {
      setProfile(null);
      setIsActivated(true);
    } finally {
      setLoading(false);
    }
  };

  // Inicialização: lê sessão do storage e escuta mudanças de auth
  // O callback NÃO é async para não bloquear signInWithPassword
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Busca o perfil sempre que o userId mudar (login, troca de conta)
  useEffect(() => {
    if (!session?.user?.id) return;
    setLoading(true);
    fetchProfile(session.user.id);
  }, [session?.user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, isActivated, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
