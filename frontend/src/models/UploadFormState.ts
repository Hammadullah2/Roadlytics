import type { Polygon } from "geojson";

import { UploadMethod } from "@/models/UploadMethod";
import type { UploadPayload } from "@/models/UploadPayload";

export type UploadFormStateDraft = {
  selectedMethod: string;
  regionDescription: string;
  regionPolygon: Polygon | null;
  startDate: string;
  endDate: string;
};

export class UploadFormState {
  public selectedMethod: UploadMethod;
  public regionDescription: string;
  public regionPolygon: Polygon | null;
  public startDate: string;
  public endDate: string;
  public isSubmitting: boolean;
  public selectedFile: File | null;
  public errorMessage: string;

  public constructor(
    selectedMethod: UploadMethod = UploadMethod.UPLOAD_FILE,
    regionDescription: string = "",
    regionPolygon: Polygon | null = null,
    startDate: string = "",
    endDate: string = "",
    isSubmitting: boolean = false,
    selectedFile: File | null = null,
    errorMessage: string = "",
  ) {
    this.selectedMethod = selectedMethod;
    this.regionDescription = regionDescription;
    this.regionPolygon = regionPolygon;
    this.startDate = startDate;
    this.endDate = endDate;
    this.isSubmitting = isSubmitting;
    this.selectedFile = selectedFile;
    this.errorMessage = errorMessage;
  }

  public static createDefault(): UploadFormState {
    return new UploadFormState(UploadMethod.DOWNLOAD_PROVIDER);
  }

  public static fromDraft(draft: Partial<UploadFormStateDraft>): UploadFormState {
    return new UploadFormState(
      UploadMethod.fromValue(typeof draft.selectedMethod === "string" ? draft.selectedMethod : UploadMethod.UPLOAD_FILE.value),
      typeof draft.regionDescription === "string" ? draft.regionDescription : "",
      draft.regionPolygon ?? null,
      typeof draft.startDate === "string" ? draft.startDate : "",
      typeof draft.endDate === "string" ? draft.endDate : "",
    );
  }

  public clone(): UploadFormState {
    return new UploadFormState(
      this.selectedMethod,
      this.regionDescription,
      this.regionPolygon,
      this.startDate,
      this.endDate,
      this.isSubmitting,
      this.selectedFile,
      this.errorMessage,
    );
  }

  public setMethod(method: UploadMethod): void {
    this.selectedMethod = method;
    this.errorMessage = "";

    if (this.isDownloadMode()) {
      this.selectedFile = null;
      return;
    }

    this.regionDescription = "";
    this.regionPolygon = null;
    this.startDate = "";
    this.endDate = "";
  }

  public setRegion(value: string): void {
    this.regionDescription = value;
  }

  public setRegionSelection(label: string, polygon: Polygon): void {
    this.regionDescription = label;
    this.regionPolygon = polygon;
    this.errorMessage = "";
  }

  public clearRegionSelection(): void {
    this.regionDescription = "";
    this.regionPolygon = null;
  }

  public setDateRange(start: string, end: string): void {
    this.startDate = start;
    this.endDate = end;
  }

  public setSubmitting(value: boolean): void {
    this.isSubmitting = value;
  }

  public setFile(file: File | null): void {
    this.selectedFile = file;
    this.errorMessage = "";
  }

  public setError(message: string): void {
    this.errorMessage = message;
  }

  public clearError(): void {
    this.errorMessage = "";
  }

  public isDownloadMode(): boolean {
    return this.selectedMethod.equals(UploadMethod.DOWNLOAD_PROVIDER);
  }

  public hasRegionSelection(): boolean {
    return this.regionPolygon !== null;
  }

  public isValid(): boolean {
    if (this.isDownloadMode()) {
      return (
        this.regionPolygon !== null &&
        this.startDate.trim().length > 0 &&
        this.endDate.trim().length > 0
      );
    }

    return this.selectedFile !== null;
  }

  public toPayload(): UploadPayload {
    return {
      method: this.selectedMethod,
      region: this.regionDescription || undefined,
      regionPolygon: this.regionPolygon ?? undefined,
      startDate: this.startDate || undefined,
      endDate: this.endDate || undefined,
    };
  }

  public toDraft(): UploadFormStateDraft {
    return {
      selectedMethod: this.selectedMethod.value,
      regionDescription: this.regionDescription,
      regionPolygon: this.regionPolygon,
      startDate: this.startDate,
      endDate: this.endDate,
    };
  }
}
