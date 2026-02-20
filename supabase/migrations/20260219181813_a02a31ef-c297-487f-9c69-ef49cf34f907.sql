
-- =====================================================
-- 1. ADD NEW COLUMNS TO app_users (INCREMENTAL ONLY)
-- =====================================================

-- Dados Pessoais
ALTER TABLE public.app_users
ADD COLUMN IF NOT EXISTS nome_social text,
ADD COLUMN IF NOT EXISTS cpf varchar(14),
ADD COLUMN IF NOT EXISTS rg varchar(20),
ADD COLUMN IF NOT EXISTS orgao_emissor varchar(20),
ADD COLUMN IF NOT EXISTS data_emissao_rg date,
ADD COLUMN IF NOT EXISTS data_nascimento date,
ADD COLUMN IF NOT EXISTS sexo varchar(20),
ADD COLUMN IF NOT EXISTS estado_civil varchar(20),
ADD COLUMN IF NOT EXISTS nacionalidade text,
ADD COLUMN IF NOT EXISTS naturalidade text,
ADD COLUMN IF NOT EXISTS nome_mae text,
ADD COLUMN IF NOT EXISTS nome_pai text,
ADD COLUMN IF NOT EXISTS pis_pasep_nit varchar(20),
ADD COLUMN IF NOT EXISTS titulo_eleitor varchar(20),
ADD COLUMN IF NOT EXISTS cnh varchar(20);

-- Endereço
ALTER TABLE public.app_users
ADD COLUMN IF NOT EXISTS cep varchar(10),
ADD COLUMN IF NOT EXISTS logradouro text,
ADD COLUMN IF NOT EXISTS numero varchar(10),
ADD COLUMN IF NOT EXISTS complemento text,
ADD COLUMN IF NOT EXISTS bairro text,
ADD COLUMN IF NOT EXISTS cidade text,
ADD COLUMN IF NOT EXISTS estado varchar(2),
ADD COLUMN IF NOT EXISTS pais text DEFAULT 'Brasil';

-- Contato
ALTER TABLE public.app_users
ADD COLUMN IF NOT EXISTS celular text,
ADD COLUMN IF NOT EXISTS email_corporativo text;

-- Dados Contratuais (eSocial)
ALTER TABLE public.app_users
ADD COLUMN IF NOT EXISTS tipo_vinculo varchar(20),
ADD COLUMN IF NOT EXISTS matricula_interna varchar(30),
ADD COLUMN IF NOT EXISTS cargo text,
ADD COLUMN IF NOT EXISTS cbo varchar(10),
ADD COLUMN IF NOT EXISTS departamento text,
ADD COLUMN IF NOT EXISTS centro_custo text,
ADD COLUMN IF NOT EXISTS data_admissao date,
ADD COLUMN IF NOT EXISTS data_inicio_efetivo date,
ADD COLUMN IF NOT EXISTS tipo_contrato varchar(30),
ADD COLUMN IF NOT EXISTS jornada text,
ADD COLUMN IF NOT EXISTS salario_base numeric(15,2),
ADD COLUMN IF NOT EXISTS forma_pagamento varchar(30),
ADD COLUMN IF NOT EXISTS banco varchar(30),
ADD COLUMN IF NOT EXISTS agencia varchar(20),
ADD COLUMN IF NOT EXISTS conta varchar(30),
ADD COLUMN IF NOT EXISTS tipo_conta varchar(20);

-- Dados Societários
ALTER TABLE public.app_users
ADD COLUMN IF NOT EXISTS percentual_participacao numeric(5,2),
ADD COLUMN IF NOT EXISTS capital_integralizado numeric(15,2),
ADD COLUMN IF NOT EXISTS pro_labore numeric(15,2),
ADD COLUMN IF NOT EXISTS data_entrada_sociedade date,
ADD COLUMN IF NOT EXISTS tipo_socio varchar(30);

-- URLs de Documentos Digitalizados
ALTER TABLE public.app_users
ADD COLUMN IF NOT EXISTS rg_url text,
ADD COLUMN IF NOT EXISTS cpf_url text,
ADD COLUMN IF NOT EXISTS comprovante_residencia_url text,
ADD COLUMN IF NOT EXISTS contrato_trabalho_url text,
ADD COLUMN IF NOT EXISTS contrato_social_url text;

-- =====================================================
-- 2. CREATE user_audit_logs TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage user_audit_logs"
ON public.user_audit_logs
FOR ALL
TO authenticated
USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_user_audit_logs_user_id ON public.user_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_audit_logs_changed_at ON public.user_audit_logs(changed_at DESC);

-- =====================================================
-- 3. CREATE STORAGE BUCKET FOR USER DOCUMENTS
-- =====================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('user-documents', 'user-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins can manage user documents"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'user-documents' AND public.is_admin())
WITH CHECK (bucket_id = 'user-documents' AND public.is_admin());

CREATE POLICY "Users can view own documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'user-documents' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- =====================================================
-- 4. NOTIFY POSTGREST TO RELOAD SCHEMA
-- =====================================================
NOTIFY pgrst, 'reload schema';
