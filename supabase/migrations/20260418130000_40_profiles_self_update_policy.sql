-- Migration 40: permite que cada usuário atualize o próprio perfil
-- Sem essa política o UPDATE do modal "Complete seu perfil" falha silenciosamente (RLS bloqueia)
CREATE POLICY "usuário atualiza próprio perfil"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
