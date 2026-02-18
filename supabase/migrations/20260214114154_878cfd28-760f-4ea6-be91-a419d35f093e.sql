
-- =====================================================
-- MÓDULO: Usuários & Permissões + Auditoria
-- =====================================================

-- 1. Tabela de Roles (perfis de acesso)
CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage roles" ON public.roles FOR ALL USING (public.is_admin());
CREATE POLICY "Authenticated can view roles" ON public.roles FOR SELECT TO authenticated USING (true);

-- 2. Tabela de Permissions (catálogo)
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource text NOT NULL,
  action text NOT NULL,
  description text,
  UNIQUE(resource, action)
);
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage permissions" ON public.permissions FOR ALL USING (public.is_admin());
CREATE POLICY "Authenticated can view permissions" ON public.permissions FOR SELECT TO authenticated USING (true);

-- 3. Tabela role_permissions (vínculo)
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  UNIQUE(role_id, permission_id)
);
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage role_permissions" ON public.role_permissions FOR ALL USING (public.is_admin());
CREATE POLICY "Authenticated can view role_permissions" ON public.role_permissions FOR SELECT TO authenticated USING (true);

-- 4. Tabela app_users (extensão de auth.users com campos operacionais)
CREATE TABLE public.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','suspenso','bloqueado')),
  role_id uuid REFERENCES public.roles(id),
  last_login_at timestamptz,
  failed_login_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  must_change_password boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage app_users" ON public.app_users FOR ALL USING (public.is_admin());
CREATE POLICY "Users can view own app_user" ON public.app_users FOR SELECT USING (user_id = auth.uid());

-- 5. Tabela user_permission_overrides
CREATE TABLE public.user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  effect text NOT NULL CHECK (effect IN ('allow','deny')),
  UNIQUE(user_id, permission_id)
);
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage overrides" ON public.user_permission_overrides FOR ALL USING (public.is_admin());

-- 6. Tabela api_tokens
CREATE TABLE public.api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  token_hash text NOT NULL,
  token_preview text NOT NULL, -- últimos 4 chars
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','revogado')),
  role_id uuid REFERENCES public.roles(id),
  scopes text[], -- lista de resource.action
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  created_by_user_id uuid,
  expires_at timestamptz,
  ip_allowlist text[],
  revoked_at timestamptz,
  revoked_by uuid,
  revocation_reason text
);
ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage api_tokens" ON public.api_tokens FOR ALL USING (public.is_admin());

-- 7. Tabela audit_logs
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL CHECK (actor_type IN ('user','api_token')),
  actor_id uuid NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  before_data jsonb,
  after_data jsonb,
  justification text,
  ip text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view audit_logs" ON public.audit_logs FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can insert audit_logs" ON public.audit_logs FOR INSERT WITH CHECK (public.is_admin());
-- Service role inserts are not blocked by RLS

-- 8. Tabela security_settings (config de segurança)
-- Usaremos system_settings existente com chaves específicas

