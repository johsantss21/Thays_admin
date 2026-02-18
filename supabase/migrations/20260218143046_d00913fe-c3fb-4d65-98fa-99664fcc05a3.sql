
-- =============================================
-- 1. SYSTEM AUDIT LOGS (auditoria estruturada)
-- =============================================
CREATE TABLE IF NOT EXISTS public.system_audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('order', 'subscription', 'webhook', 'payment', 'stock', 'settings')),
  entity_id text,
  payload_json jsonb,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'warning', 'error')),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.system_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage system_audit_logs"
  ON public.system_audit_logs FOR ALL
  USING (is_admin());

CREATE INDEX idx_system_audit_logs_entity ON public.system_audit_logs(entity_type, entity_id);
CREATE INDEX idx_system_audit_logs_created_at ON public.system_audit_logs(created_at DESC);
CREATE INDEX idx_system_audit_logs_status ON public.system_audit_logs(status);

-- =============================================
-- 2. WEBHOOK EVENTS (idempotência)
-- =============================================
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('efi', 'stripe')),
  processed_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(event_id, provider)
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage webhook_events"
  ON public.webhook_events FOR ALL
  USING (is_admin());

CREATE INDEX idx_webhook_events_event_id ON public.webhook_events(event_id, provider);

-- =============================================
-- 3. CONVERSATION CONTEXT (memória n8n)
-- =============================================
CREATE TABLE IF NOT EXISTS public.conversation_context (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone text NOT NULL UNIQUE,
  last_intent text,
  open_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  open_subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  abandoned_cart jsonb,
  last_interaction_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.conversation_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage conversation_context"
  ON public.conversation_context FOR ALL
  USING (is_admin());

CREATE INDEX idx_conversation_context_phone ON public.conversation_context(phone);

CREATE TRIGGER update_conversation_context_updated_at
  BEFORE UPDATE ON public.conversation_context
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
