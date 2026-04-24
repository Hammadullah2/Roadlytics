import type { Polygon } from "geojson";

import { UploadFormState } from "@/models/UploadFormState";
import { UploadMethod } from "@/models/UploadMethod";

export const SATELLITE_UPLOAD_QUERY_PARAM = "upload";
export const SATELLITE_UPLOAD_QUERY_VALUE = "satellite-imagery";
export const SATELLITE_UPLOAD_DRAW_QUERY_PARAM = "draw";
export const SATELLITE_UPLOAD_DRAW_QUERY_VALUE = "satellite-download-region";
export const SATELLITE_UPLOAD_RETURN_TO_QUERY_PARAM = "returnTo";

const SATELLITE_UPLOAD_DRAFT_KEY = "road-quality-satellite-upload-draft";

const isBrowser = (): boolean => {
  return typeof window !== "undefined";
};

export const buildSatelliteUploadReturnPath = (): string => {
  const params = new URLSearchParams({
    [SATELLITE_UPLOAD_QUERY_PARAM]: SATELLITE_UPLOAD_QUERY_VALUE,
  });

  return `/dashboard?${params.toString()}`;
};

export const readSatelliteUploadDraft = (): UploadFormState | null => {
  if (!isBrowser()) {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(SATELLITE_UPLOAD_DRAFT_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as ReturnType<UploadFormState["toDraft"]>;
    return UploadFormState.fromDraft(parsedValue);
  } catch {
    return null;
  }
};

export const writeSatelliteUploadDraft = (formState: UploadFormState): void => {
  if (!isBrowser()) {
    return;
  }

  window.sessionStorage.setItem(SATELLITE_UPLOAD_DRAFT_KEY, JSON.stringify(formState.toDraft()));
};

export const clearSatelliteUploadDraft = (): void => {
  if (!isBrowser()) {
    return;
  }

  window.sessionStorage.removeItem(SATELLITE_UPLOAD_DRAFT_KEY);
};

export const storeSatelliteUploadRegionSelection = (polygon: Polygon): void => {
  const nextState = readSatelliteUploadDraft() ?? UploadFormState.createDefault();
  const updatedState = nextState.clone();
  const pointCount = Math.max((polygon.coordinates[0]?.length ?? 1) - 1, 0);
  const label = pointCount > 0 ? `Selected region (${pointCount} points)` : "Selected region";

  updatedState.setMethod(UploadMethod.DOWNLOAD_PROVIDER);
  updatedState.setRegionSelection(label, polygon);
  writeSatelliteUploadDraft(updatedState);
};
