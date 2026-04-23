import { Upload } from "lucide-react";
import { useRef } from "react";

import { UploadFormState } from "@/models/UploadFormState";

type FileDropZoneProps = {
  formState: UploadFormState;
  onFormStateChange: (nextState: UploadFormState) => void;
};

class FileDropZoneCopy {
  public static readonly label = "If uploading:";
  public static readonly helperText = "Click to choose file";
  public static readonly supportText = "Supports GeoTIFF, JPG, PNG";
  public static readonly accept = ".tiff,.tif,.jpg,.jpeg,.png,image/jpeg,image/png,image/tiff";
}

class FileDropZoneStateAdapter {
  public static applySelectedFile(
    formState: UploadFormState,
    file: File | null,
    onFormStateChange: (nextState: UploadFormState) => void,
  ): void {
    const nextState = formState.clone();
    nextState.setFile(file);
    onFormStateChange(nextState);
  }
}

export const FileDropZone = ({
  formState,
  onFormStateChange,
}: FileDropZoneProps): JSX.Element => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <section className="mt-5">
      <label className="mb-3 block text-sm font-medium text-[color:var(--text-primary)]">
        {FileDropZoneCopy.label}
      </label>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          FileDropZoneStateAdapter.applySelectedFile(
            formState,
            event.dataTransfer.files?.[0] ?? null,
            onFormStateChange,
          );
        }}
        className="flex w-full flex-col items-center justify-center gap-3 rounded-[14px] border border-dashed border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 py-12 text-center text-[color:var(--text-secondary)]"
      >
        <Upload size={40} color="var(--accent-green)" />
        <span className="text-[1.05rem] font-medium text-[color:var(--text-primary)]">
          {FileDropZoneCopy.helperText}
        </span>
        <span className="text-sm text-[color:var(--text-secondary)]">
          {FileDropZoneCopy.supportText}
        </span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept={FileDropZoneCopy.accept}
        className="hidden"
        onChange={(event) => {
          FileDropZoneStateAdapter.applySelectedFile(
            formState,
            event.target.files?.[0] ?? null,
            onFormStateChange,
          );
        }}
      />

      {formState.selectedFile ? (
        <p className="mt-3 text-sm text-[color:var(--text-primary)]">
          {formState.selectedFile.name}
        </p>
      ) : null}
    </section>
  );
};
