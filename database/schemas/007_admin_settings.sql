-- ============================================================
-- 007_admin_settings.sql
-- Purpose:
-- Persist admin panel system settings in PostgreSQL so the restored
-- legacy admin UI can load and save configuration through the backend.
--
-- This migration is additive and safe to run after 001-006.
-- The backend also has a defensive CREATE TABLE IF NOT EXISTS path,
-- but keeping the table in schema history avoids drift.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.system_settings (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.system_settings (id, settings)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
