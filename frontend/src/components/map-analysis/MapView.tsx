import { MapContainer, TileLayer } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
import type { MutableRefObject } from "react";

import { MapEventHandler } from "@/components/map-analysis/MapEventHandler";

type MapViewProps = {
  mapRef: MutableRefObject<LeafletMap | null>;
  onMapClick: (latlng: { lat: number; lng: number }) => void;
};

class MapViewConfig {
  public static readonly center: [number, number] = [51.505, -0.09];
  public static readonly tileUrl =
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
  public static readonly attribution = "&copy; <a href=\"https://carto.com/\">CARTO</a>";
}

export const MapView = ({
  mapRef,
  onMapClick,
}: MapViewProps): JSX.Element => {
  return (
    <MapContainer
      center={MapViewConfig.center}
      zoom={13}
      ref={(map) => {
        if (map !== null) {
          mapRef.current = map;
        }
      }}
      className="h-full w-full"
      zoomControl={false}
      style={{ width: "100%", height: "100%", zIndex: 1 }}
    >
      <TileLayer
        url={MapViewConfig.tileUrl}
        attribution={MapViewConfig.attribution}
      />
      <MapEventHandler onMapClick={onMapClick} />
    </MapContainer>
  );
};
