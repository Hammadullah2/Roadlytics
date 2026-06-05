# Antigravity Testing Plan

This plan is for rigorous end-to-end testing with Antigravity browser control. It assumes the web app is running on the Azure VM and inference runs on Modal.

## Test Targets

- App URL: `http://52.139.179.111`
- Projects page: `http://52.139.179.111/projects`
- Test GeoTIFF: `C:\Users\hammad\Roadlytics\tmp_e2e\testing170.tif`
- Backend path on VM: `/opt/roadlytics`
- Modal app: `roadlytics-inference`
- Modal function: `run_pipeline`
- Expected backend processor: `modal`
- Expected upload transport: `backend_proxy`

Do not expose Azure connection strings, Modal tokens, Gemini keys, or SAS URLs in logs, screenshots, or docs.

## 1. Preflight Checks

Open:

```text
http://52.139.179.111/api/health
```

Expected:

```json
{"status":"ok","storage_mode":"azure","worker_concurrency":1}
```

Open:

```text
http://52.139.179.111/projects
```

Expected: Projects page loads and shows the New Assessment form.

On the VM:

```bash
cd /opt/roadlytics
docker compose --env-file deploy/azure/.env.vm -f docker-compose.yml -f deploy/azure/docker-compose.prod.yml ps
docker compose --env-file deploy/azure/.env.vm -f docker-compose.yml -f deploy/azure/docker-compose.prod.yml exec -T backend env | grep -E 'ROADLYTICS_PROCESSOR|ROADLYTICS_UPLOAD_TRANSPORT'
```

Expected environment:

```text
ROADLYTICS_PROCESSOR=modal
ROADLYTICS_UPLOAD_TRANSPORT=backend_proxy
```

## 2. Browser Upload Test

Use Antigravity/Chrome to perform the real user flow.

1. Go to `http://52.139.179.111/projects`.
2. Project name: `testing170 Antigravity E2E GPU`.
3. Description: `Full Antigravity browser test using testing170.tif, Azure VM, Azure Blob, Modal GPU, reports, map layers, analytics, and RAG.`
4. Segmentation model: `DeepLabV3`.
5. Condition model: `EfficientNet`.
6. Upload `C:\Users\hammad\Roadlytics\tmp_e2e\testing170.tif`.
7. Click `Create Assessment`.

Expected frontend status sequence:

```text
Preparing upload...
Uploading GeoTIFF...
Creating processing job...
```

After job creation, the new assessment should appear in Projects and be visible on the Processing page.

## 3. Backend Evidence During Upload

Watch backend logs:

```bash
cd /opt/roadlytics
docker compose --env-file deploy/azure/.env.vm -f docker-compose.yml -f deploy/azure/docker-compose.prod.yml logs backend --tail=200 -f
```

Expected request sequence:

```text
POST /api/uploads/init 200
POST /api/uploads/{upload_id}/file 200
POST /api/jobs 200
```

Failure classification:

- If `/api/uploads/init` appears but `/api/jobs` never appears, this is an upload-stage failure.
- If `/api/jobs` returns `400 Uploaded GeoTIFF was not found`, the upload did not complete.
- If `/api/jobs` returns `422`, inspect model names or request payload validation.
- If the browser remains on upload status for a long time, capture Chrome Network timing for the upload request.

Known prior observation:

```text
backend_proxy upload started correctly, but a local-to-VM upload attempt reset after about 15.6 MB of a 185 MB file.
```

## 4. Processing and Modal Validation

Open:

```text
http://52.139.179.111/processing?jobId=<new_job_id>
```

Expected stages:

```text
uploaded
validating
segmenting
classifying
connectivity
packaging
completed
```

Check Modal:

```bash
modal app logs roadlytics-inference
```

Expected Modal behavior:

- A `run_pipeline` function call starts.
- Modal uses A10 if available, otherwise T4.
- Progress JSON is written to Azure Blob at `jobs/{job_id}/modal/progress.json`.
- Backend mirrors Modal progress into SQLite events.

## 5. Output Verification

