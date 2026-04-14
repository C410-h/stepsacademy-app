import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BookOpen, Video, HelpCircle, GraduationCap } from "lucide-react";
import steppieDesconfiado from "@/assets/steppie/steppie-desconfiado.svg";

const guides = [
  { icon: <BookOpen className="h-6 w-6" />, title: "Materiais", desc: "Acesse vocabulário, gramática e exercícios antes e depois de cada aula." },
  { icon: <Video className="h-6 w-6" />, title: "Aulas ao vivo", desc: "Entre na sua aula ao vivo pelo botão 'Entrar na aula' na tela inicial." },
  { icon: <GraduationCap className="h-6 w-6" />, title: "Progresso", desc: "Acompanhe sua jornada de 40 passos até concluir o nível." },
];

const faqs = [
  { q: "Onde encontro meus materiais?", a: "Na aba 'Materiais' da navegação inferior. Lá você encontra tudo organizado por momento: antes, durante e após a aula." },
  { q: "Como entro na aula?", a: "Na tela inicial, clique no botão verde 'Entrar na aula'. Ele abre o link do Google Meet da sua aula agendada." },
  { q: "Como vejo meu progresso?", a: "Na aba 'Progresso', você vê um mapa com todos os 40 passos do seu nível. Os passos concluídos ficam em roxo com um ✓ verde." },
];

const Help = () => {
  return (
    <StudentLayout>
      <div className="space-y-6">
        <h2 className="text-xl font-bold">Ajuda</h2>

        {/* Guides */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide">Como funciona a plataforma</h3>
          {guides.map((g, i) => (
            <Card key={i}>
              <CardContent className="flex items-start gap-3 py-4 px-4">
                <div className="text-primary mt-0.5">{g.icon}</div>
                <div>
                  <p className="text-sm font-bold">{g.title}</p>
                  <p className="text-xs text-muted-foreground font-light mt-1">{g.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Onboarding video placeholder */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Video className="h-5 w-5 text-primary" />
              Vídeo de boas-vindas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full aspect-video bg-muted rounded-lg flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Vídeo em breve</p>
            </div>
          </CardContent>
        </Card>

        {/* FAQ */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <HelpCircle className="h-4 w-4" /> Perguntas frequentes
            </h3>
            <img src={steppieDesconfiado} alt="" aria-hidden="true" className="w-14 -mt-2" />
          </div>
          <Accordion type="single" collapsible>
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-sm font-bold text-left">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground font-light">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </StudentLayout>
  );
};

export default Help;
