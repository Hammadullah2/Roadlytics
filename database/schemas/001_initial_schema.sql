-- Road Quality Assessment - Initial Database Schema
-- PostgreSQL on Supabase Cloud
-- Auth is handled by Supabase Auth (auth.users) — we extend with a profiles table.

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
-- Supabase Auth handles email/password + Google OAuth.
-- This table stores app-specific user data and admin approval state.
CREATE TABLE profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name       VARCHAR(255) NOT NULL,
    role            VARCHAR(50)  NOT NULL DEFAULT 'user',   -- 'admin', 'user'
    approval_status VARCHAR(50)  NOT NULL DEFAULT 'approved', -- 'pending', 'approved', 'rejected'
    approved_by     UUID REFERENCES auth.users(id),
    approved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_approval ON profiles(approval_status);

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    status          VARCHAR(50)  NOT NULL DEFAULT 'active', -- 'active', 'archived'
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_owner ON projects(owner_id);

-- ============================================================
-- REGIONS (Area of Interest)
-- ============================================================
CREATE TABLE regions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    polygon         JSONB NOT NULL,  -- GeoJSON polygon boundary
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_regions_project ON regions(project_id);

-- ============================================================
-- GEOJSON_UPLOADS (user-submitted GeoJSON files)
-- ============================================================
-- The user uploads a GeoJSON file. It is stored in Supabase Storage,
-- and this table tracks the metadata. The file path points to the
-- Supabase Storage bucket location.
CREATE TABLE geojson_uploads (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    region_id       UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    uploaded_by     UUID NOT NULL REFERENCES profiles(id),
    file_path       VARCHAR(512) NOT NULL,  -- Supabase Storage path
    file_size_bytes BIGINT,
    original_name   VARCHAR(255),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_geojson_uploads_region ON geojson_uploads(region_id);

-- ============================================================
-- IMAGES (Satellite Imagery in Supabase Storage)
-- ============================================================
CREATE TABLE images (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    region_id       UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    source          VARCHAR(100) NOT NULL,  -- 'upload', 'sentinel', 'landsat'
    file_path       VARCHAR(512) NOT NULL,  -- Supabase Storage path
    captured_at     TIMESTAMPTZ,
    cloud_coverage  REAL DEFAULT 0.0,
    uploaded_by     UUID REFERENCES profiles(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_images_region ON images(region_id);

-- ============================================================
-- JOBS (Processing Pipeline)
-- ============================================================
CREATE TABLE jobs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    region_id       UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    created_by      UUID NOT NULL REFERENCES profiles(id),
    job_type        VARCHAR(50)  NOT NULL,  -- 'segmentation', 'classification', 'connectivity'
    status          VARCHAR(50)  NOT NULL DEFAULT 'pending',
    progress        INTEGER      NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    error_message   TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    result_refs     JSONB
);

CREATE INDEX idx_jobs_region ON jobs(region_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created_by ON jobs(created_by);

-- ============================================================
-- SEGMENTATION_RESULTS
-- ============================================================
CREATE TABLE segmentation_results (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id          UUID NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    geojson_data    JSONB NOT NULL,  -- Full GeoJSON FeatureCollection from model
    mask_path       VARCHAR(512),    -- Supabase Storage path (optional raster)
    pixel_count     INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CLASSIFICATION_RESULTS
-- ============================================================
CREATE TABLE classification_results (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    segmentation_id UUID NOT NULL REFERENCES segmentation_results(id) ON DELETE CASCADE,
    patch_id        VARCHAR(100) NOT NULL,
    road_label      VARCHAR(50)  NOT NULL CHECK (road_label IN ('Good', 'Damaged', 'Unpaved')),
    confidence      REAL         NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
    geometry        JSONB NOT NULL,  -- GeoJSON geometry for this segment
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_class_results_seg ON classification_results(segmentation_id);
CREATE INDEX idx_class_results_label ON classification_results(road_label);

-- ============================================================
-- CONNECTIVITY_GRAPHS
-- ============================================================
CREATE TABLE connectivity_graphs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id          UUID NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    graph_data      JSONB NOT NULL,  -- Adjacency list / graph structure as JSON
    metrics         JSONB,           -- { total_components, isolated_count, avg_degree, etc. }
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- REPORTS
-- ============================================================
CREATE TABLE reports (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    report_type     VARCHAR(50)  NOT NULL CHECK (report_type IN ('pdf', 'csv', 'shapefile')),
    file_path       VARCHAR(512) NOT NULL,  -- Supabase Storage path
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_job ON reports(job_id);

-- ============================================================
-- LOGS (System Events / Audit Trail)
-- ============================================================
CREATE TABLE logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES profiles(id),
    event_type      VARCHAR(100) NOT NULL,
    message         TEXT,
    metadata        JSONB,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_logs_event_type ON logs(event_type);
CREATE INDEX idx_logs_created_at ON logs(created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY (Supabase RLS)
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE geojson_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE segmentation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE classification_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE connectivity_graphs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- Profiles: users can read their own, admins can read all
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
    ON profiles FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can update approval status"
    ON profiles FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Projects: users see only their own
CREATE POLICY "Users can CRUD own projects"
    ON projects FOR ALL
    USING (owner_id = auth.uid());

CREATE POLICY "Admins can view all projects"
    ON projects FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Jobs: users see jobs for their own projects
CREATE POLICY "Users can view own jobs"
    ON jobs FOR SELECT
    USING (
        created_by = auth.uid()
    );

CREATE POLICY "Users can create jobs"
    ON jobs FOR INSERT
    WITH CHECK (
        created_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND approval_status = 'approved'
        )
    );

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Auto-create profile on Supabase Auth sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role, approval_status)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        'user',
        'approved'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at on projects
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