-- 9. Triggers de updated_at
CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_app_users_updated_at BEFORE UPDATE ON public.app_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 10. Função para verificar permissão de um usuário
CREATE OR REPLACE FUNCTION public.user_has_permission(_user_id uuid, _resource text, _action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- Check for explicit deny override first
    WHEN EXISTS (
      SELECT 1 FROM user_permission_overrides upo
      JOIN app_users au ON au.id = upo.user_id
      JOIN permissions p ON p.id = upo.permission_id
      WHERE au.user_id = _user_id
        AND p.resource = _resource
        AND p.action = _action
        AND upo.effect = 'deny'
    ) THEN false
    -- Check for explicit allow override
    WHEN EXISTS (
      SELECT 1 FROM user_permission_overrides upo
      JOIN app_users au ON au.id = upo.user_id
      JOIN permissions p ON p.id = upo.permission_id
      WHERE au.user_id = _user_id
        AND p.resource = _resource
        AND p.action = _action
        AND upo.effect = 'allow'
    ) THEN true
    -- Check role permissions
    WHEN EXISTS (
      SELECT 1 FROM role_permissions rp
      JOIN app_users au ON au.role_id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE au.user_id = _user_id
        AND p.resource = _resource
        AND p.action = _action
    ) THEN true
    -- Fallback: admin role always has access
    WHEN public.has_role(_user_id, 'admin') THEN true
    ELSE false
  END
$$;

-- 11. Seed: Roles padrão
INSERT INTO public.roles (name, description, is_system) VALUES
  ('Administrador', 'Acesso total ao sistema', true),
  ('Operador', 'Operações do dia-a-dia (pedidos, entregas)', true),
  ('Entregador', 'Visualizar e atualizar entregas', true),
  ('Financeiro', 'Acesso a pagamentos e relatórios', true),
  ('Suporte', 'Atendimento e consulta de dados', true);

-- 12. Seed: Catálogo de permissões
INSERT INTO public.permissions (resource, action, description) VALUES
  -- Produtos
  ('products', 'view', 'Visualizar produtos'),
  ('products', 'create', 'Criar produtos'),
  ('products', 'edit', 'Editar produtos'),
  ('products', 'delete', 'Excluir produtos'),
  -- Clientes
  ('customers', 'view', 'Visualizar clientes'),
  ('customers', 'create', 'Criar clientes'),
  ('customers', 'edit', 'Editar clientes'),
  -- Pedidos
  ('orders', 'view', 'Visualizar pedidos'),
  ('orders', 'create', 'Criar pedidos'),
  ('orders', 'edit', 'Editar pedidos'),
  ('orders', 'cancel', 'Cancelar pedidos'),
  ('orders', 'print', 'Imprimir pedidos'),
  ('orders', 'export', 'Exportar pedidos'),
  -- Assinaturas
  ('subscriptions', 'view', 'Visualizar assinaturas'),
  ('subscriptions', 'create', 'Criar assinaturas'),
  ('subscriptions', 'edit', 'Editar assinaturas'),
  ('subscriptions', 'cancel', 'Cancelar assinaturas'),
  ('subscriptions', 'pause', 'Pausar assinaturas'),
  ('subscriptions', 'print', 'Imprimir assinaturas'),
  ('subscriptions', 'export', 'Exportar assinaturas'),
  -- Entregas
  ('deliveries', 'view', 'Visualizar entregas'),
  ('deliveries', 'edit', 'Editar entregas'),
  ('deliveries', 'export', 'Exportar entregas'),
  ('deliveries', 'print', 'Imprimir entregas'),
  -- Dashboard
  ('dashboard', 'view', 'Visualizar dashboard'),
  -- Configurações
  ('settings', 'view', 'Visualizar configurações'),
  ('settings', 'edit', 'Editar configurações'),
  ('settings', 'manage_credentials', 'Gerenciar credenciais de integração'),
  -- Usuários & Permissões
  ('users', 'view', 'Visualizar usuários'),
  ('users', 'create', 'Criar usuários'),
  ('users', 'edit', 'Editar usuários'),
  ('users', 'suspend', 'Suspender/reativar usuários'),
  ('users', 'reset_password', 'Resetar senha de usuários'),
  ('roles', 'view', 'Visualizar perfis'),
  ('roles', 'create', 'Criar perfis'),
  ('roles', 'edit', 'Editar perfis'),
  ('tokens', 'view', 'Visualizar tokens'),
  ('tokens', 'create', 'Criar tokens'),
  ('tokens', 'revoke', 'Revogar tokens'),
  ('audit', 'view', 'Visualizar auditoria'),
  ('audit', 'export', 'Exportar auditoria'),
  ('audit', 'print', 'Imprimir auditoria'),
  -- Relatórios
  ('reports', 'view', 'Visualizar relatórios'),
  ('reports', 'export', 'Exportar relatórios');

-- 13. Seed: Dar todas as permissões ao role Administrador
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p WHERE r.name = 'Administrador';

-- 14. Seed: Permissões para Operador
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.name = 'Operador'
  AND (p.resource, p.action) IN (
    ('products','view'),('products','edit'),
    ('customers','view'),('customers','create'),('customers','edit'),
    ('orders','view'),('orders','create'),('orders','edit'),('orders','print'),
    ('subscriptions','view'),('subscriptions','create'),('subscriptions','edit'),('subscriptions','print'),
    ('deliveries','view'),('deliveries','edit'),
    ('dashboard','view')
  );

-- 15. Seed: Permissões para Entregador
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.name = 'Entregador'
  AND (p.resource, p.action) IN (
    ('deliveries','view'),('deliveries','edit'),
    ('orders','view'),
    ('customers','view')
  );

-- 16. Seed: Permissões para Financeiro
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.name = 'Financeiro'
  AND (p.resource, p.action) IN (
    ('orders','view'),('orders','export'),('orders','print'),
    ('subscriptions','view'),('subscriptions','export'),('subscriptions','print'),
    ('customers','view'),
    ('dashboard','view'),
    ('reports','view'),('reports','export'),
    ('settings','view')
  );

-- 17. Seed: Permissões para Suporte
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.name = 'Suporte'
  AND (p.resource, p.action) IN (
    ('products','view'),
    ('customers','view'),('customers','create'),('customers','edit'),
    ('orders','view'),('orders','create'),
    ('subscriptions','view'),('subscriptions','create'),
    ('deliveries','view'),
    ('dashboard','view')
  );

-- 18. Seed: Configurações de segurança padrão
INSERT INTO public.system_settings (key, value, description) VALUES
  ('security_max_login_attempts', '5', 'Máximo de tentativas de login antes de bloquear'),
  ('security_lockout_duration_minutes', '30', 'Tempo de bloqueio em minutos após tentativas excedidas'),
  ('security_session_timeout_minutes', '480', 'Tempo de expiração da sessão em minutos'),
  ('security_require_password_change_first_login', 'true', 'Exigir troca de senha no primeiro acesso')
ON CONFLICT (key) DO NOTHING;
