-- ============================================================
-- 006_realtime.sql
-- Purpose:
-- Enable Supabase Realtime postgres_changes subscriptions for the jobs table.
-- Run this in the Supabase SQL Editor after migrations 001-005.
--
-- Important:
-- 1. Realtime must also be enabled for public.jobs in:
--    Supabase Dashboard -> Database -> Replication
-- 2. This publication powers the frontend fallback subscription that listens
--    for DB-level job status and progress updates.
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'jobs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
    END IF;
END;
$$;
