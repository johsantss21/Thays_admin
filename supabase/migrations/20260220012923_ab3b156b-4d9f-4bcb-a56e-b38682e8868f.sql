
-- Update the onboarding trigger to ALSO create app_users for every new auth user
CREATE OR REPLACE FUNCTION public.handle_new_user_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_profile_type text;
  v_full_name text;
  v_cpf text;
  v_phone text;
  v_company_name text;
  v_cnpj text;
BEGIN
  v_profile_type := coalesce(NEW.raw_user_meta_data->>'profile_type', '');

  -- ALWAYS create app_users record for every new auth user
  INSERT INTO public.app_users (
    user_id,
    email,
    name,
    username,
    status,
    auth_provider,
    tentativas_login,
    must_change_password
  ) VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email, ''),
    NULL,
    'ativo',
    'email',
    0,
    true
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Handle operator profile if applicable
  IF v_profile_type = 'operator' THEN
    v_full_name := coalesce(NEW.raw_user_meta_data->>'full_name', '');
    v_cpf := coalesce(NEW.raw_user_meta_data->>'cpf', '');
    v_phone := coalesce(NEW.raw_user_meta_data->>'phone', '');
    v_company_name := coalesce(NEW.raw_user_meta_data->>'company_name', '');
    v_cnpj := coalesce(NEW.raw_user_meta_data->>'cnpj', '');

    IF v_full_name = '' OR v_cpf = '' OR v_phone = '' OR v_company_name = '' OR v_cnpj = '' THEN
      RAISE EXCEPTION 'Missing required onboarding fields';
    END IF;

    INSERT INTO public.operator_profiles (
      user_id, full_name, cpf, phone, company_name, trading_name, cnpj,
      company_email, company_phone, street, number, complement, neighborhood,
      city, state, zip_code, cpf_validated, cnpj_validated
    ) VALUES (
      NEW.id, v_full_name, v_cpf, v_phone, v_company_name,
      NULLIF(NEW.raw_user_meta_data->>'trading_name', ''), v_cnpj,
      NULLIF(NEW.raw_user_meta_data->>'company_email', ''),
      NULLIF(NEW.raw_user_meta_data->>'company_phone', ''),
      NULLIF(NEW.raw_user_meta_data->>'street', ''),
      NULLIF(NEW.raw_user_meta_data->>'number', ''),
      NULLIF(NEW.raw_user_meta_data->>'complement', ''),
      NULLIF(NEW.raw_user_meta_data->>'neighborhood', ''),
      NULLIF(NEW.raw_user_meta_data->>'city', ''),
      NULLIF(NEW.raw_user_meta_data->>'state', ''),
      NULLIF(NEW.raw_user_meta_data->>'zip_code', ''),
      true,
      CASE WHEN NEW.raw_user_meta_data ? 'cnpj_validated' THEN (NEW.raw_user_meta_data->>'cnpj_validated')::boolean ELSE false END
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- Bootstrap: first user gets admin role
  IF NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Add unique constraint on app_users.user_id if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_users_user_id_key'
  ) THEN
    ALTER TABLE public.app_users ADD CONSTRAINT app_users_user_id_key UNIQUE (user_id);
  END IF;
END $$;
