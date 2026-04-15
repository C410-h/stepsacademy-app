import { useState, useRef, useCallback, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// ─── STEPPIE PATHS (served from /public/steppie/) ────────────────
const steppieOrgulhoso = "/steppie/steppie-orgulhoso.webp";
const steppieApontando = "/steppie/steppie-apontando.webp";
const steppieFantasia  = "/steppie/steppie-fantasia.webp";
const steppieLendo     = "/steppie/steppie-lendo.svg";
const steppieAlegre    = "/steppie/steppie-alegre.webp";

// ─── SCROLL FADE-IN HOOK ─────────────────────────────────────────
const useFadeIn = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, style: { opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(28px)", transition: "opacity .7s ease, transform .7s ease" } as React.CSSProperties };
};

// ─── CONSTANTS ────────────────────────────────────────────────────
const WA_NUMBER = "5521999999999";

type LangKey = "ingles" | "espanhol" | "libras" | "japones";

interface LevelData {
  badge: string;
  name: string;
  desc: string;
  premium?: boolean;
}

interface DifData {
  n: string;
  title: string;
  body: string;
}

interface ThemeData {
  bg: string;
  accent: string;
  text: string;
  muted: string;
  at: string;
  curve: string;
  tag: string;
  h1: string;
  em: string;
  body: string;
  sub: string;
  cta: string;
  dLabel: string;
  dTitle: string;
  difs: DifData[];
  nLabel: string;
  nTitle: string;
  nSub: string;
  levels: LevelData[];
  nNote: string;
  fTitle: string;
  fEm: string;
  fSub: string;
  waMsg: string;
}

const DATA: Record<LangKey, ThemeData> = {
  ingles: {
    bg: "#520A70",
    accent: "#C1FE00",
    text: "#fff",
    muted: "rgba(255,255,255,.62)",
    at: "#520A70",
    curve: "#C1FE00",
    tag: "inglês · aulas ao vivo",
    h1: "Você não falhou\nno inglês.",
    em: "O método é que falhou em você.",
    body: "Mais de 1.000 horas de aula ao vivo. Uma das nossas alunas precisava assumir uma posição de liderança internacional — e o inglês era o único obstáculo. Hoje ela conduz reuniões com clientes no exterior e ainda ensina palavras em português para os colegas.",
    sub: "Método próprio. Professor real. Do zero à fluência, com progressão que dá pra medir.",
    cta: "quero minha aula gratuita",
    dLabel: "por que a steps · inglês",
    dTitle: "O que torna o inglês\nna Steps diferente.",
    difs: [
      { n: "01", title: "mais de 1.000 horas de aula ao vivo", body: "Três anos de operação, alunos reais, resultados que aparecem na vida profissional e pessoal." },
      { n: "02", title: "professor real, não um algoritmo", body: "Nada de app, chatbot ou videoaula gravada. Você aprende com um ser humano que se importa com o seu progresso." },
      { n: "03", title: "5 níveis com progressão clara", body: "Cada nível tem nome próprio, objetivo definido e critério de conclusão. Você sabe exatamente onde chegou." },
      { n: "04", title: "Sound Steps — fonética premium", body: "Para quem conclui o B2, o próprio fundador conduz o treinamento fonético 1:1. O diferencial máximo da Steps." },
    ],
    nLabel: "a jornada · inglês",
    nTitle: "Cinco níveis. Uma transformação.",
    nSub: "Do iniciante absoluto à fluência fonética — com nome e objetivo em cada etapa.",
    levels: [
      { badge: "A1", name: "First Steps", desc: "iniciante absoluto" },
      { badge: "A2", name: "Next Steps", desc: "básico" },
      { badge: "B1", name: "Bold Steps", desc: "intermediário" },
      { badge: "B2", name: "Wider Steps", desc: "intermediário superior" },
      { badge: "★", name: "Sound Steps", desc: "fonética · premium · 1:1 com o fundador", premium: true },
    ],
    nNote: "Cada nível com ~40 aulas. Curso básico completo (A1→B1) em ~18 meses.",
    fTitle: "Seu primeiro passo\ncomeça com uma",
    fEm: "aula grátis.",
    fSub: "Sem cartão. Sem compromisso. Só você, o professor e uma aula real.",
    waMsg: "Olá! Quero saber mais sobre o curso de inglês da Steps Academy.",
  },
  espanhol: {
    bg: "#FF1F9F",
    accent: "#FFFFFF",
    text: "#fff",
    muted: "rgba(255,255,255,.68)",
    at: "#FF1F9F",
    curve: "#fff",
    tag: "espanhol · aulas ao vivo",
    h1: "O idioma mais próximo\ndo português",
    em: "— e você já entende mais do que imagina.",
    body: "Na Steps, você aprende espanhol com professores nativos, ao vivo. Sem sotaque artificial, sem apostila engessada. Do jeito que o idioma realmente soa.",
    sub: "Método próprio. Professor nativo. Do zero à fluência.",
    cta: "quero aprender espanhol",
    dLabel: "por que a steps · espanhol",
    dTitle: "O espanhol que você\nmerece aprender.",
    difs: [
      { n: "01", title: "o idioma que você já quase fala", body: "O espanhol é o idioma mais próximo do português. Você já tem vantagem real antes de começar." },
      { n: "02", title: "professores nativos ao vivo", body: "Você aprende com quem nasceu no idioma — sem sotaque artificial, sem método de franquia engessado." },
      { n: "03", title: "curso mais rápido que o inglês", body: "A proximidade com o português acelera tudo. O A1 em ~5 meses. O B1 completo em ~20 meses." },
      { n: "04", title: "Pasos Voz — fonética com nativo", body: "Para quem conclui o B2, treinamento fonético 1:1 conduzido por professor nativo parceiro." },
    ],
    nLabel: "a jornada · espanhol",
    nTitle: "Cinco níveis. Progressão clara.",
    nSub: "Cada etapa tem nome próprio, objetivo definido e critério de conclusão.",
    levels: [
      { badge: "A1", name: "Pasos Raíz", desc: "iniciante absoluto · ~5 meses" },
      { badge: "A2", name: "Pasos Rumbo", desc: "básico · ~5 meses" },
      { badge: "B1", name: "Pasos Avance", desc: "intermediário · ~10 meses" },
      { badge: "B2", name: "Pasos Vuelo", desc: "intermediário superior · ~10 meses" },
      { badge: "★", name: "Pasos Voz", desc: "fonética · premium · professor nativo 1:1", premium: true },
    ],
    nNote: "Material próprio — o aluno nunca toca no livro didático. Curso básico (A1→B1) em ~20 meses.",
    fTitle: "Seu primeiro passo\ncomeça com uma",
    fEm: "aula grátis.",
    fSub: "Sem cartão. Sem compromisso. Só você, o professor e uma aula real.",
    waMsg: "Olá! Quero saber mais sobre o curso de espanhol da Steps Academy.",
  },
  libras: {
    bg: "#FF97CB",
    accent: "#520A70",
    text: "#15012A",
    muted: "rgba(21,1,42,.58)",
    at: "#FF97CB",
    curve: "#520A70",
    tag: "libras · aulas ao vivo",
    h1: "A barreira mais injusta",
    em: "é aquela que existe dentro do próprio país.",
    body: "Libras não é um idioma estrangeiro — é uma forma de se comunicar com quem sempre esteve ao seu lado. Para quem quer derrubar essa barreira, a Steps está aqui.",
    sub: "Professor especializado. Aulas ao vivo. Comunicação real.",
    cta: "quero aprender libras",
    dLabel: "por que a steps · libras",
    dTitle: "Libras com método,\npropósito e presença.",
    difs: [
      { n: "01", title: "a barreira mais injusta é a do próprio país", body: "Libras não é opcional — é a língua de quem sempre esteve ao seu lado e que merece ser ouvido de verdade." },
      { n: "02", title: "professora especializada ao vivo", body: "Aulas ao vivo, com professora dedicada. O vínculo humano que torna o aprendizado real possível." },
      { n: "03", title: "material próprio da Steps", body: "Slides, fichas e exercícios produzidos pela Steps Academy, com identidade e linguagem próprias." },
      { n: "04", title: "aula experimental gratuita", body: "Antes de qualquer compromisso, você experimenta o método. Sentiu — aí você decide." },
    ],
    nLabel: "a jornada · libras",
    nTitle: "Do zero à comunicação real.",
    nSub: "Estrutura em desenvolvimento contínuo — com propósito em cada etapa.",
    levels: [
      { badge: "01", name: "Nível Básico", desc: "introdução à língua e cultura surda" },
      { badge: "02", name: "Nível Intermediário", desc: "expressão e conversação em Libras" },
    ],
    nNote: "Aulas particulares disponíveis agora. Estrutura de turmas em expansão.",
    fTitle: "Seu primeiro passo\ncomeça com uma",
    fEm: "aula grátis.",
    fSub: "Sem cartão. Sem compromisso. Só você, a professora e uma aula real.",
    waMsg: "Olá! Quero saber mais sobre o curso de Libras da Steps Academy.",
  },
  japones: {
    bg: "#1D1D1B",
    accent: "#C1FE00",
    text: "#fff",
    muted: "rgba(255,255,255,.58)",
    at: "#1D1D1B",
    curve: "#C1FE00",
    tag: "japonês · aulas ao vivo",
    h1: "Uma das línguas mais\ncomplexas do mundo",
    em: "— e uma das culturas mais ricas.",
    body: "Anime, mangá, gastronomia, filosofia. O japonês atrai quem já tem uma relação com o Japão antes mesmo de abrir o primeiro livro. Nossas aulas são desenvolvidas com curadoria de professor japonês — para garantir que você aprenda o idioma de verdade, não uma versão simplificada.",
    sub: "Curadoria de professor japonês. Aulas particulares disponíveis agora.",
    cta: "quero aprender japonês",
    dLabel: "por que a steps · japonês",
    dTitle: "Japonês de verdade,\nnão uma versão simplificada.",
    difs: [
      { n: "01", title: "curadoria de professor japonês", body: "Nossa metodologia é desenvolvida com curadoria de professor japonês — para garantir autenticidade em cada aula." },
      { n: "02", title: "uma cultura que você já ama", body: "Anime, mangá, gastronomia, filosofia. O japonês faz sentido quando você já tem uma relação com o Japão." },
      { n: "03", title: "aulas particulares agora", body: "Sem esperar turma. Você começa quando quiser, no ritmo que funciona pra você." },
      { n: "04", title: "material próprio da Steps", body: "Slides, fichas e exercícios produzidos pela Steps Academy com linguagem e identidade próprias." },
    ],
    nLabel: "a jornada · japonês",
    nTitle: "Cada passo tem nome em japonês.",
    nSub: "Ayumi (歩み) significa caminhada, progresso. É exatamente o que você vai construir.",
    levels: [
      { badge: "N5", name: "Ayumi Ichi", desc: "iniciante absoluto · hiragana, katakana e estruturas básicas" },
      { badge: "N4", name: "Ayumi Ni", desc: "básico · gramática fundamental e vocabulário do cotidiano" },
      { badge: "N3", name: "Ayumi San", desc: "intermediário · conversação e leitura de textos simples" },
    ],
    nNote: "Estrutura em expansão. Aulas particulares disponíveis agora — sem precisar esperar turma.",
    fTitle: "Seu primeiro passo\ncomeça com uma",
    fEm: "aula grátis.",
    fSub: "Sem cartão. Sem compromisso. Só você, o professor e uma aula real.",
    waMsg: "Olá! Quero saber mais sobre o curso de japonês da Steps Academy.",
  },
};

const BUBBLES: { key: LangKey; sym: string; label: string; fontSize?: string }[] = [
  { key: "ingles", sym: "EN", label: "inglês" },
  { key: "espanhol", sym: "ES", label: "espanhol" },
  { key: "libras", sym: "LIBRAS_SVG", label: "libras" },
  { key: "japones", sym: "日", label: "japonês", fontSize: "text-[26px]" },
];

// ─── WAVE TRANSITION COMPONENT ───────────────────────────────────
// ─── LIBRAS SVG ICON ─────────────────────────────────────────────
const LibrasIcon = ({ color = "currentColor", size = 24 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 12c0-2 1-4 3-5" />
    <path d="M12 3c0 0-1 2-1 4s1 3 1 3" />
    <path d="M16 7c1 1 2 3 2 5" />
    <path d="M6 17c0 0 2 4 6 4s6-4 6-4" />
    <circle cx="8" cy="9" r="1.2" fill={color} stroke="none" />
    <circle cx="16" cy="10" r="1.2" fill={color} stroke="none" />
    <path d="M10 15c0 0 1 1.5 2 1.5s2-1.5 2-1.5" />
  </svg>
);

// ─── WAVE TRANSITION COMPONENT ───────────────────────────────────
const WaveOverlay = ({
  color,
  stage,
}: {
  color: string;
  stage: "idle" | "entering" | "covering" | "exiting";
}) => {
  const opacity = stage === "idle" ? 0 : stage === "covering" ? 1 : 0;

  return (
    <div
      className="fixed inset-0 z-[998] pointer-events-none"
      style={{
        background: color,
        opacity,
        transition: stage === "idle" ? "none" : "opacity .45s cubic-bezier(.4,0,.2,1)",
        willChange: "opacity",
      }}
    />
  );
};

// ─── MAIN COMPONENT ─────────────────────────────────────────────
const LandingPage = () => {
  const { session, profile } = useAuth();
  const navigate = useNavigate();
  const [lang, setLang] = useState<LangKey>("ingles");
  const [waveStage, setWaveStage] = useState<"idle" | "entering" | "covering" | "exiting">("idle");
  const [waveColor, setWaveColor] = useState("#520A70");
  const [switching, setSwitching] = useState(false);
  const [formDone, setFormDone] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [tel, setTel] = useState("");
  const formRef = useRef<HTMLElement>(null);

  const difsFade = useFadeIn();
  const levelsFade = useFadeIn();

  const d = DATA[lang];

  const scrollToForm = useCallback(() => {
    formRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const switchLang = useCallback(
    (next: LangKey) => {
      if (next === lang || switching) return;
      setSwitching(true);
      const nd = DATA[next];
      setWaveColor(nd.bg);

      setWaveStage("idle");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setWaveStage("covering"));
      });

      setTimeout(() => {
        setLang(next);
        setTimeout(() => {
          setWaveStage("exiting");
          setTimeout(() => {
            setWaveStage("idle");
            setSwitching(false);
          }, 460);
        }, 60);
      }, 420);
    },
    [lang, switching]
  );

  const submitForm = useCallback(() => {
    if (!nome.trim() || !email.trim() || !tel.trim()) {
      alert("Por favor, preencha todos os campos.");
      return;
    }
    setFormDone(true);
  }, [nome, email, tel]);

  const waLink = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(d.waMsg)}`;

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ fontFamily: "'Libre Franklin', sans-serif", background: d.bg, color: d.text, transition: "background .4s, color .4s" }}>
      <WaveOverlay color={waveColor} stage={waveStage} />

      {/* ─── NAV ──────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-6 md:px-14 h-[60px] border-b" style={{ background: "rgba(0,0,0,.35)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", borderColor: "rgba(255,255,255,.07)" }}>
        <img src="/brand/logo-reto-lime.webp" alt="steps academy" className="h-6" />
        <div className="flex items-center gap-3">
          {session ? (
            <>
              <button
                onClick={() => navigate("/")}
                className="hidden sm:inline-flex items-center px-5 py-2 rounded-full text-[13px] font-medium border transition-colors"
                style={{ color: "rgba(255,255,255,.7)", borderColor: "rgba(255,255,255,.2)", background: "transparent" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,.6)"; e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,.2)"; e.currentTarget.style.color = "rgba(255,255,255,.7)"; }}
              >
                ir para a plataforma
              </button>
              <button onClick={() => navigate("/perfil")} className="cursor-pointer hover:opacity-80 transition-opacity">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {profile?.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="hidden sm:inline-flex items-center px-5 py-2 rounded-full text-[13px] font-medium border transition-colors"
                style={{ color: "rgba(255,255,255,.7)", borderColor: "rgba(255,255,255,.2)", background: "transparent" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,.6)"; e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,.2)"; e.currentTarget.style.color = "rgba(255,255,255,.7)"; }}
              >
                entrar na plataforma
              </Link>
              <button
                onClick={scrollToForm}
                className="px-5 py-2 rounded-full text-[13px] font-bold border-none cursor-pointer transition-transform hover:scale-[1.04]"
                style={{ background: d.accent, color: d.at, transition: "background .4s, color .4s" }}
              >
                aula grátis
              </button>
              <Link
                to="/planos"
                className="hidden sm:inline-flex items-center px-5 py-2 rounded-full text-[13px] font-bold border-none cursor-pointer transition-transform hover:scale-[1.04]"
                style={{ background: "#C1FE00", color: "#1D1D1B" }}
              >
                matricular-se
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* ─── HERO ──────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col justify-center px-6 md:px-14 pt-[140px] pb-[100px] overflow-hidden">
        {/* Background curves */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1440 900" fill="none" preserveAspectRatio="xMidYMid slice">
          <path d="M-120 180 Q280 60 620 240 Q960 420 1340 140 Q1480 70 1600 200" stroke={d.curve} strokeWidth="72" strokeLinecap="round" fill="none" opacity="0.38" style={{ transition: "stroke .4s" }} />
          <path d="M-120 800 Q200 680 520 820 Q840 960 1160 720 Q1380 590 1600 760" stroke={d.curve} strokeWidth="46" strokeLinecap="round" fill="none" opacity="0.16" style={{ transition: "stroke .4s" }} />
        </svg>

        {/* Language bubbles */}
        <div className="flex gap-3 md:gap-4 mb-12 md:mb-[52px] relative z-[2] flex-wrap">
          {BUBBLES.map((b) => (
            <button
              key={b.key}
              onClick={() => switchLang(b.key)}
              className="w-[66px] h-[66px] md:w-[76px] md:h-[76px] rounded-full flex flex-col items-center justify-center gap-[3px] cursor-pointer select-none transition-all duration-200"
              style={{
                border: `2px solid ${lang === b.key ? d.accent : "rgba(255,255,255,.18)"}`,
                background: lang === b.key ? "rgba(255,255,255,.15)" : "rgba(255,255,255,.07)",
                backdropFilter: "blur(4px)",
                transform: lang === b.key ? "scale(1.1)" : "scale(1)",
                transition: "transform .2s, border-color .25s, background .25s",
              }}
              onMouseEnter={(e) => {
                if (lang !== b.key) {
                  e.currentTarget.style.transform = "scale(1.08)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,.45)";
                  e.currentTarget.style.background = "rgba(255,255,255,.13)";
                }
              }}
              onMouseLeave={(e) => {
                if (lang !== b.key) {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,.18)";
                  e.currentTarget.style.background = "rgba(255,255,255,.07)";
                }
              }}
            >
              <span className={`font-black leading-none ${b.fontSize || "text-[22px]"}`} style={{ color: d.text }}>
                {b.sym === "LIBRAS_SVG" ? <LibrasIcon color={d.text} size={26} /> : b.sym}
              </span>
              <span className="text-[9px] font-bold tracking-wider opacity-70 lowercase" style={{ color: d.text }}>{b.label}</span>
            </button>
          ))}
        </div>

        {/* Hero content */}
        <div className="relative z-[2] flex flex-col md:flex-row items-start md:items-center gap-8 animate-[fadeUp_.65s_ease_both]">
          <div className="flex-1 max-w-[680px]">
            <p
              className="inline-flex items-center gap-2.5 text-[11px] font-bold tracking-[.13em] uppercase mb-7"
              style={{ color: d.accent, transition: "color .4s" }}
            >
              <span className="inline-block w-[26px] h-[2px] rounded-sm" style={{ background: d.accent, transition: "background .4s" }} />
              {d.tag}
            </p>

            <h1 className="text-[clamp(40px,5vw,68px)] font-black leading-[1.04] mb-6" style={{ color: d.text, transition: "color .4s" }}>
              {d.h1.split("\n").map((line, i) => (
                <span key={i}>
                  {line}
                  <br />
                </span>
              ))}
              <em className="not-italic block" style={{ color: d.accent, transition: "color .4s" }}>{d.em}</em>
            </h1>

            <p className="text-[17px] leading-[1.72] max-w-[540px] mb-3.5" style={{ color: d.muted, transition: "color .4s" }}>
              {d.body}
            </p>

            <p className="text-[15px] font-bold opacity-[.82] mb-11" style={{ color: d.text, transition: "color .4s" }}>
              {d.sub}
            </p>

            <div className="flex gap-3.5 flex-wrap">
              <button
                onClick={scrollToForm}
                className="px-8 py-[15px] rounded-full font-bold text-[16px] border-none cursor-pointer transition-transform hover:scale-[1.03]"
                style={{ background: d.accent, color: d.at, transition: "background .4s, color .4s", fontFamily: "'Libre Franklin', sans-serif" }}
              >
                {d.cta}
              </button>
              <button
                onClick={() => document.getElementById("como")?.scrollIntoView({ behavior: "smooth" })}
                className="px-8 py-[13px] rounded-full font-medium text-[15px] cursor-pointer border-2 transition-colors"
                style={{ background: "transparent", color: d.text, borderColor: "rgba(255,255,255,.24)", fontFamily: "'Libre Franklin', sans-serif" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,.7)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,.24)"; }}
              >
                como funciona
              </button>
              <Link
                to="/planos"
                className="inline-flex items-center px-7 py-3 rounded-full text-sm font-bold transition-transform hover:scale-[1.03]"
                style={{ background: "#C1FE00", color: "#1D1D1B" }}
              >
                quero me matricular
              </Link>
            </div>
          </div>

          {/* Steppie — Hero */}
          <div className="flex-shrink-0 flex justify-center md:justify-start">
            <img
              src={steppieOrgulhoso}
              alt=""
              aria-hidden="true"
              className="w-[160px] md:w-[220px] lg:w-[280px] drop-shadow-xl"
              style={{ animation: "steppieFloat 3s ease-in-out infinite" }}
            />
          </div>
        </div>
      </section>

      {/* ─── DIFERENCIAIS ──────────────────────────── */}
      <section className="px-6 md:px-14 py-[72px] md:py-24 relative" style={{ background: d.bg, transition: "background .4s" }}>
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-[11px] font-bold tracking-[.14em] uppercase mb-4" style={{ color: d.accent, transition: "color .4s" }}>
              {d.dLabel}
            </p>
            <h2
              className="text-[clamp(30px,3.5vw,46px)] font-black leading-[1.1] mb-14"
              style={{ color: d.text, transition: "color .4s" }}
              dangerouslySetInnerHTML={{ __html: d.dTitle.replace("\n", "<br/>") }}
            />
          </div>
          <img
            src={steppieApontando}
            alt=""
            aria-hidden="true"
            className="hidden md:block w-[140px] flex-shrink-0 -mt-4"
          />
        </div>
        <div ref={difsFade.ref} style={difsFade.style} className="grid grid-cols-1 sm:grid-cols-2 gap-[2px] rounded-[20px] overflow-hidden" >
          {d.difs.map((df) => (
            <div
              key={df.n}
              className="p-8 md:p-9 transition-colors"
              style={{ background: "rgba(255,255,255,.06)", backdropFilter: "blur(4px)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.11)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.06)"; }}
            >
              <p className="text-[11px] font-bold tracking-[.1em] opacity-70 mb-3.5" style={{ color: d.accent, transition: "color .4s" }}>
                {df.n}
              </p>
              <h3 className="text-[19px] font-bold leading-[1.25] mb-2.5" style={{ color: d.text, transition: "color .4s" }}>
                {df.title}
              </h3>
              <p className="text-[14px] leading-[1.68]" style={{ color: d.muted, transition: "color .4s" }}>
                {df.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── NÍVEIS ────────────────────────────────── */}
      <section className="px-6 md:px-14 py-[72px] md:py-24" style={{ background: "#1D1D1B" }}>
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-[11px] font-bold tracking-[.14em] uppercase mb-4" style={{ color: "#C1FE00" }}>
              {d.nLabel}
            </p>
            <h2
              className="text-[clamp(30px,3.5vw,46px)] font-black text-white leading-[1.1] mb-3.5"
              dangerouslySetInnerHTML={{ __html: d.nTitle.replace("\n", "<br/>") }}
            />
            <p className="text-[16px] mb-[52px] leading-[1.6]" style={{ color: "rgba(255,255,255,.5)" }}>
              {d.nSub}
            </p>
          </div>
          <img
            src={steppieLendo}
            alt=""
            aria-hidden="true"
            className="hidden md:block w-[130px] flex-shrink-0"
          />
        </div>

        <div ref={levelsFade.ref} style={levelsFade.style} className="flex flex-col md:flex-row gap-0 rounded-2xl overflow-hidden" >
          {d.levels.map((l, i) => (
            <div
              key={l.name}
              className="flex-1 p-6 md:p-8 transition-colors relative"
              style={{
                background: l.premium ? "rgba(193,254,0,.06)" : "rgba(255,255,255,.04)",
                borderRight: i < d.levels.length - 1 ? "1px solid rgba(255,255,255,.08)" : "none",
                borderBottom: "1px solid rgba(255,255,255,.08)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = l.premium ? "rgba(193,254,0,.1)" : "rgba(255,255,255,.09)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = l.premium ? "rgba(193,254,0,.06)" : "rgba(255,255,255,.04)"; }}
            >
              <span
                className="inline-block text-[10px] font-bold tracking-[.08em] px-2.5 py-1 rounded-full mb-3.5"
                style={{
                  background: l.premium ? "rgba(193,254,0,.2)" : "rgba(255,255,255,.1)",
                  color: l.premium ? "#C1FE00" : "rgba(255,255,255,.65)",
                }}
              >
                {l.badge}
              </span>
              <div className="text-[17px] font-bold text-white mb-1.5">{l.name}</div>
              <div className="text-[12px] leading-[1.5]" style={{ color: "rgba(255,255,255,.45)" }}>{l.desc}</div>
            </div>
          ))}
        </div>
        <p className="text-[13px] mt-5 italic" style={{ color: "rgba(255,255,255,.35)" }}>
          {d.nNote}
        </p>
      </section>

      {/* ─── COMO FUNCIONA ─────────────────────────── */}
      <section id="como" className="px-6 md:px-14 py-[72px] md:py-24 relative" style={{ background: "#111" }}>
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-[11px] font-bold tracking-[.14em] uppercase mb-4" style={{ color: "#C1FE00" }}>
              como funciona
            </p>
            <h2 className="text-[clamp(30px,3.5vw,46px)] font-black text-white leading-[1.1] mb-14 max-w-[480px]">
              Simples, estruturado<br />e sem enrolação.
            </h2>
          </div>
          <img
            src={steppieFantasia}
            alt=""
            aria-hidden="true"
            className="hidden md:block w-[120px] flex-shrink-0 -mt-2"
          />
        </div>
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[1px] rounded-[18px] overflow-hidden"
          style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.08)" }}
        >
          {[
            { n: "01", title: "Aula experimental gratuita", body: "Você conhece o método na prática e decide sem pressão. Nenhum compromisso." },
            { n: "02", title: "Matrícula no nível certo", body: "Nunca avançado demais, nunca abaixo do que você já sabe. Você começa onde faz sentido." },
            { n: "03", title: "Aulas ao vivo com professor real", body: "Material produzido, metodologia consistente. Você aprende de verdade — toda semana." },
            { n: "04", title: "Resultado que dá pra medir", body: "A cada nível concluído você avança com clareza e sabe exatamente onde chegou." },
          ].map((s) => (
            <div key={s.n} className="p-8 md:p-10" style={{ background: "#0d0d0d" }}>
              <div className="text-[44px] font-black leading-none mb-4" style={{ color: "#C1FE00", opacity: 0.22 }}>
                {s.n}
              </div>
              <h3 className="text-[17px] font-bold text-white leading-[1.2] mb-2.5">{s.title}</h3>
              <p className="text-[13px] leading-[1.65]" style={{ color: "rgba(255,255,255,.45)" }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FORMULÁRIO ────────────────────────────── */}
      <section ref={formRef} className="relative px-6 md:px-14 py-[72px] md:py-24 text-center overflow-hidden" style={{ background: d.bg, transition: "background .4s" }}>
        {/* Background curves */}
        <svg className="absolute inset-0 pointer-events-none w-full h-full" viewBox="0 0 1440 600" fill="none" preserveAspectRatio="xMidYMid slice">
          <path d="M-120 100 Q340 0 720 160 Q1060 320 1560 60" stroke={d.curve} strokeWidth="58" strokeLinecap="round" fill="none" opacity="0.12" style={{ transition: "stroke .4s" }} />
          <path d="M-120 560 Q400 460 820 550 Q1120 620 1600 480" stroke={d.curve} strokeWidth="32" strokeLinecap="round" fill="none" opacity="0.08" style={{ transition: "stroke .4s" }} />
        </svg>

        <div className="relative z-[2]">
          <p className="text-[11px] font-bold tracking-[.14em] uppercase mb-4" style={{ color: d.accent, transition: "color .4s" }}>
            pronto para começar?
          </p>
          <h2
            className="text-[clamp(36px,4.5vw,60px)] font-black leading-[1.05] mb-4"
            style={{ color: d.text, transition: "color .4s" }}
          >
            {d.fTitle.split("\n").map((line, i) => (
              <span key={i}>
                {line}
                <br />
              </span>
            ))}
            <em className="not-italic" style={{ color: d.accent, transition: "color .4s" }}>{d.fEm}</em>
          </h2>
          <p className="text-[17px] max-w-[440px] mx-auto mb-12 leading-[1.65]" style={{ color: d.muted, transition: "color .4s" }}>
            {d.fSub}
          </p>

          <div className="max-w-[480px] mx-auto">
            {!formDone ? (
              <div>
                <div className="flex flex-col gap-3 mb-4">
                  {[
                    { value: nome, set: setNome, placeholder: "seu nome", type: "text" },
                    { value: email, set: setEmail, placeholder: "seu melhor e-mail", type: "email" },
                    { value: tel, set: setTel, placeholder: "whatsapp (com DDD)", type: "tel" },
                  ].map((f) => (
                    <input
                      key={f.placeholder}
                      type={f.type}
                      value={f.value}
                      onChange={(e) => f.set(e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full px-5 py-4 rounded-xl text-[15px] font-normal outline-none transition-colors"
                      style={{
                        background: "rgba(255,255,255,.1)",
                        border: "1.5px solid rgba(255,255,255,.18)",
                        color: d.text,
                        fontFamily: "'Libre Franklin', sans-serif",
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = d.accent;
                        e.currentTarget.style.background = "rgba(255,255,255,.15)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "rgba(255,255,255,.18)";
                        e.currentTarget.style.background = "rgba(255,255,255,.1)";
                      }}
                    />
                  ))}
                </div>
                <button
                  onClick={submitForm}
                  className="w-full px-9 py-[17px] rounded-full font-bold text-[17px] border-none cursor-pointer mb-5 transition-transform hover:scale-[1.03]"
                  style={{ background: d.accent, color: d.at, fontFamily: "'Libre Franklin', sans-serif", transition: "background .4s, color .4s" }}
                >
                  {d.cta}
                </button>
              </div>
            ) : (
              <div className="mb-5">
                <p className="text-[17px] font-bold mb-1.5" style={{ color: d.accent }}>
                  Recebemos seus dados!
                </p>
                <p className="text-[15px]" style={{ color: d.muted }}>
                  Agora clique abaixo para falar com a gente no WhatsApp e confirmar sua aula.
                </p>
              </div>
            )}

            <div className="mt-1">
              <a
                href={formDone ? waLink : "#"}
                target={formDone ? "_blank" : undefined}
                rel={formDone ? "noopener noreferrer" : undefined}
                onClick={(e) => { if (!formDone) e.preventDefault(); }}
                className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-full font-bold text-[15px] border-none transition-all"
                style={{
                  background: "#25D366",
                  color: "#fff",
                  opacity: formDone ? 1 : 0.38,
                  filter: formDone ? "none" : "grayscale(.6)",
                  pointerEvents: formDone ? "auto" : "none",
                  cursor: formDone ? "pointer" : "default",
                  fontFamily: "'Libre Franklin', sans-serif",
                  textDecoration: "none",
                }}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                falar no whatsapp
              </a>
              {!formDone && (
                <p className="text-[12px] mt-2.5" style={{ color: d.muted, transition: "color .4s" }}>
                  preencha o formulário acima para desbloquear
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─────────────────────────────────── */}
      <footer className="flex flex-col md:flex-row items-center justify-between px-6 md:px-14 py-9 gap-4 text-center md:text-left relative" style={{ background: "#0c0c0c" }}>
        <img src="/brand/logo-reto-lime.webp" alt="steps academy" className="h-6" />
        <Link
          to="/planos"
          className="inline-flex items-center px-8 py-3.5 rounded-full font-bold text-sm transition-transform hover:scale-[1.03]"
          style={{ background: "#C1FE00", color: "#1D1D1B" }}
        >
          quero me matricular
        </Link>
        <p className="text-[12px]" style={{ color: "rgba(255,255,255,.28)" }}>
          © 2026 steps academy · Rio de Janeiro · escola de idiomas online · aulas ao vivo
        </p>
        <img
          src={steppieAlegre}
          alt=""
          aria-hidden="true"
          className="absolute right-6 bottom-2 w-[60px] opacity-70"
        />
      </footer>
    </div>
  );
};

export default LandingPage;
