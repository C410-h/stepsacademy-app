-- 65_national_holidays_messages
-- Adiciona campos de cancelamento automático e mensagem personalizada

ALTER TABLE public.national_holidays
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS sessions_cancelled integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Mensagens personalizadas por feriado 2026 (tom adequado a cada data)
UPDATE public.national_holidays SET message = 'Feliz Ano Novo! 🎉 As aulas estão suspensas hoje. Que 2026 seja incrível para os seus estudos!'
  WHERE date = '2026-01-01';

UPDATE public.national_holidays SET message = 'Feliz Carnaval! 🎭 As aulas estão suspensas hoje. Aproveite a festa com segurança!'
  WHERE date IN ('2026-02-17', '2026-02-18');

UPDATE public.national_holidays SET message = 'Sexta-Feira Santa. As aulas estão suspensas hoje. Um momento de reflexão e paz.'
  WHERE date = '2026-04-03';

UPDATE public.national_holidays SET message = 'Feliz Páscoa! 🐣 As aulas estão suspensas hoje. Um dia de celebração e renovação em família!'
  WHERE date = '2026-04-05';

UPDATE public.national_holidays SET message = 'Feriado de Tiradentes! As aulas estão suspensas hoje. Uma homenagem ao mártir da independência brasileira. 🇧🇷'
  WHERE date = '2026-04-21';

UPDATE public.national_holidays SET message = 'Feliz Dia do Trabalhador! 💪 As aulas estão suspensas hoje. Uma data para valorizar quem constrói o Brasil!'
  WHERE date = '2026-05-01';

UPDATE public.national_holidays SET message = 'Feriado de Corpus Christi. As aulas estão suspensas hoje. Bom descanso!'
  WHERE date = '2026-06-04';

UPDATE public.national_holidays SET message = 'Feliz Dia da Independência do Brasil! 🇧🇷 As aulas estão suspensas hoje. Viva a liberdade!'
  WHERE date = '2026-09-07';

UPDATE public.national_holidays SET message = 'Feriado de Nossa Senhora Aparecida. As aulas estão suspensas hoje. Bom descanso!'
  WHERE date = '2026-10-12';

UPDATE public.national_holidays SET message = 'Feriado de Finados. Um dia de memória, gratidão e respeito. As aulas estão suspensas hoje.'
  WHERE date = '2026-11-02';

UPDATE public.national_holidays SET message = 'Feriado da Proclamação da República! As aulas estão suspensas hoje. Bom descanso! 🇧🇷'
  WHERE date = '2026-11-15';

UPDATE public.national_holidays SET message = 'Dia da Consciência Negra. As aulas estão suspensas hoje. Uma data de celebração e valorização da história e cultura afro-brasileira. ✊🏾'
  WHERE date = '2026-11-20';

UPDATE public.national_holidays SET message = 'Feliz Natal! 🎄 As aulas estão suspensas hoje. Um dia de amor, paz e celebração em família!'
  WHERE date = '2026-12-25';
