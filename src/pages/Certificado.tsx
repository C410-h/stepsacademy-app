import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer } from "lucide-react";

interface CertData {
  id: string;
  certificate_number: string;
  student_name: string;
  level_name: string;
  language_name: string;
  issued_at: string;
}

const Certificado = () => {
  const { id } = useParams<{ id: string }>();
  const [cert, setCert] = useState<CertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadCert();
  }, [id]);

  const loadCert = async () => {
    const { data } = await (supabase as any)
      .from("certificates")
      .select("id, certificate_number, student_name, level_name, language_name, issued_at")
      .eq("id", id)
      .maybeSingle();
    if (data) setCert(data);
    else setNotFound(true);
    setLoading(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#15012A" }}>
      <div className="space-y-4 w-full max-w-2xl p-8">
        <Skeleton className="h-8 w-48 mx-auto" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  );

  if (notFound || !cert) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#15012A", color: "#fff" }}>
      <div className="text-center space-y-3">
        <p className="text-4xl">🎓</p>
        <p className="text-lg font-bold">Certificado não encontrado</p>
        <p className="text-sm opacity-60">Verifique se o link está correto.</p>
      </div>
    </div>
  );

  const formattedDate = new Date(cert.issued_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 gap-6" style={{ background: "#15012A", fontFamily: "'Libre Franklin', sans-serif" }}>
      {/* Print button — hidden when printing */}
      <div className="flex gap-3 print:hidden">
        <Button
          onClick={() => window.print()}
          className="gap-2 font-bold"
          style={{ background: "#C1FE00", color: "#1D1D1B" }}
        >
          <Printer className="h-4 w-4" />
          Baixar certificado
        </Button>
      </div>

      {/* Certificate card */}
      <div
        id="certificate"
        className="w-full max-w-4xl rounded-2xl relative overflow-hidden print:rounded-none print:max-w-none print:w-full"
        style={{ background: "#15012A", border: "4px solid #C1FE00", aspectRatio: "1.414 / 1" /* A4 landscape */ }}
      >
        {/* Corner decorations */}
        <div className="absolute top-0 left-0 w-24 h-24 border-r-0 border-b-0" style={{ borderTop: "4px solid #C1FE00", borderLeft: "4px solid #C1FE00", borderRadius: "12px 0 0 0" }} />
        <div className="absolute top-0 right-0 w-24 h-24" style={{ borderTop: "4px solid #C1FE00", borderRight: "4px solid #C1FE00", borderRadius: "0 12px 0 0" }} />
        <div className="absolute bottom-0 left-0 w-24 h-24" style={{ borderBottom: "4px solid #C1FE00", borderLeft: "4px solid #C1FE00", borderRadius: "0 0 0 12px" }} />
        <div className="absolute bottom-0 right-0 w-24 h-24" style={{ borderBottom: "4px solid #C1FE00", borderRight: "4px solid #C1FE00", borderRadius: "0 0 12px 0" }} />

        {/* Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-12 space-y-4" style={{ color: "#fff" }}>
          {/* Logo */}
          <div className="space-y-0.5">
            <img src="/brand/logo-over-lime.webp" alt="steps academy" className="h-14 mx-auto" />
            <div className="h-px w-16 mx-auto" style={{ background: "#C1FE00", opacity: 0.4 }} />
          </div>

          {/* Cert text */}
          <div className="space-y-2">
            <p className="text-sm font-light opacity-70 tracking-widest uppercase">Certificamos que</p>
            <p className="text-4xl font-black" style={{ letterSpacing: "-0.02em" }}>{cert.student_name}</p>
            <p className="text-sm font-light opacity-70">concluiu com êxito o curso de</p>
            <p className="text-2xl font-bold" style={{ color: "#C1FE00" }}>
              {cert.language_name} · {cert.level_name}
            </p>
          </div>

          {/* Footer info */}
          <div className="space-y-1 pt-2">
            <p className="text-xs opacity-50">Emitido em {formattedDate}</p>
            <p className="text-[10px] opacity-30 font-mono tracking-wider">{cert.certificate_number}</p>
          </div>

          {/* Decorative seal */}
          <div className="absolute bottom-8 right-12 w-16 h-16 rounded-full flex items-center justify-center text-2xl" style={{ background: "rgba(193,254,0,0.12)", border: "2px solid rgba(193,254,0,0.3)" }}>
            🎓
          </div>
        </div>
      </div>

      {/* Print CSS */}
      <style>{`
        @media print {
          body { background: #15012A !important; margin: 0; padding: 0; }
          #certificate { width: 100vw !important; height: 100vh !important; aspect-ratio: unset !important; border-radius: 0 !important; }
        }
      `}</style>
    </div>
  );
};

export default Certificado;
