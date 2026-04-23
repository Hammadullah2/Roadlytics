-- Road Quality Assessment - Supabase Storage policies
-- The following 5 buckets must be manually created in
-- Supabase Dashboard -> Storage -> New Bucket BEFORE running this file:
--   satellite-images    (private, no public access)
--   segmentation-masks  (private, no public access)
--   reports             (private, no public access)
--   connectivity-graphs (private, no public access)
--   geojson-uploads     (private, no public access)
--
-- Run this in Supabase SQL Editor after 003_rls_policies.sql.
-- Backend services use the service_role key and bypass RLS.
-- These policies apply to frontend/direct Supabase access only.

-- Supabase manages RLS on storage.objects already.
-- Attempting to ALTER TABLE here can fail in SQL Editor with:
-- "must be owner of table objects".

-- === Satellite Images Bucket Policies ===

DROP POLICY IF EXISTS satellite_images_upload_own ON storage.objects;
CREATE POLICY satellite_images_upload_own
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'satellite-images'
        AND public.is_approved()
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS satellite_images_read_own ON storage.objects;
CREATE POLICY satellite_images_read_own
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'satellite-images'
        AND public.is_approved()
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS satellite_images_read_admin ON storage.objects;
CREATE POLICY satellite_images_read_admin
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'satellite-images'
        AND public.is_admin()
    );

-- === GeoJSON Uploads Bucket Policies ===

DROP POLICY IF EXISTS geojson_uploads_upload_own ON storage.objects;
CREATE POLICY geojson_uploads_upload_own
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'geojson-uploads'
        AND public.is_approved()
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS geojson_uploads_read_own ON storage.objects;
CREATE POLICY geojson_uploads_read_own
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'geojson-uploads'
        AND public.is_approved()
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS geojson_uploads_read_admin ON storage.objects;
CREATE POLICY geojson_uploads_read_admin
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'geojson-uploads'
        AND public.is_admin()
    );

-- === Segmentation Masks Bucket Policies ===

DROP POLICY IF EXISTS segmentation_masks_read_own_jobs ON storage.objects;
CREATE POLICY segmentation_masks_read_own_jobs
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'segmentation-masks'
        AND public.is_approved()
        AND EXISTS (
            SELECT 1
            FROM public.segmentation_results sr
            JOIN public.jobs j ON j.id = sr.job_id
            JOIN public.regions r ON r.id = j.region_id
            JOIN public.projects p ON p.id = r.project_id
            WHERE p.owner_id = auth.uid()
              AND (
                  sr.mask_path = storage.objects.name
                  OR sr.mask_path = storage.objects.bucket_id || '/' || storage.objects.name
              )
        )
    );

DROP POLICY IF EXISTS segmentation_masks_read_admin ON storage.objects;
CREATE POLICY segmentation_masks_read_admin
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'segmentation-masks'
        AND public.is_admin()
    );

-- === Connectivity Graphs Bucket Policies ===

DROP POLICY IF EXISTS connectivity_graphs_read_own_jobs ON storage.objects;
-- The base schema currently stores connectivity output in public.connectivity_graphs.graph_data
-- and does not persist a storage object path for this bucket.
-- Because there is no reliable object-to-row mapping in SQL, we intentionally do not create
-- a per-user SELECT policy here; otherwise it would risk granting access to unrelated files.
-- Keep this bucket backend-only until a storage path column is added and populated.

DROP POLICY IF EXISTS connectivity_graphs_read_admin ON storage.objects;
CREATE POLICY connectivity_graphs_read_admin
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'connectivity-graphs'
        AND public.is_admin()
    );

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
