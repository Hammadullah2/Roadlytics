-- Drop GeoJSON-specific columns from segmentation_results
ALTER TABLE segmentation_results DROP COLUMN IF EXISTS geojson_data;
ALTER TABLE segmentation_results ADD COLUMN IF NOT EXISTS seg_mask_url TEXT;

-- Drop GeoJSON geometry from classification_results
ALTER TABLE classification_results DROP COLUMN IF EXISTS geometry;
ALTER TABLE classification_results ADD COLUMN IF NOT EXISTS condition_tif_urls JSONB;

-- Drop graph_data from connectivity_graphs
ALTER TABLE connectivity_graphs DROP COLUMN IF EXISTS graph_data;
ALTER TABLE connectivity_graphs ADD COLUMN IF NOT EXISTS component_map_url TEXT;
ALTER TABLE connectivity_graphs ADD COLUMN IF NOT EXISTS betweenness_url TEXT;

-- Rename geojson_uploads to satellite_uploads
ALTER TABLE geojson_uploads RENAME TO satellite_uploads;

-- Add CHECK constraints for job_type and status
-- Wait, jobs already has constraints, we need to alter or drop/recreate them
-- Better to drop if exists and recreate
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed'));

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_job_type_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_job_type_check CHECK (job_type IN ('segmentation', 'classification', 'connectivity', 'full'));
