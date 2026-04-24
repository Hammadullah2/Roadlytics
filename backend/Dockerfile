FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gdal-bin \
    libgdal-dev \
    libproj-dev \
    proj-bin \
    proj-data \
    libgeos-dev \
    libspatialindex-dev \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY road_pipeline/requirements.txt /tmp/road_pipeline-requirements.txt
COPY backend/requirements.txt /tmp/backend-requirements.txt

RUN pip install --upgrade pip setuptools wheel && \
    pip install -r /tmp/road_pipeline-requirements.txt -r /tmp/backend-requirements.txt

COPY backend /app/backend
COPY road_pipeline /app/road_pipeline
COPY pytest.ini /app/pytest.ini

EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]

