import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const WA_LINK = "https://wa.me/5521999999999";

// ─── Steppie placeholder SVG ─────────────────────────────────────────────────
const Steppie = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 200 260" className={className} fill="none">
    {/* Body blob */}
    <ellipse cx="100" cy="140" rx="70" ry="90" fill="#FF97CB" />
    {/* Eyes */}
    <ellipse cx="78" cy="115" rx="10" ry="12" fill="#520A70" />
    <ellipse cx="122" cy="115" rx="10" ry="12" fill="#520A70" />
    {/* Eye highlights */}
    <ellipse cx="82" cy="110" rx="4" ry="5" fill="white" />
    <ellipse cx="126" cy="110" rx="4" ry="5" fill="white" />
    {/* Smile */}
    <path d="M 72 140 Q 100 170 128 140" stroke="#520A70" strokeWidth="4" strokeLinecap="round" fill="none" />
    {/* Left arm pointing */}
    <path d="M 32 130 Q 10 120 -5 100" stroke="#FF97CB" strokeWidth="14" strokeLinecap="round" />
    <circle cx="-5" cy="97" r="6" fill="#FF97CB" />
    {/* Right arm pointing forward */}
    <path d="M 168 125 Q 195 105 215 90" stroke="#FF97CB" strokeWidth="14" strokeLinecap="round" />
    <circle cx="218" cy="88" r="6" fill="#FF97CB" />
    {/* Legs */}
    <ellipse cx="78" cy="225" rx="18" ry="14" fill="#520A70" />
    <ellipse cx="122" cy="225" rx="18" ry="14" fill="#520A70" />
  </svg>
);

// ─── Decorative Curves SVG ───────────────────────────────────────────────────
const CurveTopRight = ({ color = "#C1FE00", className }: { color?: string; className?: string }) => (
  <svg viewBox="0 0 400 300" className={className} fill="none" preserveAspectRatio="none">
    <path d="M 250 -20 Q 350 50 380 180 Q 400 280 450 320" stroke={color} strokeWidth="14" strokeLinecap="round" />
    <path d="M 300 -40 Q 380 30 420 150 Q 440 230 480 280" stroke={color} strokeWidth="10" strokeLinecap="round" opacity="0.5" />
  </svg>
);

const CurveBottomLeft = ({ color = "#C1FE00", className }: { color?: string; className?: string }) => (
  <svg viewBox="0 0 400 300" className={className} fill="none" preserveAspectRatio="none">
    <path d="M -30 200 Q 50 120 150 100 Q 250 80 300 -20" stroke={color} strokeWidth="14" strokeLinecap="round" />
    <path d="M -50 250 Q 30 170 120 140 Q 220 120 260 20" stroke={color} strokeWidth="10" strokeLinecap="round" opacity="0.5" />
  </svg>
);

const CurveRight = ({ color = "#FF1F9F", className }: { color?: string; className?: string }) => (
  <svg viewBox="0 0 200 400" className={className} fill="none" preserveAspectRatio="none">
    <path d="M 150 0 Q 200 100 180 200 Q 160 300 220 400" stroke={color} strokeWidth="12" strokeLinecap="round" />
    <path d="M 180 -20 Q 230 80 210 180 Q 190 280 250 380" stroke={color} strokeWidth="8" strokeLinecap="round" opacity="0.4" />
  </svg>
);

// ─── Navbar ──────────────────────────────────────────────────────────────────
const Navbar = () => {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id: string) => {
    setMobileOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <nav className={cn(
      "fixed top-0 inset-x-0 z-50 transition-all duration-300",
      scrolled ? "bg-steps-black shadow-lg" : "bg-transparent"
    )}>
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex flex-col leading-none">
          <span className="text-xl font-black text-white tracking-tight">steps</span>
          <span className="text-xs font-bold text-white/80 -mt-0.5 tracking-wide">academy</span>
        </button>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6">
          <button onClick={() => scrollTo("diferenciais")} className="text-sm text-white/80 hover:text-white transition-colors font-light">por que a steps</button>
          <button onClick={() => scrollTo("cursos")} className="text-sm text-white/80 hover:text-white transition-colors font-light">cursos</button>
          <button onClick={() => scrollTo("jornada")} className="text-sm text-white/80 hover:text-white transition-colors font-light">jornada</button>
          <button onClick={() => scrollTo("como-funciona")} className="text-sm text-white/80 hover:text-white transition-colors font-light">como funciona</button>
          <Button variant="outline" onClick={() => navigate("/login")}
            className="border-white/40 text-white bg-transparent hover:bg-white/10 hover:text-white rounded-full px-5 text-sm font-bold">
            entrar
          </Button>
        </div>

        {/* Mobile */}
        <div className="flex md:hidden items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/login")}
            className="border-white/40 text-white bg-transparent hover:bg-white/10 hover:text-white rounded-full px-4 text-xs font-bold">
            entrar
          </Button>
          <button onClick={() => setMobileOpen(!mobileOpen)} className="text-white p-1">
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-steps-black border-t border-white/10 px-4 py-4 space-y-3">
          <button onClick={() => scrollTo("diferenciais")} className="block text-sm text-white/80 font-light">por que a steps</button>
          <button onClick={() => scrollTo("cursos")} className="block text-sm text-white/80 font-light">cursos</button>
          <button onClick={() => scrollTo("jornada")} className="block text-sm text-white/80 font-light">jornada</button>
          <button onClick={() => scrollTo("como-funciona")} className="block text-sm text-white/80 font-light">como funciona</button>
        </div>
      )}
    </nav>
  );
};

