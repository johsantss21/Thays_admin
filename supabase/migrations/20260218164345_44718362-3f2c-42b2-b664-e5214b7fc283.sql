
-- Criar tabela admin_confirmations no schema public
CREATE TABLE public.admin_confirmations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_phone text NOT NULL,
  command_type text NOT NULL,
  confirmation_received boolean DEFAULT false,
  confirmed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'pending'
);

-- Habilitar RLS conforme padrão do projeto
ALTER TABLE public.admin_confirmations ENABLE ROW LEVEL SECURITY;

-- Somente admins podem gerenciar confirmações administrativas
CREATE POLICY "Admins can manage admin_confirmations"
  ON public.admin_confirmations
  FOR ALL
  USING (is_admin());

-- Service role pode inserir (para n8n via edge functions)
CREATE POLICY "Service role can insert admin_confirmations"
  ON public.admin_confirmations
  FOR INSERT
  WITH CHECK (true);

-- Index para buscas por phone + status
CREATE INDEX idx_admin_confirmations_phone_status 
  ON public.admin_confirmations (admin_phone, status);

CREATE INDEX idx_admin_confirmations_created_at 
  ON public.admin_confirmations (created_at DESC);
