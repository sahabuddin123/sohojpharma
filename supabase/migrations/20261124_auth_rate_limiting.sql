-- Auth Rate Limiting and Brute Force Protection Schema

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamp with time zone,
  last_attempt_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service_role can directly read/write table
DROP POLICY IF EXISTS "auth_rate_limits_service_role" ON public.auth_rate_limits;
CREATE POLICY "auth_rate_limits_service_role" ON public.auth_rate_limits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Index on key and locked_until
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_key ON public.auth_rate_limits (key);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_locked ON public.auth_rate_limits (locked_until) WHERE locked_until IS NOT NULL;

-- Function to check rate limit for a given key (IP or email)
CREATE OR REPLACE FUNCTION public.check_auth_rate_limit(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_retry_after integer := 0;
  v_remaining integer := 5;
BEGIN
  IF p_key IS NULL OR length(btrim(p_key)) = 0 THEN
    RETURN jsonb_build_object('allowed', true, 'remaining_attempts', 5, 'retry_after_seconds', 0);
  END IF;

  SELECT failed_attempts, locked_until INTO v_rec
  FROM public.auth_rate_limits
  WHERE key = p_key;

  IF FOUND THEN
    IF v_rec.locked_until IS NOT NULL AND v_rec.locked_until > now() THEN
      v_retry_after := CEIL(EXTRACT(epoch FROM (v_rec.locked_until - now())))::integer;
      RETURN jsonb_build_object(
        'allowed', false,
        'remaining_attempts', 0,
        'retry_after_seconds', v_retry_after,
        'failed_attempts', v_rec.failed_attempts
      );
    END IF;

    -- If cooldown expired, decay or reset
    IF v_rec.locked_until IS NOT NULL AND v_rec.locked_until <= now() THEN
      v_remaining := 3;
    ELSE
      v_remaining := GREATEST(0, 5 - v_rec.failed_attempts);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining_attempts', v_remaining,
    'retry_after_seconds', 0,
    'failed_attempts', COALESCE(v_rec.failed_attempts, 0)
  );
END;
$$;

-- Function to record attempt
CREATE OR REPLACE FUNCTION public.record_auth_attempt(p_key text, p_success boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts integer := 0;
  v_lock_interval interval := NULL;
  v_locked_until timestamp with time zone := NULL;
  v_retry_after integer := 0;
  v_remaining integer := 5;
BEGIN
  IF p_key IS NULL OR length(btrim(p_key)) = 0 THEN
    RETURN jsonb_build_object('allowed', true, 'remaining_attempts', 5, 'retry_after_seconds', 0);
  END IF;

  IF p_success THEN
    DELETE FROM public.auth_rate_limits WHERE key = p_key;
    RETURN jsonb_build_object('allowed', true, 'remaining_attempts', 5, 'retry_after_seconds', 0, 'failed_attempts', 0);
  END IF;

  -- Upsert failure
  INSERT INTO public.auth_rate_limits (key, failed_attempts, last_attempt_at, updated_at)
  VALUES (p_key, 1, now(), now())
  ON CONFLICT (key) DO UPDATE
  SET 
    failed_attempts = CASE 
      -- If previous lock expired more than 1 hour ago, reset to 1
      WHEN public.auth_rate_limits.locked_until IS NOT NULL AND public.auth_rate_limits.locked_until < now() - interval '1 hour' THEN 1
      ELSE public.auth_rate_limits.failed_attempts + 1
    END,
    last_attempt_at = now(),
    updated_at = now()
  RETURNING failed_attempts INTO v_attempts;

  -- Progressive lockout thresholds
  IF v_attempts >= 20 THEN
    v_lock_interval := interval '1 hour';
  ELSIF v_attempts >= 10 THEN
    v_lock_interval := interval '15 minutes';
  ELSIF v_attempts >= 5 THEN
    v_lock_interval := interval '1 minute';
  END IF;

  IF v_lock_interval IS NOT NULL THEN
    v_locked_until := now() + v_lock_interval;
    UPDATE public.auth_rate_limits SET locked_until = v_locked_until WHERE key = p_key;
    v_retry_after := CEIL(EXTRACT(epoch FROM (v_locked_until - now())))::integer;
    RETURN jsonb_build_object(
      'allowed', false,
      'remaining_attempts', 0,
      'retry_after_seconds', v_retry_after,
      'failed_attempts', v_attempts
    );
  END IF;

  v_remaining := GREATEST(0, 5 - v_attempts);
  RETURN jsonb_build_object(
    'allowed', true,
    'remaining_attempts', v_remaining,
    'retry_after_seconds', 0,
    'failed_attempts', v_attempts
  );
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.check_auth_rate_limit(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_auth_attempt(text, boolean) TO anon, authenticated, service_role;
