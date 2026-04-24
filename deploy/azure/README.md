# Azure VM Deployment

This folder contains the production deployment pieces for running Roadlytics on
an Azure Ubuntu VM with Docker Compose.

## What this setup assumes

- One Azure Ubuntu VM runs the application containers
- Azure Blob is used for uploads and generated artifacts
- The Roadlytics repo lives on the VM at `/opt/roadlytics`
- Model weights live in `/opt/roadlytics/model_weights`
- PakOSM shapefiles live in `/opt/roadlytics/data/osm_roads`
- Caddy handles HTTP/HTTPS and routes traffic to the frontend and backend containers

## Files

- `vm-bootstrap.sh`: installs Docker, Compose, and basic packages on Ubuntu
- `.env.vm.example`: production environment template
- `docker-compose.prod.yml`: compose overlay with Caddy
- `Caddyfile`: reverse proxy config
- `deploy.sh`: builds and starts the production stack
- `fetch-pakosm.sh`: downloads and extracts Pakistan OSM shapefiles from Geofabrik

## VM flow

1. Create an Ubuntu VM in Azure
2. Open inbound ports `22`, `80`, and `443`
3. SSH into the VM
4. Run `sudo bash deploy/azure/vm-bootstrap.sh`
5. Copy the repo to `/opt/roadlytics`
6. Put model weights into `/opt/roadlytics/model_weights`
7. Run `bash deploy/azure/fetch-pakosm.sh` or copy the shapefiles into `data/osm_roads`
8. Copy `.env.vm.example` to `.env.vm` and fill the real values
9. Run `bash deploy/azure/deploy.sh`

## Azure resources you need

- 1 Ubuntu VM
- 1 Storage Account
- 1 Blob container for Roadlytics artifacts
- 1 public IP or DNS name for the VM

