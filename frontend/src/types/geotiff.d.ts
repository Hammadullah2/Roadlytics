declare module "geotiff" {
  export function fromArrayBuffer(buffer: ArrayBuffer): Promise<GeoTIFF>;

  interface GeoTIFF {
    getImage(index?: number): Promise<GeoTIFFImage>;
  }

  interface GeoTIFFImage {
    getWidth(): number;
    getHeight(): number;
    readRasters(options?: Record<string, unknown>): Promise<TypedArray[]>;
  }

  type TypedArray =
    | Uint8Array
    | Uint16Array
    | Uint32Array
    | Int8Array
    | Int16Array
    | Int32Array
    | Float32Array
    | Float64Array;
}
