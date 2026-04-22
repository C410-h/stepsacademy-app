import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const PrivacyPolicy = () => {
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
          <span className="font-semibold text-sm truncate">Política de Privacidade</span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8 text-sm text-foreground leading-relaxed">
        {/* Logo */}
        <div className="flex justify-center">
          <img src="/brand/logo-over-darkpurple.webp" alt="steps academy" className="h-10" />
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Política de Privacidade</h1>
          <p className="text-muted-foreground text-xs">Última atualização: abril de 2026</p>
        </div>

        <p>
          A <strong>steps academy</strong> ("nós", "nosso" ou "steps") valoriza sua privacidade e está comprometida
          em proteger seus dados pessoais. Esta Política de Privacidade descreve como coletamos, usamos, armazenamos
          e protegemos as informações fornecidas ao utilizar nossa plataforma disponível em{" "}
          <a href="https://stepsacademy.com.br" className="text-primary underline">stepsacademy.com.br</a>{" "}
          e em nosso aplicativo.
        </p>

        {/* 1 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">1. Dados que coletamos</h2>
          <p>Coletamos os seguintes tipos de informações:</p>
          <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
            <li><strong className="text-foreground">Dados de cadastro:</strong> nome completo, e-mail e idioma de interesse fornecidos no momento do registro.</li>
            <li><strong className="text-foreground">Dados de uso:</strong> aulas assistidas, exercícios realizados, progresso por etapa, pontuações e conquistas dentro da plataforma.</li>
            <li><strong className="text-foreground">Dados de conta Google (opcional):</strong> quando você conecta sua conta do Google, obtemos acesso ao seu Google Calendar para exibição das próximas aulas agendadas. Não acessamos outros dados do Google além do calendário.</li>
            <li><strong className="text-foreground">Dados de pagamento:</strong> status de pagamento e histórico de mensalidades. Dados de cartão são processados exclusivamente por nossa plataforma de pagamento e nunca armazenados por nós.</li>
            <li><strong className="text-foreground">Dados técnicos:</strong> tipo de dispositivo, sistema operacional e informações de sessão necessárias para o funcionamento do aplicativo.</li>
          </ul>
        </section>

        {/* 2 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">2. Como usamos seus dados</h2>
          <p>Utilizamos suas informações para:</p>
          <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
            <li>Criar e gerenciar sua conta de aluno;</li>
            <li>Personalizar sua jornada de aprendizado com base no seu nível e progresso;</li>
            <li>Exibir suas próximas aulas ao vivo integradas ao Google Calendar;</li>
            <li>Enviar notificações sobre aulas, novidades e lembretes importantes;</li>
            <li>Processar cobranças e gerenciar assinaturas;</li>
            <li>Melhorar continuamente a plataforma com base nos padrões de uso;</li>
            <li>Cumprir obrigações legais e regulatórias.</li>
          </ul>
        </section>

        {/* 3 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">3. Compartilhamento de dados</h2>
          <p>
            Não vendemos nem alugamos seus dados pessoais. Podemos compartilhá-los apenas nas seguintes situações:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
            <li><strong className="text-foreground">Com professores:</strong> seu nome, e-mail e progresso são visíveis ao professor responsável pela sua turma.</li>
            <li><strong className="text-foreground">Com prestadores de serviço:</strong> utilizamos o Supabase (infraestrutura de banco de dados e autenticação) e Google (calendário e autenticação). Esses parceiros operam sob seus próprios termos e políticas de privacidade.</li>
            <li><strong className="text-foreground">Por obrigação legal:</strong> quando exigido por lei, ordem judicial ou autoridade competente.</li>
          </ul>
        </section>

        {/* 4 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">4. Armazenamento e segurança</h2>
          <p>
            Seus dados são armazenados em servidores seguros com criptografia em trânsito (TLS) e em repouso.
            Adotamos medidas técnicas e organizacionais adequadas para proteger suas informações contra acesso
            não autorizado, perda ou divulgação indevida.
          </p>
          <p>
            Mantemos seus dados enquanto sua conta estiver ativa ou pelo tempo necessário para cumprir
            obrigações legais. Você pode solicitar a exclusão a qualquer momento (veja a seção 6).
          </p>
        </section>

        {/* 5 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">5. Cookies e tecnologias similares</h2>
          <p>
            Utilizamos cookies de sessão e armazenamento local exclusivamente para manter você autenticado
            e para salvar preferências do aplicativo (como tema e configurações). Não utilizamos cookies
            de rastreamento publicitário.
          </p>
        </section>

        {/* 6 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">6. Seus direitos</h2>
          <p>Nos termos da Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018), você tem direito a:</p>
          <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
            <li>Confirmar a existência de tratamento e acessar seus dados;</li>
            <li>Corrigir dados incompletos, inexatos ou desatualizados;</li>
            <li>Solicitar a anonimização, bloqueio ou eliminação de dados desnecessários;</li>
            <li>Revogar o consentimento a qualquer momento;</li>
            <li>Solicitar a portabilidade de seus dados;</li>
            <li>Ser informado sobre compartilhamentos realizados.</li>
          </ul>
          <p>
            Para exercer qualquer um desses direitos, entre em contato conosco pelo e-mail{" "}
            <a href="mailto:contato@stepsacademy.com.br" className="text-primary underline">
              contato@stepsacademy.com.br
            </a>{" "}
            ou pelo WhatsApp{" "}
            <a
              href="https://wa.me/5521969260979"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              (21) 96926-0979
            </a>.
          </p>
        </section>

        {/* 7 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">7. Menores de idade</h2>
          <p>
            Nossa plataforma não é direcionada a menores de 13 anos. Alunos entre 13 e 18 anos devem ter
            o consentimento de um responsável legal para se cadastrar. Se tomarmos conhecimento de que
            coletamos dados de um menor sem o devido consentimento, excluiremos essas informações.
          </p>
        </section>

        {/* 8 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">8. Alterações nesta política</h2>
          <p>
            Podemos atualizar esta Política de Privacidade periodicamente. Quando houver alterações
            relevantes, notificaremos você pelo aplicativo ou por e-mail. O uso contínuo da plataforma
            após as alterações representa sua concordância com a nova versão.
          </p>
        </section>

        {/* 9 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">9. Contato</h2>
          <p>
            Em caso de dúvidas sobre esta política ou sobre o tratamento de seus dados, fale com a gente:
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

export default PrivacyPolicy;
