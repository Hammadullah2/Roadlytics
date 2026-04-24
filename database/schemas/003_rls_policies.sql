-- Road Quality Assessment - Row Level Security policies
-- Run this in Supabase SQL Editor after 002_supabase_setup.sql.
-- Backend services use the service_role key and bypass RLS.
-- These policies apply to frontend/direct Supabase access only.

-- === Helper Functions ===

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_approved()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND approval_status = 'approved'
    );
$$;

-- === Enable Row Level Security ===

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segmentation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classification_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connectivity_graphs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

-- === Profiles Policies ===

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update approval status" ON public.profiles;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;
CREATE POLICY profiles_select_admin
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_admin
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- === Projects Policies ===

DROP POLICY IF EXISTS "Users can CRUD own projects" ON public.projects;
DROP POLICY IF EXISTS "Admins can view all projects" ON public.projects;

DROP POLICY IF EXISTS projects_insert_approved_owner ON public.projects;
CREATE POLICY projects_insert_approved_owner
    ON public.projects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_approved()
        AND owner_id = auth.uid()
    );

DROP POLICY IF EXISTS projects_select_own ON public.projects;
CREATE POLICY projects_select_own
    ON public.projects
    FOR SELECT
    TO authenticated
    USING (
        public.is_approved()
        AND owner_id = auth.uid()
    );

DROP POLICY IF EXISTS projects_update_own ON public.projects;
CREATE POLICY projects_update_own
    ON public.projects
    FOR UPDATE
    TO authenticated
    USING (
        public.is_approved()
        AND owner_id = auth.uid()
    )
    WITH CHECK (
        public.is_approved()
        AND owner_id = auth.uid()
    );

DROP POLICY IF EXISTS projects_delete_own ON public.projects;
CREATE POLICY projects_delete_own
    ON public.projects
    FOR DELETE
    TO authenticated
    USING (
        public.is_approved()
        AND owner_id = auth.uid()
    );

DROP POLICY IF EXISTS projects_select_admin ON public.projects;
CREATE POLICY projects_select_admin
    ON public.projects
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- === Regions Policies ===

