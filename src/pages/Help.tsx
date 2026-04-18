import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import StudentLayout from "@/components/StudentLayout";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Search, HelpCircle } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface HelpItem {
  question: string;
  answer: string;
}

interface HelpSection {
  section: string;
  items: HelpItem[];
}

// ── Content ───────────────────────────────────────────────────────────────────

const HELP_CONTENT: Record<string, HelpSection[]> = {
  student: [
    {
      section: "Primeiros passos",
      items: [
        {
          question: "Como funciona a plataforma?",
          answer:
            "A steps academy é uma escola de idiomas com aulas ao vivo via Google Meet. Aqui você acompanha seu progresso, acessa materiais, pratica com exercícios e vê suas próximas aulas — tudo em um só lugar.",
        },
        {
          question: "Como acesso minha aula ao vivo?",
          answer:
            "No seu Dashboard, você vê as próximas aulas agendadas. Clique em "Entrar na aula" para abrir o Google Meet direto pelo app. O link também chega no seu email quando a aula é agendada.",
        },
        {
          question: "Como vejo meu progresso?",
          answer:
            "No Dashboard você acompanha seu nível atual, steps concluídos e XP acumulado. Em /aula você vê os materiais e exercícios de cada step.",
        },
      ],
    },
    {
      section: "Materiais e exercícios",
      items: [
        {
          question: "Onde ficam os materiais da aula?",
          answer:
            "Acesse a aba "Aula" no menu inferior. Lá você encontra os slides, fichas de gramática, listas de vocabulário e exercícios organizados por step.",
        },
        {
          question: "O que são os Steps?",
          answer:
            "Cada step representa uma aula. Ao concluir uma aula com seu professor, o step é marcado como concluído e os materiais ficam disponíveis para revisão a qualquer momento.",
        },
        {
          question: "Posso refazer os exercícios?",
          answer:
            "Sim. Clique em "Refazer" em qualquer exercício para praticar novamente. O XP só é contabilizado na primeira vez que você responde — revisões não geram XP adicional.",
        },
      ],
    },
    {
      section: "Gamificação",
      items: [
        {
          question: "O que é XP e para que serve?",
          answer:
            "XP (pontos de experiência) mede seu engajamento na plataforma. Você ganha XP ao completar exercícios, manter seu streak e concluir missões diárias. O XP define sua posição no ranking.",
        },
        {
          question: "O que são coins e como uso?",
          answer:
            "Coins são a moeda da loja da steps academy. Você ganha coins junto com o XP e pode trocar por itens na loja — acesse pelo ícone da loja no menu.",
        },
        {
          question: "O que é streak?",
          answer:
            "Streak é sua sequência de dias praticando. Pratique pelo menos uma vez por dia para manter sua sequência. A cada 7 dias consecutivos você ganha um bônus de XP e coins.",
        },
        {
          question: "O que é o Step by Step?",
          answer:
            "É a área de prática diária com mini-games de vocabulário. Você tem uma missão diária de 10 exercícios e pode continuar praticando livremente depois. Disponível em 7 modos: Forca, Lacuna, Tradução, Pares, Embaralhado, Contra o Relógio e Survival.",
        },
      ],
    },
    {
      section: "Perfil e conta",
      items: [
        {
          question: "Como atualizo minha foto de perfil?",
          answer:
            "Acesse seu Perfil pelo menu e clique na foto atual para fazer upload de uma nova imagem.",
        },
        {
          question: "Como mudo o tema do app?",
          answer:
            "No seu Perfil, role até a seção de temas e escolha entre Hello, Olá, Bonjour, Hallo e Clássico. A mudança é aplicada imediatamente.",
        },
        {
          question: "Como conecto minha conta Google?",
          answer:
            "Acesse /login e clique em "Entrar com Google". Ao conectar, suas próximas aulas aparecem automaticamente no Dashboard com link do Meet.",
        },
        {
          question: "Como recebo notificações?",
          answer:
            "Acesse seu Perfil e ative as notificações. Você será avisado sobre novas aulas, avaliações de speaking e comunicados do professor.",
        },
      ],
    },
    {
      section: "Certificados",
      items: [
        {
          question: "Como recebo meu certificado?",
          answer:
            "O certificado é gerado automaticamente ao concluir todos os steps de um nível. Você recebe uma notificação e pode acessar pelo seu Perfil.",
        },
        {
          question: "Posso compartilhar meu certificado?",
          answer:
            "Sim. Cada certificado tem uma página pública com URL única que você pode compartilhar com quem quiser.",
        },
      ],
    },
  ],

  teacher: [
    {
      section: "Gerenciamento de alunos",
      items: [
        {
          question: "Como vejo meus alunos?",
          answer:
            "No seu painel em /teacher, a aba principal lista todos os seus alunos com nome, nível atual e status de progresso.",
        },
        {
          question: "Como marco uma aula como concluída?",
          answer:
            "Na ficha do aluno, clique em "Marcar aula concluída". O sistema avança o aluno para o próximo step automaticamente e libera os materiais correspondentes.",
        },
        {
          question: "Como avanço um aluno de nível?",
          answer:
            "Ao marcar a última aula de um nível como concluída, o sistema gera o certificado automaticamente e move o aluno para o próximo nível.",
        },
      ],
    },
    {
      section: "Agendamento de aulas",
      items: [
        {
          question: "Como agendar uma aula pelo app?",
          answer:
            "No seu painel, clique em "Agendar aula". Busque o aluno pelo nome, selecione data, horário e duração. O app cria o evento no Google Calendar automaticamente com link do Meet e envia convite ao aluno.",
        },
        {
          question: "Preciso conectar minha conta Google?",
          answer:
            "Sim. Para agendar aulas pelo app, faça login com o botão "Entrar com Google" na tela de login. Isso conecta seu Google Calendar à plataforma.",
        },
        {
          question: "O aluno recebe o convite automaticamente?",
          answer:
            "Sim. Ao criar a aula pelo app, o Google envia um convite por email para o aluno com data, horário e link do Meet.",
        },
      ],
    },
    {
      section: "Conteúdo",
      items: [
        {
          question: "Como publico conteúdo para os alunos?",
          answer:
            "No seu painel, acesse a aba Conteúdo, selecione o step desejado e faça upload do slide em PDF. A IA da plataforma analisa o slide e gera exercícios, vocabulário e gramática automaticamente.",
        },
        {
          question: "Posso editar o conteúdo gerado pela IA?",
          answer:
            "Sim. Antes de publicar, você revisa e edita tudo nas abas de Exercícios, Vocabulário e Gramática. Só é publicado o que você confirmar.",
        },
        {
          question: "Como avalio o speaking de um aluno?",
          answer:
            "Na ficha do aluno, acesse a aba Speaking para ouvir as gravações e registrar sua avaliação com feedback escrito.",
        },
      ],
    },
    {
      section: "Nivelamento",
      items: [
        {
          question: "Como faço o nivelamento de um novo aluno?",
          answer:
            "Acesse /nivelamento com o aluno. O Discovery Step tem duas fases — ao final, o sistema define o nível de entrada e registra no perfil do aluno automaticamente.",
        },
      ],
    },
  ],

  admin: [
    {
      section: "Alunos e professores",
      items: [
        {
          question: "Como cadastro um novo aluno?",
          answer:
            "No Admin → Alunos, clique em "Novo aluno" para gerar um token de cadastro. Envie o link para o aluno — ele cria a conta em 3 passos sem precisar de pagamento enquanto o gateway estiver inativo.",
        },
        {
          question: "Como cadastro um professor?",
          answer:
            "No Admin → Professores, clique em "Novo professor" e preencha os dados. O professor recebe o acesso por email.",
        },
        {
          question: "Como crio uma turma?",
          answer:
            "No Admin → Turmas, clique em "Nova turma", defina o nome, idioma, professor responsável e aloque os alunos.",
        },
      ],
    },
    {
      section: "Pagamentos",
      items: [
        {
          question: "Como visualizo o status de pagamento dos alunos?",
          answer:
            "No Admin → Pagamentos você vê todos os alunos com seus status: ativo, inadimplente ou suspenso.",
        },
        {
          question: "O que acontece quando um aluno fica inadimplente?",
          answer:
            "Do D1 ao D5 o aluno vê um banner de aviso mas acessa normalmente. A partir do D6 o acesso é bloqueado e ele é redirecionado para /acesso-suspenso.",
        },
        {
          question: "Como marco um aluno como corporativo?",
          answer:
            "Na ficha do aluno, ative a opção "Corporativo". Alunos corporativos são isentos do fluxo de pagamento — a empresa paga por fora.",
        },
      ],
    },
    {
      section: "Conteúdo e notificações",
      items: [
        {
          question: "Como envio uma notificação para os alunos?",
          answer:
            "No Admin → Notificações, clique em "Nova notificação", defina o título, mensagem e destinatário (aluno específico ou todos) e envie.",
        },
        {
          question: "Como acompanho o progresso geral da escola?",
          answer:
            "No Admin → KPIs você vê métricas gerais: total de alunos ativos, aulas realizadas, engajamento com gamificação e status de pagamentos.",
        },
      ],
    },
  ],
};

