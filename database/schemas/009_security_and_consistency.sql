-- 009_security_and_consistency.sql
-- Run in Supabase SQL Editor after 008_raster_migration.sql.
-- Idempotent: all statements use IF EXISTS / IF NOT EXISTS / OR REPLACE.
-- ============================================================

-- ── P0: Restrict profiles self-update to safe display columns only ────────────
--
-- The previous profiles_update_own policy allowed any authenticated user to
-- update any mutable column on their own profile row, including `role` and
-- `approval_status`. An attacker with the anon key could self-promote to admin
-- or bypass the pending-approval gate.
--
-- Fix: replace the broad UPDATE policy with a SECURITY DEFINER RPC that only
-- touches the allowed display columns (full_name, email). All role/approval
-- changes must go through the backend (service_role key) or the admin RPC below.

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

-- Revoke direct UPDATE on the sensitive columns for the authenticated role.
-- PostgREST (Supabase REST) enforces column privileges even when the row-level
-- policy passes.
REVOKE UPDATE (role, approval_status, approved_by, approved_at)
    ON public.profiles
    FROM authenticated;

-- Safe RPC — updates only display fields, identity-checked server-side.
CREATE OR REPLACE FUNCTION public.update_own_profile(
    p_full_name text DEFAULT NULL,
    p_email     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.profiles
    SET
        full_name = COALESCE(p_full_name, full_name),
        email     = COALESCE(p_email,     email)
    WHERE id = auth.uid();
END;
$$;

-- ── P1: Make migration 008 table rename idempotent ────────────────────────────
--
-- 008_raster_migration.sql did ALTER TABLE geojson_uploads RENAME TO satellite_uploads
-- without checking if geojson_uploads still exists. Re-running 008 fails. This
-- block is safe to run multiple times.

DO $$
BEGIN
    -- Only rename if the old table still exists AND the new one does not.
    IF to_regclass('public.geojson_uploads') IS NOT NULL
       AND to_regclass('public.satellite_uploads') IS NULL
    THEN
        ALTER TABLE public.geojson_uploads RENAME TO satellite_uploads;
    END IF;

    -- Rename the index to match the new table name.
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname   = 'idx_geojson_uploads_region'
    ) THEN
        ALTER INDEX public.idx_geojson_uploads_region
            RENAME TO idx_satellite_uploads_region;
    END IF;
END;
$$;

-- ── P1: Enforce that jobs.result_refs is always a JSONB object (never a string) ─
--
-- The Python bridge previously used json.dumps(), which stores a JSONB *string*
-- (e.g. "{\"key\":1}") instead of a JSONB *object* ({key:1}). The Go backend
-- then failed to unmarshal result_refs. The bridge is now fixed to pass dicts
-- directly, but the constraint also catches any future regressions.

ALTER TABLE public.jobs
    DROP CONSTRAINT IF EXISTS jobs_result_refs_is_object;

ALTER TABLE public.jobs
    ADD CONSTRAINT jobs_result_refs_is_object
    CHECK (result_refs IS NULL OR jsonb_typeof(result_refs) = 'object');

-- Backfill any existing string-encoded rows (converts stored JSON strings back
-- to proper JSONB objects so the new constraint does not block startup).
UPDATE public.jobs
SET result_refs = result_refs::text::jsonb
WHERE result_refs IS NOT NULL
  AND jsonb_typeof(result_refs) = 'string';

-- ── P2: Add name column alias for profiles (backend uses 'name', schema has 'full_name') ─
--
-- The Go backend and frontend Profile type use field "name", but 001_initial_schema.sql
-- created the column as "full_name". Migration 005 added an email column.
-- 002_supabase_setup.sql re-creates the table with "name" instead of "full_name".
-- Add "name" as a generated column if it does not already exist, so both spellings work.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'profiles'
          AND column_name  = 'name'
    ) THEN
        ALTER TABLE public.profiles
            ADD COLUMN name text GENERATED ALWAYS AS (full_name) STORED;
    END IF;
END;
$$;
