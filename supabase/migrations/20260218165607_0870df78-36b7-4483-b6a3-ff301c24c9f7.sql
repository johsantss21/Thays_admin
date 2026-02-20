
-- Atualização incremental da tabela admin_confirmations
-- Adiciona campos de rastreabilidade e contexto sem alterar estrutura existente

ALTER TABLE public.admin_confirmations
  ADD COLUMN IF NOT EXISTS target_id uuid NULL,
  ADD COLUMN IF NOT EXISTS user_id uuid NULL,
  ADD COLUMN IF NOT EXISTS executed_at timestamp with time zone NULL,
  ADD COLUMN IF NOT EXISTS execution_status text NULL;

-- Foreign key opcional para auth.users (ON DELETE SET NULL para não quebrar registros)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_admin_confirmation_user'
    AND table_name = 'admin_confirmations'
  ) THEN
    ALTER TABLE public.admin_confirmations
      ADD CONSTRAINT fk_admin_confirmation_user
      FOREIGN KEY (user_id)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Index para buscas por target_id (sem alterar índices existentes)
CREATE INDEX IF NOT EXISTS idx_admin_confirmations_target_id
  ON public.admin_confirmations (target_id)
  WHERE target_id IS NOT NULL;

-- Index para execution_status
CREATE INDEX IF NOT EXISTS idx_admin_confirmations_execution_status
  ON public.admin_confirmations (execution_status)
  WHERE execution_status IS NOT NULL;