// ─── Hero ────────────────────────────────────────────────────────────────────
const Hero = () => (
  <section className="relative min-h-screen flex items-center overflow-hidden bg-magenta pt-16">
    <CurveTopRight className="absolute top-0 right-0 w-[50%] h-[60%] pointer-events-none" />
    <CurveBottomLeft className="absolute bottom-0 left-0 w-[40%] h-[50%] pointer-events-none" />

    <div className="container mx-auto px-4 py-12 flex flex-col lg:flex-row items-center gap-8 relative z-10">
      <div className="flex-1 space-y-6 text-center lg:text-left">
        <p className="text-sm font-light text-white/80 tracking-wider">escola de idiomas · aulas ao vivo</p>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-tight">
          Do zero à fluência, com método e aulas ao vivo.
        </h1>
        <p className="text-base md:text-lg text-white/90 font-normal max-w-lg mx-auto lg:mx-0">
          Professor real. Vínculo real. Resultado que dá para medir.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
          <a href={WA_LINK} target="_blank" rel="noopener noreferrer">
            <Button className="bg-lime text-steps-black hover:bg-lime/90 rounded-full px-8 py-6 text-base font-bold w-full sm:w-auto">
              quero minha aula gratuita
            </Button>
          </a>
          <button onClick={() => document.getElementById("cursos")?.scrollIntoView({ behavior: "smooth" })}>
            <Button variant="outline" className="border-white/40 text-white bg-transparent hover:bg-white/10 hover:text-white rounded-full px-8 py-6 text-base font-bold w-full sm:w-auto">
              conhecer os cursos
            </Button>
          </button>
        </div>
      </div>
      <div className="flex-shrink-0 w-48 md:w-64 lg:w-72">
        <Steppie className="w-full h-auto" />
      </div>
    </div>

    {/* Scroll indicator */}
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-bounce">
      <div className="w-6 h-10 rounded-full border-2 border-white/40 flex justify-center pt-2">
        <div className="w-1.5 h-3 rounded-full bg-white/60" />
      </div>
    </div>
  </section>
);

