export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

export const BASEMAP_TILE_URL =
  process.env.NEXT_PUBLIC_BASEMAP_TILE_URL ??
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const BASEMAP_ATTRIBUTION =
  process.env.NEXT_PUBLIC_BASEMAP_ATTRIBUTION ??
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

