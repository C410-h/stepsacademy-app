import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { THEMES, ThemeKey, applyTheme } from "@/lib/themes";

interface ThemeContextValue {
  theme: ThemeKey;
  setTheme: (key: ThemeKey) => void;
  themes: typeof THEMES;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "hello",
  setTheme: () => {},
  themes: THEMES,
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { session } = useAuth();
  const [theme, setThemeState] = useState<ThemeKey>("hello");

  // Apply hello immediately on mount to avoid FOUC
  useEffect(() => {
    applyTheme("hello");
  }, []);

  // Load user's saved theme when session is available
  useEffect(() => {
    if (!session?.user?.id) return;
    supabase
      .from("profiles")
      .select("theme")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        const key = (data?.theme as ThemeKey) ?? "hello";
        setThemeState(key);
        applyTheme(key);
      });
  }, [session?.user?.id]);

  const setTheme = (key: ThemeKey) => {
    applyTheme(key);       // instant — no re-render needed for colors
    setThemeState(key);    // update state for UI
    if (session?.user?.id) {
      supabase
        .from("profiles")
        .update({ theme: key })
        .eq("id", session.user.id)
        .then(() => {});   // fire and forget
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
};