Fetch job details:

```bash
curl http://52.139.179.111/api/jobs/<new_job_id>
```

Expected:

- `status` is `completed`.
- `progress` is `100`.
- Raster metadata has `band_count=4`.
- CRS is present.
- Artifact count is around `13`.

Fetch artifacts:

```bash
curl http://52.139.179.111/api/jobs/<new_job_id>/artifacts
```

Expected artifact/layer coverage:

- Road segmentation TIFF.
- Good road mask TIFF.
- Unpaved road mask TIFF.
- Damaged road mask TIFF.
- Combined condition TIFF.
- Road-condition shapefile ZIP.
- Component map TIFF.
- Betweenness/criticality TIFF.
- Connected components CSV.
- Analytics JSON.
- Critical junctions GeoJSON.
- HTML report.

Fetch analytics and report:

```bash
curl http://52.139.179.111/api/jobs/<new_job_id>/analytics
curl -o /tmp/report.html -w "%{http_code}\n" http://52.139.179.111/api/jobs/<new_job_id>/report
```

Expected:

- Analytics returns summary metrics.
- Report returns HTML with HTTP `200`.

Tile checks:

```bash
curl -o /tmp/combined.png -w "%{http_code}\n" http://52.139.179.111/api/jobs/<new_job_id>/layers/combined/0/0/0.png
curl -o /tmp/sentinel.png -w "%{http_code}\n" http://52.139.179.111/api/jobs/<new_job_id>/layers/sentinel/0/0/0.png
```

Expected: both return `200`.

Out-of-bounds tile behavior:

- Pan around raster edges in the map UI.
- Tile requests outside raster bounds should return transparent PNG `200`, not backend `500`.

## 6. Map Analysis UI

Open:

```text
http://52.139.179.111/map?jobId=<new_job_id>
```

Verify:

- OSM basemap is visible and cannot be toggled off.
- Sentinel RGB is toggleable.
- Combined condition mask is toggleable.
- Good roads are green.
- Unpaved roads are red.
- Damaged roads are yellow.
- Components layer toggles on/off.
- Betweenness layer toggles on/off.
- Critical junctions vector layer toggles on/off.
- Panning around raster edges does not produce visible map errors.

## 7. Reports UI

Open:

```text
http://52.139.179.111/reports?jobId=<new_job_id>
```

Verify:

- Report renders.
- Selected models are listed.
- Analytics and limitations are included.
- Download links are visible and usable.
- Failed or incomplete jobs show a useful state instead of crashing.

## 8. RAG Assistant Test

If `GEMINI_API_KEY` is not configured, fallback/extractive RAG is acceptable.

Use prompts:

```text
Summarize this assessment and mention the selected models.
What do the good, unpaved, damaged, and combined layers mean?
Explain the connectivity metrics and critical junctions.
What limitations should I mention in my report?
```

Expected:

- Answers cite Roadlytics/job evidence.
- Assistant mentions model outputs are decision-support signals, not field-confirmed truth.
- Assistant does not claim exact repair cost, legal compliance, guaranteed safety, or emergency routing reliability.
- If Gemini is later configured, provider should switch from local fallback to Gemini-backed generation.

## 9. Failure-Mode Tests

Run these after the happy path or with a cheaper/smaller file:

- Upload a non-TIFF file; expect a validation error before processing.
- Upload a TIFF with wrong band count if available; expect `Sentinel upload must be a 4-band GeoTIFF...`.
- POST invalid model values to `/api/jobs`; expect `422`.
- Open map/report for a failed job; UI should not crash.
- Request a missing job ID; expect `404`.

## Acceptance Criteria

- Antigravity creates a new `testing170` assessment from the browser without manual API work.
- The job reaches `completed` through Modal.
- Map layers, report, artifacts, analytics, and RAG work for the new job.
- Upload failures are diagnosable from frontend status and backend logs.
- The current handoff docs accurately state live/deployed/local/GitHub state.
- Upload-proxy and transparent-tile fixes are committed before another agent pulls the branch.
