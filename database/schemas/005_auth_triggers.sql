-- ============================================================
-- 005_auth_triggers.sql
-- Purpose:
-- Keep public.profiles in sync with Supabase Auth sign-ups.
-- This is a fallback safety net in case the frontend POST /auth/register
-- call does not complete after a successful Supabase Auth signup.
-- ============================================================

-- Ensure the fallback profile table can store email alongside the auth join.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Backfill any missing profile emails from auth.users when available.
UPDATE public.profiles AS p
SET email = u.email
FROM auth.users AS u
WHERE p.id = u.id
  AND (p.email IS NULL OR p.email = '');

-- Recreate the auth signup trigger function so every new auth.users row
-- has a matching profile record with pending approval by default.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email, role, approval_status)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.email,
        'user',
        'pending'
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;

    RETURN NEW;
END;
$$;

-- Attach the fallback trigger only if it is missing.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'on_auth_user_created'
    ) THEN
        CREATE TRIGGER on_auth_user_created
            AFTER INSERT ON auth.users
            FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    END IF;
END;
$$;
