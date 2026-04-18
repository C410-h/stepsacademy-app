-- Migration 41: policies UPDATE e DELETE para o bucket avatars
-- Sem UPDATE, o upsert:true falha silenciosamente na segunda troca de foto
-- (a primeira funciona porque usa INSERT; a segunda já existe e precisa de UPDATE)
-- O path do arquivo é flat: {uuid}.{ext}  (ex: "abc-123.jpg")
-- split_part(name, '.', 1) extrai o UUID antes da extensão

CREATE POLICY "usuário atualiza próprio avatar"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND split_part(name, '.', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND split_part(name, '.', 1) = auth.uid()::text
  );

CREATE POLICY "usuário deleta próprio avatar"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND split_part(name, '.', 1) = auth.uid()::text
  );
