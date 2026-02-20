
-- Remover política permissiva de INSERT e substituir por uma mais restrita
DROP POLICY "Service role can insert admin_confirmations" ON public.admin_confirmations;

-- O service role bypassa RLS por padrão — a política ALL de admin já cobre o necessário
-- Não é necessária política separada de INSERT com WITH CHECK (true)
