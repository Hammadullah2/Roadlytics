-- Road Quality Assessment - Supabase Storage policies
-- The following 5 buckets must be manually created in
-- Supabase Dashboard -> Storage -> New Bucket BEFORE running this file:
--   reports             (private, no public access)
--
-- Run this in Supabase SQL Editor after 003_rls_policies.sql.
-- Backend services use the service_role key and bypass RLS.
-- These policies apply to frontend/direct Supabase access only.

-- Supabase manages RLS on storage.objects already.
-- Attempting to ALTER TABLE here can fail in SQL Editor with:
-- "must be owner of table objects".







-- === Reports Bucket Policies ===

DROP POLICY IF EXISTS reports_read_own ON storage.objects;
CREATE POLICY reports_read_own
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'reports'
        AND public.is_approved()
        AND EXISTS (
            SELECT 1
            FROM public.reports rep
            JOIN public.jobs j ON j.id = rep.job_id
            JOIN public.regions r ON r.id = j.region_id
            JOIN public.projects p ON p.id = r.project_id
            WHERE p.owner_id = auth.uid()
              AND (
                  rep.file_path = storage.objects.name
                  OR rep.file_path = storage.objects.bucket_id || '/' || storage.objects.name
              )
        )
    );

DROP POLICY IF EXISTS reports_read_admin ON storage.objects;
CREATE POLICY reports_read_admin
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'reports'
        AND public.is_admin()
    );
