-- Add username and auth fields to app_users
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE,
  ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS tentativas_login INTEGER DEFAULT 0;

-- Create index for fast username lookups
CREATE UNIQUE INDEX IF NOT EXISTS app_users_username_idx ON public.app_users (username) WHERE username IS NOT NULL;

-- Add constraint via trigger instead of check constraint (more compatible)
CREATE OR REPLACE FUNCTION public.validate_username_format()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.username IS NOT NULL THEN
    IF length(NEW.username) < 4 THEN
      RAISE EXCEPTION 'Username deve ter no mínimo 4 caracteres';
    END IF;
    IF NEW.username !~ '^[a-zA-Z0-9_]+$' THEN
      RAISE EXCEPTION 'Username pode conter apenas letras, números e underscore';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_username_trigger ON public.app_users;
CREATE TRIGGER validate_username_trigger
  BEFORE INSERT OR UPDATE OF username ON public.app_users
  FOR EACH ROW EXECUTE FUNCTION public.validate_username_format();