// ─── Social Proof ────────────────────────────────────────────────────────────
const SocialProof = () => (
  <section className="bg-steps-black py-6">
    <div className="container mx-auto px-4">
      <div className="flex flex-col sm:flex-row justify-center items-center gap-6 sm:gap-12 text-center">
        {[
          { num: "3 anos", label: "de escola ativa" },
          { num: "4 idiomas", label: "inglês, espanhol, libras e japonês" },
          { num: "aulas ao vivo", label: "sempre com professor real" },
        ].map((item, i) => (
          <div key={i} className="flex items-baseline gap-2">
            <span className="text-lime font-bold text-lg">{item.num}</span>
            <span className="text-white/70 text-sm font-light">· {item.label}</span>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ─── Diferenciais ────────────────────────────────────────────────────────────
const diferenciais = [
  { accent: "#520A70", accentBg: "bg-steps-purple/10", title: "professor de verdade", body: "Nada de app, gravação ou robô. Aula ao vivo, com vínculo humano desde o dia 1." },
  { accent: "#C1FE00", accentBg: "bg-steps-black", title: "método com progressão real", body: "Cada nível tem objetivo claro, prazo definido e materiais produzidos pela escola.", dark: true },
  { accent: "#FF1F9F", accentBg: "bg-magenta/10", title: "você já tentou antes — aqui é diferente", body: "A steps foi feita para quem começou e parou. O recomeço tem estrutura." },
  { accent: "#FF97CB", accentBg: "bg-pink/10", title: "conversa real desde o primeiro dia", body: "Sem enrolação. Você já fala desde a primeira aula." },
];

const Diferenciais = () => (
  <section id="diferenciais" className="bg-steps-offwhite py-16 md:py-24">
    <div className="container mx-auto px-4">
      <h2 className="text-2xl md:text-3xl font-bold text-steps-black text-center mb-12">por que a steps é diferente?</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 max-w-4xl mx-auto">
        {diferenciais.map((d, i) => (
          <div key={i} className={cn(
            "rounded-2xl p-6 space-y-3 transition-transform hover:scale-[1.02]",
            d.dark ? "bg-steps-black text-white" : "bg-white border border-steps-black/5"
          )}>
            {/* Curve accent */}
            <svg viewBox="0 0 80 30" className="w-16 h-6" fill="none">
              <path d="M 5 25 Q 30 2 55 15 Q 70 22 78 5" stroke={d.accent} strokeWidth="6" strokeLinecap="round" />
            </svg>
            <h3 className={cn("text-lg font-bold", d.dark ? "text-white" : "text-steps-black")}>{d.title}</h3>
            <p className={cn("text-sm font-normal leading-relaxed", d.dark ? "text-white/80" : "text-steps-black/70")}>{d.body}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ─── Cursos ──────────────────────────────────────────────────────────────────
const cursos = [
  {
    bg: "bg-steps-purple", accent: "#C1FE00", label: "hello · inglês",
    desc: "De A1 a B2 em 5 níveis. 40 aulas por nível, 2x por semana.",
    levels: ["First Steps", "Next Steps", "Bold Steps", "Wider Steps", "Sound Steps"],
    cta: "quero aprender inglês", ctaBg: "bg-lime text-steps-black hover:bg-lime/90",
    badge: "consolidado · turmas abertas", badgeBg: "bg-lime/20 text-lime",
  },
  {
    bg: "bg-coral", accent: "#FFFFFF", label: "hola · espanhol",
    desc: "Novo. Com o mesmo método do inglês. Turmas em formação.",
    levels: [],
    cta: "quero aprender espanhol", ctaBg: "bg-white text-steps-black hover:bg-white/90",
    badge: "novo · vagas limitadas", badgeBg: "bg-white/20 text-white",
  },
  {
    bg: "bg-pink", accent: "#520A70", label: "hallo · libras",
    desc: "Projeto social. Aulas inclusivas para quem quer se comunicar em Libras.",
    levels: [],
    cta: "saiba mais", ctaBg: "bg-steps-purple text-white hover:bg-steps-purple/90",
    badge: "projeto social", badgeBg: "bg-steps-purple/20 text-steps-purple",
  },
];

const Cursos = () => (
  <section id="cursos" className="bg-steps-black py-16 md:py-24">
    <div className="container mx-auto px-4">
      <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-12">escolha seu idioma</h2>
      <div className="flex flex-col md:flex-row gap-6 overflow-x-auto pb-4 snap-x snap-mandatory md:snap-none">
        {cursos.map((c, i) => (
          <div key={i} className={cn(
            "min-w-[280px] md:flex-1 rounded-2xl p-6 space-y-4 relative overflow-hidden snap-center",
            c.bg
          )}>
            {/* Accent curve */}
            <svg viewBox="0 0 300 100" className="absolute top-0 right-0 w-[60%] h-auto opacity-30 pointer-events-none" fill="none">
              <path d="M 200 -10 Q 250 40 280 90 Q 300 120 320 100" stroke={c.accent} strokeWidth="10" strokeLinecap="round" />
            </svg>

            <div className="relative z-10 space-y-4">
              <span className={cn("inline-block text-xs font-bold px-3 py-1 rounded-full", c.badgeBg)}>{c.badge}</span>
              <p className="text-xl font-bold text-white">{c.label}</p>
              <p className="text-sm text-white/85 font-normal">{c.desc}</p>
              {c.levels.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {c.levels.map((l, j) => (
                    <span key={j} className="text-xs font-light px-2 py-0.5 rounded-full bg-white/15 text-white/80">{l}</span>
                  ))}
                </div>
              )}
              <a href={WA_LINK} target="_blank" rel="noopener noreferrer">
                <Button className={cn("w-full rounded-full font-bold mt-2", c.ctaBg)}>{c.cta}</Button>
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ─── Jornada ─────────────────────────────────────────────────────────────────
const jornada = [
  { name: "First Steps", cefr: "A1", phrase: "suas primeiras frases", premium: false },
  { name: "Next Steps", cefr: "A2", phrase: "conversas do dia a dia", premium: false },
  { name: "Bold Steps", cefr: "B1", phrase: "você se vira sozinho", premium: false },
  { name: "Wider Steps", cefr: "B2", phrase: "fluência consolidada", premium: false },
  { name: "Sound Steps", cefr: "avançado", phrase: "treino fonético 1:1", premium: true },
];

const Jornada = () => (
  <section id="jornada" className="bg-white py-16 md:py-24">
    <div className="container mx-auto px-4 text-center">
      <h2 className="text-2xl md:text-3xl font-bold text-steps-black mb-2">sua jornada no inglês</h2>
      <p className="text-sm text-steps-black/60 font-normal mb-12 max-w-md mx-auto">cada nível tem começo, meio e fim — você sempre sabe onde está</p>

      <div className="relative flex flex-col md:flex-row items-center justify-center gap-4 md:gap-0">
        {jornada.map((j, i) => (
          <div key={i} className="flex flex-col md:flex-row items-center">
            <div className={cn(
              "flex flex-col items-center w-36 p-4 rounded-2xl transition-transform hover:scale-105",
              j.premium ? "bg-steps-dark text-white" : "bg-steps-offwhite"
            )}>
              <div className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold mb-2",
                j.premium ? "bg-pink text-steps-dark" : "bg-steps-purple text-white"
              )}>
                {i + 1}
              </div>
              <p className={cn("text-sm font-bold", j.premium ? "text-white" : "text-steps-black")}>{j.name}</p>
              <span className={cn("text-xs font-light mt-0.5", j.premium ? "text-pink" : "text-steps-purple")}>{j.cefr}</span>
              <p className={cn("text-xs font-light mt-1", j.premium ? "text-white/70" : "text-steps-black/60")}>{j.phrase}</p>
              {j.premium && <span className="text-[10px] font-bold text-pink mt-2 bg-pink/10 px-2 py-0.5 rounded-full">nível premium</span>}
            </div>
            {/* Connector line */}
            {i < jornada.length - 1 && (
              <>
                <div className="hidden md:block w-8 h-1 bg-lime rounded-full mx-1" />
                <div className="md:hidden w-1 h-6 bg-lime rounded-full my-1" />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ─── Como Funciona ───────────────────────────────────────────────────────────
const ComoFunciona = () => (
  <section id="como-funciona" className="bg-lime py-16 md:py-24 relative overflow-hidden">
    <CurveRight color="#FF1F9F" className="absolute right-0 top-0 w-[30%] h-full pointer-events-none" />

    <div className="container mx-auto px-4 relative z-10">
      <h2 className="text-3xl md:text-4xl font-black text-steps-black text-center mb-12">simples assim.</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto mb-12">
        {[
          { num: "1", title: "agende sua aula gratuita", sub: "sem compromisso, sem cartão" },
          { num: "2", title: "conheça seu professor", sub: "aula ao vivo, você testa o método" },
          { num: "3", title: "comece sua jornada", sub: "com nível definido e turma certa" },
        ].map((step, i) => (
          <div key={i} className="text-center space-y-3">
            <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-steps-black text-lime text-2xl font-black">
              {step.num}
            </span>
            <p className="text-lg font-bold text-steps-black">{step.title}</p>
            <p className="text-sm font-normal text-steps-black/70">{step.sub}</p>
          </div>
        ))}
      </div>

      <div className="text-center">
        <a href={WA_LINK} target="_blank" rel="noopener noreferrer">
          <Button className="bg-steps-black text-white hover:bg-steps-black/90 rounded-full px-8 py-6 text-base font-bold">
            agendar minha aula gratuita →
          </Button>
        </a>
      </div>
    </div>
  </section>
);

// ─── Footer ──────────────────────────────────────────────────────────────────
const Footer = () => {
  const navigate = useNavigate();
  return (
    <footer className="bg-steps-black py-12">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
          <div className="flex flex-col leading-none">
            <span className="text-2xl font-black text-steps-offwhite tracking-tight">steps</span>
            <span className="text-sm font-bold text-steps-offwhite/70 -mt-0.5">academy</span>
          </div>

          <p className="text-sm text-white/50 font-light text-center max-w-sm">
            Do zero à fluência, com método e aulas ao vivo.
          </p>

          <div className="flex items-center gap-4 text-sm">
            <a href="https://instagram.com/stepsacademy" target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white transition-colors font-light">Instagram</a>
            <a href={WA_LINK} target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white transition-colors font-light">WhatsApp</a>
            <button onClick={() => navigate("/login")} className="text-white/60 hover:text-white transition-colors font-light">entrar</button>
          </div>
        </div>

        <div className="border-t border-white/10 pt-6 text-center">
          <p className="text-xs text-white/40 font-light">© 2026 steps academy · Rio de Janeiro</p>
        </div>
      </div>
    </footer>
  );
};

// ─── Page ────────────────────────────────────────────────────────────────────
const LandingPage = () => (
  <div className="min-h-screen bg-white">
    <Navbar />
    <Hero />
    <SocialProof />
    <Diferenciais />
    <Cursos />
    <Jornada />
    <ComoFunciona />
    <Footer />
  </div>
);

export default LandingPage;
