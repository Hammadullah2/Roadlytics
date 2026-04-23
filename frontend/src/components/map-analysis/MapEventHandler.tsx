import { useEffect } from "react";
import { useMap, useMapEvents } from "react-leaflet";

type MapEventHandlerProps = {
  onMapClick: (latlng: { lat: number; lng: number }) => void;
};

export const MapEventHandler = ({
  onMapClick,
}: MapEventHandlerProps): null => {
  const map = useMap();

  useMapEvents({
    click(event) {
      onMapClick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [map]);

  return null;
};
