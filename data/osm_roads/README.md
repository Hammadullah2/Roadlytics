# OSM Roads Dataset

Place the Pakistan roads shapefile for the `PakOSM` segmentation path in this folder.

Expected files:

- `gis_osm_roads_free_1.shp`
- `gis_osm_roads_free_1.shx`
- `gis_osm_roads_free_1.dbf`
- `gis_osm_roads_free_1.prj`
- `gis_osm_roads_free_1.cpg`

Docker mounts this folder into the backend container at `/app/data/osm_roads`.

