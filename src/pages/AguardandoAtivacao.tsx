import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

const AguardandoAtivacao = () => {
  const { session, profile, isActivated, loading, signOut } = useAuth();
  const navigate = useNavigate();

  // Se não há sessão → login
  // Se já foi ativado → plataforma
  // Se for admin/teacher → não deveria estar aqui
  useEffect(() => {
    if (loading) return;
    if (!session) { navigate("/login", { replace: true }); return; }
    if (!profile) return;
    if (profile.role !== "student" || isActivated) {
      navigate("/", { replace: true });
    }
  }, [session, profile, isActivated, loading, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar with logout */}
      <header className="flex justify-end px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          className="text-muted-foreground gap-1.5"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        {/* Logo */}
        <img
          src="/brand/pwa-icon.webp"
          alt="steps academy"
          className="h-20 w-20 rounded-[22px] shadow-lg mb-8"
        />

        {/* Steppie mascot */}
        <img
          src="/steppie/steppie-orgulhoso.webp"
          alt=""
          aria-hidden="true"
          className="h-44 mb-8 drop-shadow-xl"
          style={{ animation: "steppieFloat 3s ease-in-out infinite" }}
        />

        {/* Text */}
        <div className="max-w-sm space-y-3">
          <h1 className="text-2xl font-bold text-foreground">
            Sua conta está quase pronta!
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Seu cadastro foi recebido com sucesso. Em breve um de nossos
            professores irá configurar sua conta e você receberá acesso à
            plataforma. Qualquer dúvida, fale com a gente pelo WhatsApp.
          </p>
        </div>

        {/* WhatsApp button */}
        <a
          href="https://wa.me/5521969260979"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-full font-medium text-sm transition-opacity hover:opacity-90"
          style={{ background: "#25D366", color: "#fff" }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          Falar no WhatsApp
        </a>
      </div>
    </div>
  );
};

export default AguardandoAtivacao;
