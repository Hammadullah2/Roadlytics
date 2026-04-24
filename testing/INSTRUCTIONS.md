# Roadlytics Backend & Pipeline Testing Instructions

## 🎯 Objective
Your goal is to successfully run, debug, and fix the entire Roadlytics backend architecture. This architecture spans a **local/Vercel Go backend**, a **remote AWS VPS** hosting the Dockerized inference stack (FastAPI, Redis, Celery), and a **remote Supabase** database.

Currently, the services are experiencing communication failures, resulting in `Connection refused` or `Not Found` errors. You must fix the deployment/configuration and ensure every component works flawlessly end-to-end.

## 🏗️ Architecture & Environment Context
Before you begin, understand the hybrid deployment:
1. **AWS VPS (Inference Stack)**: The Docker containers (`inference-redis`, `inference-server`, `inference-worker`, `inference-nginx`) are running on a remote AWS EC2 instance (Ubuntu). 
2. **Go Backend**: The REST API is either running locally (e.g., on port 8080 or 3000 via Vercel dev) or deployed. It communicates with the AWS VPS to dispatch jobs.
3. **Supabase**: Used for Postgres database, authentication, and file storage. Keys are located in the `.env` file at the root of the project.

**Crucial Variables for the Agent to Request/Verify**:
- `<VPS_IP>`: 13.48.193.214
- `<SSH_KEY_PATH>`: ~/Downloads/roadlytics-key.pem
- `BACKEND_URL`: `https://backend-ivory-omega.vercel.app/`
- `INFERENCE_SERVER_URL`: Must be `http://<VPS_IP>:80` (the Nginx proxy sitting in front of the FastAPI inference server).

## 📁 Testing Suite Overview
A robust integration test suite has been prepared in the local `testing/` directory.

- **`test_docker.sh`**: Validates the health of the inference containers. **Must be run on the AWS VPS** (or locally via SSH wrapper).
- **`test_inference_api.py`**: Tests the FastAPI endpoints over HTTP. Submits `sample.tif` to the AWS VPS.
- **`test_backend_api.py`**: Tests the Go REST API locally.
- **`test_e2e_pipeline.py`**: Tests the end-to-end flow between the Go backend, Supabase, and the AWS inference server.

## 🚀 Step-by-Step Execution Plan

### Step 1: AWS VPS Setup & Docker Debugging
1. Request the VPS IP and SSH Key from the user if not already provided.
2. SSH into the instance: `ssh -i <SSH_KEY_PATH> ubuntu@<VPS_IP>`
3. Check the Docker stack: `docker ps` and `docker logs inference-worker`. 
4. The Redis and Celery queues must be active. If anything is crashing, inspect the `docker-compose.vps.yml` on the VPS and restart the stack. 
5. Ensure port `80` is open on the AWS Security Group so the Nginx proxy can receive HTTP requests from the local machine.

### Step 2: Test the Remote Inference API
1. On the local machine, activate the test environment: `cd testing && source .venv/bin/activate`
2. Export the target URL: `export BASE_URL="http://<VPS_IP>"` (no port needed if Nginx is on 80).
3. Run `pytest test_inference_api.py -v`.
4. Ensure the actual `sample.tif` file in the testing folder is successfully uploaded to the VPS, picked up by the Celery worker, and processed. Inspect Celery worker logs on the VPS if it stalls.

### Step 3: Configure and Test the Go Backend
1. Ensure the root `.env` file has the correct Supabase credentials (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
2. Ensure the root `.env` file points to the AWS VPS: `INFERENCE_SERVER_URL="http://<VPS_IP>"`
3. Start the Go backend locally if it isn't running (`make run` or `vercel dev`).
4. Run `pytest test_backend_api.py -v`. Debug Go router or Supabase auth issues if it fails.

### Step 4: Fix the End-to-End Pipeline
1. Run `pytest test_e2e_pipeline.py -v`.
2. **IMPORTANT**: You will need to obtain a valid Supabase JWT token to pass the backend's Auth middleware. Either register a test user via the API and extract the token, or bypass it temporarily for testing.
3. The end-to-end flow must succeed: 
   - Backend creates a Job record in Supabase.
   - Backend forwards the `.tif` to the AWS VPS.
   - AWS VPS (Celery) processes the file and uploads results to Supabase Storage.
   - AWS VPS triggers the Go backend callback endpoint to mark the job as complete.

## ✅ Definition of Done
1. All scripts and `pytest` files pass with 0 errors.
2. The AWS EC2 Celery worker successfully consumes tasks and uploads inference outputs back to Supabase.
3. The local Go backend successfully coordinates jobs with the remote VPS.
