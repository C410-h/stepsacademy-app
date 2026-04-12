import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface GamificationData {
  studentId: string | null;
  xp_total: number;
  coins: number;
  streak_current: number;
  streak_best: number;
  last_activity_date: string | null;
}

interface GamificationContextType {
  gamification: GamificationData;
  refresh: () => Promise<void>;
  loading: boolean;
}

const defaultGamification: GamificationData = {
  studentId: null,
  xp_total: 0,
  coins: 0,
  streak_current: 0,
  streak_best: 0,
  last_activity_date: null,
};

const GamificationContext = createContext<GamificationContextType>({
  gamification: defaultGamification,
  refresh: async () => {},
  loading: false,
});

export const GamificationProvider = ({ children }: { children: ReactNode }) => {
  const { profile } = useAuth();
  const [gamification, setGamification] = useState<GamificationData>(defaultGamification);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!profile || profile.role !== "student") return;

    const { data: student } = await supabase
      .from("students")
      .select("id")
      .eq("user_id", profile.id)
      .maybeSingle();

    if (!student) return;

    const { data: gami } = await (supabase as any)
      .from("student_gamification")
      .select("xp_total, coins, streak_current, streak_best, last_activity_date")
      .eq("student_id", student.id)
      .maybeSingle();

    setGamification({
      studentId: student.id,
      xp_total: gami?.xp_total ?? 0,
      coins: gami?.coins ?? 0,
      streak_current: gami?.streak_current ?? 0,
      streak_best: gami?.streak_best ?? 0,
      last_activity_date: gami?.last_activity_date ?? null,
    });
  }, [profile]);

  useEffect(() => {
    if (!profile || profile.role !== "student") {
      setGamification(defaultGamification);
      return;
    }
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [profile, refresh]);

  return (
    <GamificationContext.Provider value={{ gamification, refresh, loading }}>
      {children}
    </GamificationContext.Provider>
  );
};

export const useGamification = () => useContext(GamificationContext);