DROP POLICY IF EXISTS regions_select_own_project ON public.regions;
CREATE POLICY regions_select_own_project
    ON public.regions
    FOR SELECT
    TO authenticated
    USING (
        public.is_approved()
        AND
        EXISTS (
            SELECT 1
            FROM public.projects
            WHERE projects.id = regions.project_id
              AND projects.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS regions_insert_own_project ON public.regions;
CREATE POLICY regions_insert_own_project
    ON public.regions
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_approved()
        AND
        EXISTS (
            SELECT 1
            FROM public.projects
            WHERE projects.id = regions.project_id
              AND projects.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS regions_update_own_project ON public.regions;
CREATE POLICY regions_update_own_project
    ON public.regions
    FOR UPDATE
    TO authenticated
    USING (
        public.is_approved()
        AND
        EXISTS (
            SELECT 1
            FROM public.projects
            WHERE projects.id = regions.project_id
              AND projects.owner_id = auth.uid()
        )
    )
    WITH CHECK (
        public.is_approved()
        AND
        EXISTS (
            SELECT 1
            FROM public.projects
            WHERE projects.id = regions.project_id
              AND projects.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS regions_delete_own_project ON public.regions;
CREATE POLICY regions_delete_own_project
    ON public.regions
    FOR DELETE
    TO authenticated
    USING (
        public.is_approved()
        AND
        EXISTS (
            SELECT 1
            FROM public.projects
            WHERE projects.id = regions.project_id
              AND projects.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS regions_select_admin ON public.regions;
CREATE POLICY regions_select_admin
    ON public.regions
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- === Images Policies ===

DROP POLICY IF EXISTS images_select_own_region ON public.images;
CREATE POLICY images_select_own_region
    ON public.images
    FOR SELECT
    TO authenticated
    USING (
        public.is_approved()
        AND
        EXISTS (
            SELECT 1
            FROM public.regions
            JOIN public.projects ON projects.id = regions.project_id
            WHERE regions.id = images.region_id
              AND projects.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS images_insert_own_region ON public.images;
CREATE POLICY images_insert_own_region
    ON public.images
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_approved()
        AND
        EXISTS (
            SELECT 1
            FROM public.regions
            JOIN public.projects ON projects.id = regions.project_id
            WHERE regions.id = images.region_id
              AND projects.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS images_update_own_region ON public.images;
CREATE POLICY images_update_own_region
    ON public.images
    FOR UPDATE
    TO authenticated
    USING (
        public.is_approved()
        AND
        EXISTS (
            SELECT 1
            FROM public.regions
            JOIN public.projects ON projects.id = regions.project_id
            WHERE regions.id = images.region_id
              AND projects.owner_id = auth.uid()
        )
    )
    WITH CHECK (
        public.is_approved()
        AND
        EXISTS (
            SELECT 1
            FROM public.regions
            JOIN public.projects ON projects.id = regions.project_id
            WHERE regions.id = images.region_id
              AND projects.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS images_delete_own_region ON public.images;
CREATE POLICY images_delete_own_region
    ON public.images
    FOR DELETE
    TO authenticated
    USING (
        public.is_approved()
        AND
        EXISTS (
            SELECT 1
            FROM public.regions
            JOIN public.projects ON projects.id = regions.project_id
            WHERE regions.id = images.region_id
              AND projects.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS images_select_admin ON public.images;
CREATE POLICY images_select_admin
    ON public.images
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- === Jobs Policies ===

DROP POLICY IF EXISTS "Users can view own jobs" ON public.jobs;
DROP POLICY IF EXISTS "Users can create jobs" ON public.jobs;

DROP POLICY IF EXISTS jobs_select_own_region ON public.jobs;
CREATE POLICY jobs_select_own_region
    ON public.jobs
    FOR SELECT
    TO authenticated
    USING (
        public.is_approved()
        AND
        EXISTS (
            SELECT 1
            FROM public.regions
            JOIN public.projects ON projects.id = regions.project_id
            WHERE regions.id = jobs.region_id
              AND projects.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS jobs_insert_own_region ON public.jobs;
CREATE POLICY jobs_insert_own_region
    ON public.jobs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_approved()
        AND created_by = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.regions
            JOIN public.projects ON projects.id = regions.project_id
            WHERE regions.id = jobs.region_id
              AND projects.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS jobs_select_admin ON public.jobs;
CREATE POLICY jobs_select_admin
    ON public.jobs
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS jobs_update_admin ON public.jobs;
CREATE POLICY jobs_update_admin
    ON public.jobs
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- === Segmentation Results Policies ===

DROP POLICY IF EXISTS segmentation_results_select_own_jobs ON public.segmentation_results;
CREATE POLICY segmentation_results_select_own_jobs
    ON public.segmentation_results
    FOR SELECT
    TO authenticated
    USING (
        public.is_approved()
        AND
        EXISTS (
            SELECT 1
            FROM public.jobs
            JOIN public.regions ON regions.id = jobs.region_id
            JOIN public.projects ON projects.id = regions.project_id
            WHERE jobs.id = segmentation_results.job_id
              AND projects.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS segmentation_results_select_admin ON public.segmentation_results;
CREATE POLICY segmentation_results_select_admin
    ON public.segmentation_results
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- === Classification Results Policies ===

DROP POLICY IF EXISTS classification_results_select_own_jobs ON public.classification_results;
CREATE POLICY classification_results_select_own_jobs
    ON public.classification_results
    FOR SELECT
    TO authenticated
    USING (
        public.is_approved()
        AND
        EXISTS (
            SELECT 1
            FROM public.segmentation_results
            JOIN public.jobs ON jobs.id = segmentation_results.job_id
            JOIN public.regions ON regions.id = jobs.region_id
            JOIN public.projects ON projects.id = regions.project_id
            WHERE segmentation_results.id = classification_results.segmentation_id
              AND projects.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS classification_results_select_admin ON public.classification_results;
CREATE POLICY classification_results_select_admin
    ON public.classification_results
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- === Connectivity Graphs Policies ===

DROP POLICY IF EXISTS connectivity_graphs_select_own_jobs ON public.connectivity_graphs;
CREATE POLICY connectivity_graphs_select_own_jobs
    ON public.connectivity_graphs
    FOR SELECT
    TO authenticated
    USING (
        public.is_approved()
        AND
        EXISTS (
            SELECT 1
            FROM public.jobs
            JOIN public.regions ON regions.id = jobs.region_id
            JOIN public.projects ON projects.id = regions.project_id
            WHERE jobs.id = connectivity_graphs.job_id
              AND projects.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS connectivity_graphs_select_admin ON public.connectivity_graphs;
CREATE POLICY connectivity_graphs_select_admin
    ON public.connectivity_graphs
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- === Reports Policies ===

DROP POLICY IF EXISTS reports_select_own_jobs ON public.reports;
CREATE POLICY reports_select_own_jobs
    ON public.reports
    FOR SELECT
    TO authenticated
    USING (
        public.is_approved()
        AND
        EXISTS (
            SELECT 1
            FROM public.jobs
            JOIN public.regions ON regions.id = jobs.region_id
            JOIN public.projects ON projects.id = regions.project_id
            WHERE jobs.id = reports.job_id
              AND projects.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS reports_select_admin ON public.reports;
CREATE POLICY reports_select_admin
    ON public.reports
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- === Logs Policies ===

DROP POLICY IF EXISTS logs_select_own ON public.logs;
CREATE POLICY logs_select_own
    ON public.logs
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS logs_select_admin ON public.logs;
CREATE POLICY logs_select_admin
    ON public.logs
    FOR SELECT
    TO authenticated
    USING (public.is_admin());
