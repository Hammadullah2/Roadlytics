FROM python:3.11-slim

# System dependencies for GDAL/rasterio and OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    gdal-bin libgdal-dev \
    build-essential python3-dev \
    libgl1 libglib2.0-0 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Upgrade pip and install build requirements
RUN pip install --no-cache-dir --upgrade pip "setuptools<70" wheel

# Pre-install build-time dependencies for rasterio and other geospatial libs
# We use the same numpy version as in requirements.txt
RUN pip install --no-cache-dir cython numpy==1.26.3

# Install Python dependencies
# --no-build-isolation is critical here to ensure our environment's setuptools is used
# We also pass CFLAGS to prevent build failures from incompatible pointer type warnings
COPY inference_server_project/requirements.txt .
RUN CFLAGS="-Wno-error=incompatible-pointer-types" \
    pip install --no-cache-dir -r requirements.txt --no-build-isolation

# Copy road_pipeline package (required by inference_server)
COPY road_pipeline/ ./road_pipeline/

# Copy inference server code
COPY inference_server_project/inference_server/ ./inference_server/
COPY inference_server_project/run_server.py .

# Weights are mounted at runtime from the host's weights/ directory
# Example:  docker run -v /path/to/weights:/app/weights ...
VOLUME /app/weights

# Output directory for job results
VOLUME /app/outputs

ENV ARTIFACTS_DIR=/app/weights
ENV OUTPUT_DIR=/app/outputs
ENV DEVICE=cuda

EXPOSE 8000

CMD ["python", "run_server.py"]
