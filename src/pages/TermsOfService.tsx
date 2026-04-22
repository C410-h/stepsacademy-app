import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const TermsOfService = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-sm truncate">Termos de Serviço</span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8 text-sm text-foreground leading-relaxed">
        {/* Logo */}
        <div className="flex justify-center">
          <img src="/brand/logo-over-darkpurple.webp" alt="steps academy" className="h-10" />
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Termos de Serviço</h1>
          <p className="text-muted-foreground text-xs">Última atualização: abril de 2026</p>
        </div>

        <p>
          Bem-vindo à <strong>steps academy</strong>! Ao criar uma conta e utilizar nossa plataforma,
          você concorda com os Termos de Serviço descritos abaixo. Leia com atenção antes de prosseguir.
          Em caso de dúvida, entre em contato conosco antes de se cadastrar.
        </p>

        {/* 1 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">1. Sobre a steps academy</h2>
          <p>
            A steps academy é uma plataforma de ensino de idiomas online que oferece aulas ao vivo,
            materiais didáticos, exercícios e ferramentas de acompanhamento de progresso. Nosso serviço
            é prestado por meio do aplicativo web disponível em{" "}
            <a href="https://stepsacademy.com.br" className="text-primary underline">
              stepsacademy.com.br
            </a>.
          </p>
        </section>

        {/* 2 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">2. Elegibilidade</h2>
          <p>
            Para utilizar a plataforma, você deve:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
            <li>Ter pelo menos 13 anos de idade (ou contar com autorização de um responsável legal);</li>
            <li>Fornecer informações verdadeiras e precisas no cadastro;</li>
            <li>Manter seus dados de acesso em sigilo e ser responsável por toda atividade realizada com sua conta.</li>
          </ul>
        </section>

        {/* 3 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">3. Conta de usuário</h2>
          <p>
            Cada conta é pessoal e intransferível. Você é responsável por manter a confidencialidade
            de seu e-mail e senha. Ao detectar qualquer uso não autorizado da sua conta, notifique-nos
            imediatamente.
          </p>
          <p>
            Reservamo-nos o direito de suspender ou encerrar contas que violem estes Termos, utilizem
            a plataforma de forma abusiva ou compartilhem credenciais de acesso com terceiros.
          </p>
        </section>

        {/* 4 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">4. Planos e pagamento</h2>
          <p>
            O acesso completo à plataforma está condicionado à contratação de um plano ativo. Os planos
            disponíveis, seus valores e condições são exibidos na página de planos do aplicativo.
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
            <li>Os pagamentos são processados mensalmente, salvo condições específicas do plano contratado.</li>
            <li>Em caso de inadimplência superior a 5 (cinco) dias úteis, o acesso à plataforma poderá ser suspenso automaticamente.</li>
            <li>Cancelamentos devem ser solicitados com pelo menos 5 (cinco) dias de antecedência ao próximo vencimento.</li>
            <li>Não realizamos reembolsos de períodos já utilizados, salvo em casos previstos pelo Código de Defesa do Consumidor.</li>
          </ul>
        </section>

        {/* 5 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">5. Aulas ao vivo</h2>
          <p>
            As aulas ao vivo são realizadas por videoconferência e agendadas conforme disponibilidade
            do professor e do aluno. Ao contratar nosso serviço, você concorda com as seguintes regras:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
            <li><strong className="text-foreground">Cancelamento:</strong> avise a ausência com pelo menos 24 horas de antecedência pelo aplicativo.</li>
            <li><strong className="text-foreground">Falta sem aviso:</strong> aulas não canceladas com a devida antecedência são consideradas realizadas e não serão repostas.</li>
            <li><strong className="text-foreground">Reagendamento:</strong> pode ser solicitado com antecedência mínima de 24 horas, sujeito à disponibilidade do professor.</li>
            <li><strong className="text-foreground">Pontualidade:</strong> atrasos superiores a 15 minutos sem comunicação prévia serão tratados como falta.</li>
          </ul>
        </section>

        {/* 6 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">6. Uso aceitável</h2>
          <p>
            Ao utilizar a plataforma, você concorda em não:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
            <li>Compartilhar sua conta com outras pessoas;</li>
            <li>Reproduzir, distribuir ou comercializar qualquer conteúdo da plataforma sem autorização;</li>
            <li>Tentar acessar áreas restritas ou modificar o sistema de forma não autorizada;</li>
            <li>Utilizar o serviço para fins ilegais ou que violem direitos de terceiros;</li>
            <li>Enviar conteúdo ofensivo, discriminatório ou inadequado nas interações com professores e colegas.</li>
          </ul>
        </section>

        {/* 7 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">7. Propriedade intelectual</h2>
          <p>
            Todo o conteúdo disponível na plataforma — incluindo materiais didáticos, exercícios, vídeos,
            textos e elementos visuais — é de propriedade exclusiva da steps academy ou de seus licenciantes.
            É proibida qualquer reprodução sem autorização expressa por escrito.
          </p>
          <p>
            O uso da plataforma não transfere ao aluno nenhum direito de propriedade intelectual sobre
            o conteúdo acessado.
          </p>
        </section>

        {/* 8 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">8. Limitação de responsabilidade</h2>
          <p>
            A steps academy não se responsabiliza por:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
            <li>Interrupções temporárias do serviço por manutenção ou fatores fora do nosso controle;</li>
            <li>Problemas de conexão ou equipamento de responsabilidade do usuário;</li>
            <li>Resultados de aprendizado, uma vez que o progresso depende também do empenho e dedicação do aluno.</li>
          </ul>
          <p>
            Nos comprometemos a manter a plataforma disponível e funcional, comunicando com antecedência
            qualquer manutenção programada.
          </p>
        </section>

        {/* 9 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">9. Modificações nos termos</h2>
          <p>
            Podemos atualizar estes Termos de Serviço a qualquer momento. Alterações relevantes serão
            comunicadas pelo aplicativo ou por e-mail com pelo menos 10 (dez) dias de antecedência.
            O uso contínuo da plataforma após o prazo representa concordância com os novos termos.
          </p>
        </section>

        {/* 10 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">10. Legislação aplicável</h2>
          <p>
            Estes Termos são regidos pelas leis brasileiras, em especial pelo Código de Defesa do
            Consumidor (Lei 8.078/1990), a Lei Geral de Proteção de Dados (Lei 13.709/2018) e o Marco
            Civil da Internet (Lei 12.965/2014). Fica eleito o foro da comarca do Rio de Janeiro/RJ
            para dirimir eventuais conflitos.
          </p>
        </section>

        {/* 11 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">11. Contato</h2>
          <p>
            Para dúvidas, reclamações ou solicitações relacionadas a estes Termos, entre em contato:
          </p>
          <ul className="list-none space-y-1 text-muted-foreground">
            <li>
              <strong className="text-foreground">E-mail:</strong>{" "}
              <a href="mailto:contato@stepsacademy.com.br" className="text-primary underline">
                contato@stepsacademy.com.br
              </a>
            </li>
            <li>
              <strong className="text-foreground">WhatsApp:</strong>{" "}
              <a
                href="https://wa.me/5521969260979"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                (21) 96926-0979
              </a>
            </li>
            <li>
              <strong className="text-foreground">Site:</strong>{" "}
              <a href="https://stepsacademy.com.br" className="text-primary underline">
                stepsacademy.com.br
              </a>
            </li>
          </ul>
        </section>

        <div className="pt-4 border-t border-border text-xs text-muted-foreground text-center">
          © {new Date().getFullYear()} steps academy. Todos os direitos reservados.
        </div>
      </main>
    </div>
  );
};

export default TermsOfService;
