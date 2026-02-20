
-- 1. Forçar reload do schema cache do PostgREST
NOTIFY pgrst, 'reload schema';

-- 2. Corrigir a política RLS de RESTRICTIVE para PERMISSIVE
-- A política atual (Permissive: No = RESTRICTIVE) pode bloquear acessos mesmo com service_role via REST
DROP POLICY IF EXISTS "Admins can manage admin_confirmations" ON public.admin_confirmations;

-- Recriar como PERMISSIVE (padrão correto para políticas de acesso)
CREATE POLICY "Admins can manage admin_confirmations"
  ON public.admin_confirmations
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- 3. Garantir que service_role (usado pelo n8n) sempre tenha acesso (bypassa RLS por padrão, mas garantir explicitamente)
-- Verificar e garantir que RLS está ativa mas service_role não é bloqueado
ALTER TABLE public.admin_confirmations ENABLE ROW LEVEL SECURITY;

-- 4. Adicionar política para permitir insert via service_role (n8n com chave de serviço)
-- Service role bypassa RLS nativamente, mas policy explícita garante via anon/authenticated também
CREATE POLICY "Service role full access admin_confirmations"
  ON public.admin_confirmations
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
