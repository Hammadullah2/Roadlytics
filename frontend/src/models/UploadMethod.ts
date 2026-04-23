export class UploadMethod {
  public static readonly UPLOAD_FILE = new UploadMethod(
    "UPLOAD_FILE",
    "Upload File (GeoTIFF, JPG, PNG)",
  );

  public static readonly DOWNLOAD_PROVIDER = new UploadMethod(
    "DOWNLOAD_PROVIDER",
    "Download from Satellite Provider (Sentinel/Landsat)",
  );

  private static readonly allMethods: UploadMethod[] = [
    UploadMethod.UPLOAD_FILE,
    UploadMethod.DOWNLOAD_PROVIDER,
  ];

  public readonly value: string;
  public readonly label: string;

  private constructor(value: string, label: string) {
    this.value = value;
    this.label = label;
  }

  public static getAll(): UploadMethod[] {
    return [...UploadMethod.allMethods];
  }

  public static fromValue(value: string): UploadMethod {
    return UploadMethod.allMethods.find((method) => method.value === value) ?? UploadMethod.UPLOAD_FILE;
  }

  public equals(method: UploadMethod): boolean {
    return this.value === method.value;
  }
}
