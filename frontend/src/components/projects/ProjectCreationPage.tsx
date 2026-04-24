import { useCallback, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Polygon } from "geojson";

import { apiClient } from "@/lib/apiClient";
import type { BackendJob, BackendProject, BackendRegion } from "@/types";

type SegModel = "osm" | "deeplabv3";
type ClsModel = "kmeans" | "efficientnet";
type UploadState = "idle" | "attached" | "uploading" | "error";

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB
const ACCEPTED_EXTS = [".tif", ".tiff"];

const STAGE_STEPS = [
  { icon: "⬆", label: "Ingest" },
  { icon: "⊡", label: "Segmentation" },
  { icon: "◈", label: "Classification" },
  { icon: "⬡", label: "Connectivity" },
  { icon: "📄", label: "Report" },
];

const formatBytes = (bytes: number): string => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const validateFile = (file: File): string | null => {
  const name = file.name.toLowerCase();
  const valid = ACCEPTED_EXTS.some((ext) => name.endsWith(ext));
  if (!valid) return "Only .tif / .tiff files are accepted.";
  if (file.size > MAX_FILE_SIZE) return "File exceeds 2 GB limit.";
  return null;
};

const dummyPolygon: Polygon = {
  type: "Polygon",
  coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
};

function uploadWithProgress(
  url: string,
  formData: FormData,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.statusText || xhr.status}`));
    });
    xhr.addEventListener("error", () => { reject(new Error("Network error during upload.")); });
    xhr.send(formData);
  });
}

function DropZone({
  file,
  uploadState,
  uploadProgress,
  fileError,
  onFile,
  onReplace,
}: {
  file: File | null;
  uploadState: UploadState;
  uploadProgress: number;
  fileError: string | null;
  onFile: (f: File) => void;
  onReplace: () => void;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent): void => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) onFile(dropped);
  }, [onFile]);

  if (uploadState === "uploading") {
    return (
      <div style={{ padding: "32px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
          Uploading to inference server…
        </div>
        <div style={{ background: "var(--bg-tertiary)", borderRadius: 999, height: 8, overflow: "hidden", marginBottom: 8 }}>
          <div style={{ height: "100%", width: `${uploadProgress}%`, background: "var(--accent)", borderRadius: 999, transition: "width 0.3s" }} />
        </div>
        <div className="mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>{uploadProgress}%</div>
      </div>
    );
  }

  if (uploadState === "attached" && file) {
    return (
      <div style={{ padding: "20px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 8, background: "color-mix(in srgb, var(--success) 15%, white)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--success)", fontSize: 20 }}>✓</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{file.name}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{formatBytes(file.size)} · .tif</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {["B2 · 490 nm", "B3 · 560 nm", "B4 · 665 nm", "B8 · 842 nm"].map((band) => (
              <span key={band} style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 999, background: "var(--accent-subtle)", color: "var(--accent)" }}>{band}</span>
            ))}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" type="button" onClick={onReplace}>Replace</button>
      </div>
    );
  }

  const isError = uploadState === "error" || fileError;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => { setDragging(false); }}
      onDrop={handleDrop}
      onClick={() => { inputRef.current?.click(); }}
      style={{
        padding: "40px 24px",
        textAlign: "center",
        border: `2px dashed ${isError ? "var(--danger)" : dragging ? "var(--accent)" : "var(--border)"}`,
        borderRadius: "var(--radius-card)",
        cursor: "pointer",
        background: dragging ? "var(--accent-subtle)" : "transparent",
        transition: "all 0.15s",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".tif,.tiff"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>⬛</div>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Drop your GeoTIFF here</div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>Sentinel-2 / Landsat 8 supported</div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <button className="btn btn-primary btn-sm" type="button" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>Browse files</button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={(e) => { e.stopPropagation(); }}>Use demo file</button>
      </div>
      {(fileError) && (
        <div style={{ marginTop: 12, color: "var(--danger)", fontSize: 13 }}>{fileError}</div>
      )}
    </div>
  );
}

function PipelinePreview(): JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {STAGE_STEPS.map((step, i) => (
        <div key={step.label} style={{ display: "flex", alignItems: "center", flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--bg-tertiary)", border: "2px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, marginBottom: 8 }}>{step.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", textAlign: "center" }}>{step.label}</div>
          </div>
          {i < STAGE_STEPS.length - 1 && (
            <div style={{ width: 24, height: 2, background: "var(--border)", flexShrink: 0 }} />
          )}
        </div>
      ))}
    </div>
  );
}

function ModelCard({
  label,
  desc,
  badge,
  selected,
  onClick,
}: {
  label: string;
  desc: string;
  badge?: string;
  selected: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "16px",
        borderRadius: "var(--radius-card)",
        border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        background: selected ? "var(--accent-subtle)" : "var(--surface)",
        textAlign: "left",
        cursor: "pointer",
        width: "100%",
        transition: "all 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
        {badge && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "color-mix(in srgb, var(--success) 15%, white)", color: "var(--success)" }}>{badge}</span>
        )}
      </div>
      <div className="muted" style={{ fontSize: 13 }}>{desc}</div>
      {selected && (
        <div style={{ marginTop: 8, width: 18, height: 18, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
        </div>
      )}
    </button>
  );
}

function PipelineConfigModal({
  segModel,
  clsModel,
  onSegModel,
  onClsModel,
  onStart,
  onClose,
  isStarting,
}: {
  segModel: SegModel;
  clsModel: ClsModel;
  onSegModel: (m: SegModel) => void;
  onClsModel: (m: ClsModel) => void;
  onStart: () => void;
  onClose: () => void;
  isStarting: boolean;
}): JSX.Element {
  const segEta = segModel === "osm" ? "~15 s" : "~4 min";
  const clsEta = clsModel === "kmeans" ? "~40 s" : "~3 min";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(44,36,24,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "var(--surface)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-elev)", width: "100%", maxWidth: 560, padding: 32, position: "relative" }}>
        <button
          type="button"
          onClick={onClose}
          style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: 20, lineHeight: 1 }}
        >×</button>

        <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Configure Pipeline</h2>
        <div className="muted" style={{ fontSize: 13, marginBottom: 24 }}>Select models for road segmentation and condition classification.</div>

        <div style={{ marginBottom: 20 }}>
          <div className="section-label" style={{ marginBottom: 10 }}>Road Segmentation</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <ModelCard
              label="OpenStreetMap"
              desc={`Rule-based · CPU · ${segModel === "osm" ? segEta : "~15 s"}`}
              selected={segModel === "osm"}
              onClick={() => { onSegModel("osm"); }}
            />
            <ModelCard
              label="DeepLabv3"
              desc={`ResNet-101 · GPU · ${segModel === "deeplabv3" ? segEta : "~4 min"}`}
              badge="Recommended"
              selected={segModel === "deeplabv3"}
              onClick={() => { onSegModel("deeplabv3"); }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div className="section-label" style={{ marginBottom: 10 }}>Condition Classification</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <ModelCard
              label="K-Means"
              desc={`Unsupervised · CPU · ${clsModel === "kmeans" ? clsEta : "~40 s"}`}
              selected={clsModel === "kmeans"}
              onClick={() => { onClsModel("kmeans"); }}
            />
            <ModelCard
              label="EfficientNet-B3"
              desc={`Supervised CNN · GPU · ${clsModel === "efficientnet" ? clsEta : "~3 min"}`}
              badge="Recommended"
              selected={clsModel === "efficientnet"}
              onClick={() => { onClsModel("efficientnet"); }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 24, padding: "12px 16px", borderRadius: "var(--radius-btn)", background: "var(--bg-secondary)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)", flexShrink: 0 }} />
          <div style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 500 }}>Network Analysis</span>
            <span className="muted"> · Always included · ~30 s</span>
          </div>
        </div>

        <div style={{ padding: "12px 16px", borderRadius: "var(--radius-btn)", background: "var(--accent-subtle)", fontSize: 13, marginBottom: 24 }}>
          <span style={{ fontWeight: 600, color: "var(--accent)" }}>{segModel === "osm" ? "OSM" : "DeepLabv3"} → {clsModel === "kmeans" ? "K-Means" : "EfficientNet-B3"} → Network Analysis</span>
          <span className="muted"> · ETA {segEta} + {clsEta} + ~30 s</span>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={isStarting}>Cancel</button>
          <button className="btn btn-primary" type="button" onClick={onStart} disabled={isStarting}>
            {isStarting ? "Starting…" : "Start Pipeline"}
          </button>
        </div>
      </div>
    </div>
  );
}

export const ProjectCreationPage = (): JSX.Element => {
  const navigate = useNavigate();

  const [projectName, setProjectName] = useState("");
  const [regionTag, setRegionTag] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const [segModel, setSegModel] = useState<SegModel>("deeplabv3");
  const [clsModel, setClsModel] = useState<ClsModel>("efficientnet");
  const [showModal, setShowModal] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleFile = (f: File): void => {
    const err = validateFile(f);
    if (err) {
      setFileError(err);
      setUploadState("error");
      return;
    }
    setFileError(null);
    setFile(f);
    setUploadState("attached");
  };

  const handleReplace = (): void => {
    setFile(null);
    setUploadState("idle");
    setFileError(null);
  };

  const canRunPipeline = file !== null && projectName.trim().length > 0 && uploadState === "attached";

  const handleStartPipeline = async (): Promise<void> => {
    if (!file || !canRunPipeline) return;
    setIsStarting(true);
    setActionError(null);

    try {
      const project = await apiClient.post<BackendProject>("/projects", {
        name: projectName.trim(),
        description: description.trim(),
      });

      const region = await apiClient.post<BackendRegion>(`/projects/${project.id}/regions`, {
        name: regionTag.trim() || projectName.trim(),
        polygon: dummyPolygon,
      });

      const job = await apiClient.post<BackendJob & { upload_url?: string }>("/jobs", {
        region_id: region.id,
        job_type: "full",
        seg_model: segModel,
        clf_model: clsModel,
      });

      const uploadUrl = job.upload_url;
      if (!uploadUrl) {
        throw new Error("No upload URL returned from server.");
      }

      setShowModal(false);
      setUploadState("uploading");
      setUploadProgress(0);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("region_name", regionTag.trim() || projectName.trim());
      formData.append("backend_job_id", job.id);
      formData.append("seg_model", segModel);
      formData.append("clf_model", clsModel);

      await uploadWithProgress(uploadUrl, formData, setUploadProgress);

      navigate(`/processing?job=${job.id}`);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Pipeline failed to start.");
      setIsStarting(false);
      setUploadState("attached");
    }
  };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24, fontSize: 13, color: "var(--text-secondary)" }}>
        <Link to="/projects" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>Projects</Link>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
        <span>New Project</span>
        <span style={{ marginLeft: "auto", fontSize: 12 }}>Step 1 of 2</span>
      </div>

      <h1 className="page-title" style={{ marginBottom: 4 }}>New Project</h1>
      <div className="muted" style={{ marginBottom: 32, fontSize: 14 }}>Set up your assessment area and upload satellite imagery.</div>

      {actionError && (
        <div style={{ marginBottom: 20, padding: "12px 16px", borderRadius: "var(--radius-btn)", background: "color-mix(in srgb, var(--danger) 10%, white)", color: "var(--danger)", fontSize: 14, border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)" }}>
          {actionError}
        </div>
      )}

      {/* Project Details */}
      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Project Details</h3>
        <div className="muted" style={{ fontSize: 13, marginBottom: 20 }}>Name your project and add optional metadata.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div className="field">
            <label htmlFor="project-name">Project name <span style={{ color: "var(--danger)" }}>*</span></label>
            <input
              id="project-name"
              type="text"
              value={projectName}
              onChange={(e) => { setProjectName(e.target.value); }}
              placeholder="Kabul North Assessment"
            />
          </div>
          <div className="field">
            <label htmlFor="region-tag">Region tag <span className="muted">(optional)</span></label>
            <input
              id="region-tag"
              type="text"
              value={regionTag}
              onChange={(e) => { setRegionTag(e.target.value); }}
              placeholder="34.5°N 69.2°E"
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="description">Description <span className="muted">(optional)</span></label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => { setDescription(e.target.value); }}
            placeholder="Survey area covering northern districts…"
            rows={3}
            style={{ resize: "vertical" }}
          />
        </div>
      </div>

      {/* Satellite Imagery */}
      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Satellite Imagery</h3>
        <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>Upload a 4-band GeoTIFF for AI road assessment.</div>

        <DropZone
          file={file}
          uploadState={uploadState}
          uploadProgress={uploadProgress}
          fileError={fileError}
          onFile={handleFile}
          onReplace={handleReplace}
        />

        {/* Requirements */}
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {[
            "4-band GeoTIFF (B2, B3, B4, B8)",
            "Projected CRS (EPSG:326xx / 327xx)",
            "Max file size 2 GB",
            "Resolution ≤ 10 m/px",
          ].map((req) => (
            <div key={req} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
              {req}
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline Preview */}
      <div className="card card-pad" style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Pipeline</h3>
        <div className="muted" style={{ fontSize: 13, marginBottom: 20 }}>5-stage automated processing — runs after upload.</div>
        <PipelinePreview />
      </div>

      {/* Footer */}
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
        <Link to="/projects" className="btn btn-ghost" style={{ textDecoration: "none" }}>Cancel</Link>
        <button
          className="btn btn-primary"
          type="button"
          disabled={!canRunPipeline || isStarting}
          onClick={() => { setShowModal(true); }}
        >
          Run Pipeline
        </button>
      </div>

      {showModal && (
        <PipelineConfigModal
          segModel={segModel}
          clsModel={clsModel}
          onSegModel={setSegModel}
          onClsModel={setClsModel}
          onStart={() => { void handleStartPipeline(); }}
          onClose={() => { setShowModal(false); }}
          isStarting={isStarting}
        />
      )}
    </div>
  );
};
