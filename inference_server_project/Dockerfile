FROM python:3.11-slim

# System dependencies for GDAL/rasterio and OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    gdal-bin libgdal-dev python3-gdal \
    libgl1-mesa-glx libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy inference server code
COPY inference_server/ ./inference_server/
COPY run_server.py .

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
