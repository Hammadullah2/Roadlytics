#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-$(pwd)/data/osm_roads}"
ZIP_URL="${PAKOSM_ZIP_URL:-https://download.geofabrik.de/asia/pakistan-latest-free.shp.zip}"

TMP_DIR="$(mktemp -d)"
ZIP_PATH="${TMP_DIR}/pakistan-latest-free.shp.zip"

mkdir -p "${TARGET_DIR}"

echo "Downloading Pakistan OSM shapefiles from:"
echo "  ${ZIP_URL}"

curl -L "${ZIP_URL}" -o "${ZIP_PATH}"

unzip -j -o "${ZIP_PATH}" \
  "gis_osm_roads_free_1.shp" \
  "gis_osm_roads_free_1.shx" \
  "gis_osm_roads_free_1.dbf" \
  "gis_osm_roads_free_1.prj" \
  "gis_osm_roads_free_1.cpg" \
  -d "${TARGET_DIR}"

rm -rf "${TMP_DIR}"

echo "PakOSM road shapefiles are ready in ${TARGET_DIR}"