// ── Component ─────────────────────────────────────────────────────────────────

const Help = () => {
  const { profile } = useAuth();
  const [search, setSearch] = useState("");

  const role = (profile?.role as keyof typeof HELP_CONTENT) ?? "student";
  const sections = HELP_CONTENT[role] ?? HELP_CONTENT.student;

  // Flat list for search results
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return null;
    const results: (HelpItem & { section: string })[] = [];
    for (const sec of sections) {
      for (const item of sec.items) {
        if (
          item.question.toLowerCase().includes(term) ||
          item.answer.toLowerCase().includes(term)
        ) {
          results.push({ ...item, section: sec.section });
        }
      }
    }
    return results;
  }, [search, sections]);

  return (
    <StudentLayout>
      <div className="space-y-6 max-w-2xl">

        {/* ── Header ── */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Central de Ajuda</h1>
          <p className="text-sm text-muted-foreground font-light">
            Encontre respostas para as principais dúvidas sobre a plataforma.
          </p>
        </div>

        {/* ── Search ── */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar pergunta ou palavra-chave…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* ── Search results ── */}
        {filtered !== null && (
          filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <HelpCircle className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground font-light">
                Nenhum resultado para{" "}
                <span className="font-medium text-foreground">"{search}"</span>.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-light uppercase tracking-wide">
                {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
              </p>
              <Accordion type="multiple">
                {filtered.map((item, i) => (
                  <AccordionItem key={i} value={`search-${i}`}>
                    <AccordionTrigger className="text-sm font-semibold text-left gap-3">
                      <span className="flex-1">{item.question}</span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className="text-sm text-muted-foreground font-light leading-relaxed">
                        {item.answer}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 mt-2 uppercase tracking-wide">
                        {item.section}
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )
        )}

        {/* ── Sections (normal view) ── */}
        {filtered === null && (
          <div className="space-y-8">
            {sections.map((sec, si) => (
              <div key={si} className="space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-0.5">
                  {sec.section}
                </h2>
                <Accordion type="multiple">
                  {sec.items.map((item, ii) => (
                    <AccordionItem key={ii} value={`${si}-${ii}`}>
                      <AccordionTrigger className="text-sm font-semibold text-left">
                        {item.question}
                      </AccordionTrigger>
                      <AccordionContent>
                        <p className="text-sm text-muted-foreground font-light leading-relaxed">
                          {item.answer}
                        </p>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ))}
          </div>
        )}

      </div>
    </StudentLayout>
  );
};

export default Help;
