-- ============================================================
-- 001_test_schema.sql
-- Purpose:
-- Manual verification queries for the Road Quality Assessment schema.
-- Run these in the Supabase SQL Editor after migrations 001-006.
-- ============================================================

-- === Table existence checks ===
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') AS profiles_exists;
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') AS projects_exists;
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'regions') AS regions_exists;
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'geojson_uploads') AS geojson_uploads_exists;
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'images') AS images_exists;
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') AS jobs_exists;
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'segmentation_results') AS segmentation_results_exists;
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'classification_results') AS classification_results_exists;
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'connectivity_graphs') AS connectivity_graphs_exists;
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reports') AS reports_exists;
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'logs') AS logs_exists;

-- === Index existence checks ===
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_profiles_role') AS idx_profiles_role_exists;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_profiles_approval') AS idx_profiles_approval_exists;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_projects_owner') AS idx_projects_owner_exists;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_regions_project') AS idx_regions_project_exists;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_geojson_uploads_region') AS idx_geojson_uploads_region_exists;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_images_region') AS idx_images_region_exists;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_jobs_region') AS idx_jobs_region_exists;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_jobs_status') AS idx_jobs_status_exists;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_jobs_created_by') AS idx_jobs_created_by_exists;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_class_results_seg') AS idx_class_results_seg_exists;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_class_results_label') AS idx_class_results_label_exists;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_reports_job') AS idx_reports_job_exists;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_logs_event_type') AS idx_logs_event_type_exists;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_logs_created_at') AS idx_logs_created_at_exists;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_logs_user_id') AS idx_logs_user_id_exists;

-- === RLS checks ===
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN (
      'profiles',
      'projects',
      'regions',
      'geojson_uploads',
      'images',
      'jobs',
      'segmentation_results',
      'classification_results',
      'connectivity_graphs',
      'reports',
      'logs'
  )
ORDER BY relname;

-- === Extension checks ===
SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS postgis_installed;
SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') AS uuid_ossp_installed;
