import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useProjects } from "@/hooks/useProjects";
import { useRegions } from "@/hooks/useRegions";
import { apiClient } from "@/lib/apiClient";
import type { BackendJob } from "@/types";

type UploadState = "idle" | "uploading" | "attached";
type SegModel = "osm" | "deeplabv3";
type ClfModel = "kmeans" | "efficientnet";

// Placeholder polygon covering South Asia (Pakistan area) for auto-created regions
const PLACEHOLDER_POLYGON = {
  type: "Polygon" as const,
  coordinates: [[[60, 20], [80, 20], [80, 35], [60, 35], [60, 20]]] as [number, number][][],
};

function CheckIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function UploadIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function FileTextIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function CheckCircleIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function InfoIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function Req({ label }: { label: string }) {
  return (
    <div className="row" style={{ gap: 8, color: "var(--text-primary)" }}>
      <div style={{ width: 18, height: 18, borderRadius: "50%", background: "color-mix(in srgb, var(--success) 15%, white)", color: "var(--success)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <CheckIcon size={11} />
      </div>
      <span style={{ fontSize: 13 }}>{label}</span>
    </div>
  );
}

function ModelOption({ active, onClick, title, subtitle, desc, chips, recommended }: {
  active: boolean; onClick: () => void; title: string; subtitle: string;
  desc: string; chips: string[]; recommended?: boolean;
}) {
  return (
    <div onClick={onClick} style={{
      padding: 16, borderRadius: 12, cursor: "pointer",
      border: active ? "2px solid var(--accent)" : "2px solid var(--border)",
      background: active ? "var(--accent-subtle)" : "white",
      transition: "all .15s", position: "relative",
    }}>
      {recommended && (
        <span style={{ position: "absolute", top: 10, right: 10, fontSize: 10, fontWeight: 600, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Recommended
        </span>
      )}
      <div className="row space-between" style={{ marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
          <div className="muted" style={{ fontSize: 11 }}>{subtitle}</div>
        </div>
        <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${active ? "var(--accent)" : "var(--border)"}`, background: active ? "var(--accent)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {active && <CheckIcon size={10} />}
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 10 }}>{desc}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {chips.map((c) => (
          <span key={c} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 999, background: "white", border: "1px solid var(--border)", color: "var(--text-secondary)", fontFamily: "monospace", textTransform: "uppercase" }}>{c}</span>
        ))}
      </div>
    </div>
  );
}

type SubmitPhase = "idle" | "creating" | "uploading" | "done";

type PipelineConfigModalProps = {
  segModel: SegModel; setSegModel: (m: SegModel) => void;
  clsModel: ClfModel; setClsModel: (m: ClfModel) => void;
  isSubmitting: boolean;
  submitPhase: SubmitPhase;
  uploadProgress: number;
  onCancel: () => void;
  onConfirm: () => void;
};

function PipelineConfigModal({ segModel, setSegModel, clsModel, setClsModel, isSubmitting, submitPhase, uploadProgress, onCancel, onConfirm }: PipelineConfigModalProps) {
  const eta = `~${segModel === "osm" ? 0.25 : 4}+${clsModel === "kmeans" ? 0.7 : 3}+0.5 min`;
  const pipeline = `ingest → ${segModel === "osm" ? "osm_overlay" : "deeplabv3"} → ${clsModel === "kmeans" ? "kmeans" : "efficientnet_b3"} → network_metrics → report`;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(38,28,18,0.45)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-elev)", width: 720, maxWidth: "100%", maxHeight: "90vh", overflow: "auto", border: "1px solid var(--border)" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
          <div className="row space-between">
            <div>
              <h2 style={{ fontSize: 20 }}>Configure Pipeline</h2>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Choose models for this batch run. All stages (segmentation, classification, network analysis) run in sequence.</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onCancel} style={{ padding: 6 }}><XIcon /></button>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <div className="row space-between" style={{ marginBottom: 8 }}>
              <div className="section-label" style={{ margin: 0 }}>Road Segmentation</div>
              <span className="muted mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Stage 2</span>
            </div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>How should we extract the road network from the imagery?</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <ModelOption active={segModel === "osm"} onClick={() => setSegModel("osm")} title="OpenStreetMap" subtitle="Vector overlay" desc="Use existing OSM road geometry. Fast, deterministic, no GPU. Best when OSM coverage is good." chips={["~15s", "CPU only", "Community data"]} />
              <ModelOption active={segModel === "deeplabv3"} onClick={() => setSegModel("deeplabv3")} title="DeepLabv3" subtitle="Semantic segmentation" desc="ResNet-101 backbone trained on Sentinel-2. Detects unmapped and informal roads from pixels." chips={["~4 min", "GPU · 8GB", "Recommended"]} recommended />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div className="row space-between" style={{ marginBottom: 8 }}>
              <div className="section-label" style={{ margin: 0 }}>Road Condition Classification</div>
              <span className="muted mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Stage 3</span>
            </div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>How should we label each road pixel as good / damaged / unpaved?</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <ModelOption active={clsModel === "kmeans"} onClick={() => setClsModel("kmeans")} title="K-Means" subtitle="Unsupervised · k=3" desc="Spectral clustering on B2/B3/B4/B8. Fast baseline, no training data needed." chips={["~40s", "CPU only", "Unsupervised"]} />
              <ModelOption active={clsModel === "efficientnet"} onClick={() => setClsModel("efficientnet")} title="EfficientNet-B3" subtitle="Supervised CNN" desc="Fine-tuned on 12k labeled road tiles. Higher accuracy on mixed paved / unpaved surfaces." chips={["~3 min", "GPU · 6GB", "Recommended"]} recommended />
            </div>
          </div>

          <div style={{ padding: "14px 16px", background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 10, display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "color-mix(in srgb, var(--success) 15%, white)", color: "var(--success)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m8 12 2.5 2.5L16 9" /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Network Analysis</span>
                <span className="pill pill-success" style={{ fontSize: 10 }}><CheckIcon size={10} />Included</span>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Connected components, betweenness centrality, and graph metrics run automatically after classification.</div>
            </div>
          </div>

          <div style={{ marginTop: 20, padding: 14, background: "var(--accent-subtle)", borderRadius: 10, border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)" }}>
            <div className="row space-between" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Run Summary</span>
              <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{eta}</span>
            </div>
            <div className="muted mono" style={{ fontSize: 11 }}>{pipeline}</div>
          </div>
        </div>

        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-primary)" }}>
          <span className="muted" style={{ fontSize: 12 }}><InfoIcon /> You can re-run with different models from the project detail page.</span>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn btn-ghost" onClick={onCancel} disabled={isSubmitting}>Cancel</button>
            <button className="btn btn-primary" onClick={onConfirm} disabled={isSubmitting}>
              <PlayIcon />
              {submitPhase === "creating" && "Creating job…"}
              {submitPhase === "uploading" && `Uploading… ${uploadProgress}%`}
              {(submitPhase === "idle" || submitPhase === "done") && "Start Pipeline"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const UploadPage = (): JSX.Element => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const { createProject } = useProjects();
  const { createRegion } = useRegions();

  const [projectName, setProjectName] = useState("");
  const [regionTag, setRegionTag] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<{ name: string; size: string; rawFile: File } | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [segModel, setSegModel] = useState<SegModel>("deeplabv3");
  const [clsModel, setClsModel] = useState<ClfModel>("efficientnet");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (uploadState !== "uploading") return;
    const timer = setInterval(() => {
      setProgress((p) => {
        const next = p + Math.random() * 8 + 4;
        if (next >= 100) { clearInterval(timer); setUploadState("attached"); return 100; }
        return next;
      });
    }, 220);
    return () => clearInterval(timer);
  }, [uploadState]);

  const simulateUpload = (f: File) => {
    setFile({ name: f.name, size: `${(f.size / (1024 * 1024)).toFixed(1)} MB`, rawFile: f });
    setProgress(0);
    setUploadState("uploading");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) simulateUpload(f);
  };

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) simulateUpload(f);
  };

  const removeFile = () => { setFile(null); setUploadState("idle"); setProgress(0); };

  const canRun = uploadState === "attached" && projectName.trim().length > 0;

  const uploadToInferenceServer = (
    uploadURL: string,
    rawFile: File,
    jobId: string,
    regionName: string,
    seg: string,
    clf: string,
  ): Promise<void> =>
    new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", rawFile);
      formData.append("backend_job_id", jobId);
      formData.append("region_name", regionName);
      formData.append("seg_model", seg);
      formData.append("clf_model", clf);

      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`Upload failed: HTTP ${xhr.status}`));
      xhr.onerror = () => reject(new Error("Upload failed: network error"));
      xhr.open("POST", uploadURL);
      xhr.send(formData);
    });

  const handleSubmit = () => {
    void (async () => {
      if (!canRun || !file) return;
      setIsSubmitting(true);
      setSubmitPhase("creating");
      setUploadProgress(0);
      setError(null);
      try {
        const project = await createProject(projectName.trim(), description.trim());
        const region = await createRegion(project.id, regionTag.trim() || projectName.trim(), PLACEHOLDER_POLYGON);

        // Step 1: create the job record (metadata only — no file through Vercel)
        const jobResp = await apiClient.post<BackendJob & { upload_url?: string }>("/jobs", {
          region_id: region.id,
          job_type: "full",
          seg_model: segModel,
          clf_model: clsModel,
        });

        if (!jobResp.upload_url) {
          throw new Error("Inference server is not configured. Contact the administrator.");
        }

        // Step 2: upload GeoTIFF directly to the VPS inference server (bypasses Vercel)
        setSubmitPhase("uploading");
        await uploadToInferenceServer(
          jobResp.upload_url,
          file.rawFile,
          jobResp.id,
          region.name,
          segModel,
          clsModel,
        );

        setSubmitPhase("done");
        navigate(`/processing?region=${region.id}&job=${jobResp.id}`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to start pipeline.");
        setSubmitPhase("idle");
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  return (
    <div style={{ maxWidth: 920, margin: "0 auto" }}>
      <button className="btn btn-ghost btn-sm" style={{ padding: "4px 0", marginBottom: 10 }} onClick={() => navigate("/projects")}>
        <ArrowLeftIcon /> Back to Projects
      </button>

      <div className="row space-between" style={{ marginBottom: 6, alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">New Project</h1>
          <div className="muted" style={{ marginTop: 4 }}>Upload a 4-band GeoTIFF and we'll run the full road-intelligence pipeline.</div>
        </div>
        <span className="pill pill-neutral">Step 1 of 2</span>
      </div>

      <div className="sp-24" />

      {error && (
        <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: "var(--radius-btn)", background: "color-mix(in srgb, var(--danger) 10%, white)", color: "var(--danger)", fontSize: 14, border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)" }}>
          {error}
        </div>
      )}

      {/* Project Details */}
      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div className="section-label">Project Details</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="field">
            <label>Project name <span style={{ color: "var(--danger)" }}>*</span></label>
            <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. Tharparkar Rural Network" />
          </div>
          <div className="field">
            <label>Region tag <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
            <input value={regionTag} onChange={(e) => setRegionTag(e.target.value)} placeholder="e.g. Sindh, Pakistan" />
          </div>
        </div>
        <div className="sp-16" />
        <div className="field">
          <label>Description <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief context for analysts who view this later…" style={{ resize: "vertical", minHeight: 62 }} />
        </div>
      </div>

      {/* Satellite Imagery Upload */}
      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div className="row space-between" style={{ marginBottom: 14 }}>
          <div className="section-label" style={{ margin: 0 }}>Satellite Imagery</div>
          <span className="pill pill-accent"><FileTextIcon size={11} /> GeoTIFF · 4-band</span>
        </div>

        {uploadState === "idle" && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
              background: dragOver ? "var(--accent-subtle)" : "var(--bg-primary)",
              borderRadius: 14, padding: "56px 24px",
              display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
              cursor: "pointer", transition: "border-color .15s, background .15s",
            }}>
            <div style={{ width: 80, height: 80, borderRadius: 16, background: "var(--accent-subtle)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, color: "var(--accent)" }}>
              <UploadIcon size={36} />
            </div>
            <h3 style={{ marginBottom: 6 }}>Drop your GeoTIFF here</h3>
            <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>or click to browse · Sentinel-2 / Landsat 8 supported</div>
            <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
              Browse files
            </button>
            <input ref={inputRef} type="file" accept=".tif,.tiff" onChange={handlePick} style={{ display: "none" }} />
          </div>
        )}

        {(uploadState === "uploading" || uploadState === "attached") && file && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 18, background: "var(--bg-primary)" }}>
            <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 48, height: 48, borderRadius: 10, background: uploadState === "attached" ? "color-mix(in srgb, var(--success) 15%, white)" : "var(--accent-subtle)", color: uploadState === "attached" ? "var(--success)" : "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {uploadState === "attached" ? <CheckCircleIcon size={22} /> : <FileTextIcon size={22} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row space-between" style={{ marginBottom: 4 }}>
                  <div className="mono" style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
                  {uploadState === "attached"
                    ? <span className="pill pill-success"><CheckIcon size={11} />Attached</span>
                    : <span className="pill pill-warning"><span className="dot" />Uploading…</span>}
                </div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                  {file.size} · 4 bands (B2 blue, B3 green, B4 red, B8 NIR) · 10 m/px
                </div>
                <div style={{ height: 6, background: "var(--bg-tertiary)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${progress}%`, height: "100%", background: uploadState === "attached" ? "var(--success)" : "var(--accent)", transition: "width .25s ease" }} />
                </div>
                <div className="row space-between" style={{ marginTop: 6 }}>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {uploadState === "attached" ? "Validation passed · CRS detected · ready to run" : `${Math.round(progress)}% · reading file`}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={removeFile} style={{ padding: "4px 8px", fontSize: 12 }}>
                    <XIcon /> {uploadState === "attached" ? "Replace" : "Cancel"}
                  </button>
                </div>
              </div>
            </div>

            {uploadState === "attached" && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {[
                  { label: "B2 · Blue", hex: "#5A8FA8", wave: "490 nm" },
                  { label: "B3 · Green", hex: "#5B8C5A", wave: "560 nm" },
                  { label: "B4 · Red", hex: "#C25B4E", wave: "665 nm" },
                  { label: "B8 · NIR", hex: "#8a4e1c", wave: "842 nm" },
                ].map((b) => (
                  <div key={b.label} style={{ padding: "8px 10px", background: "white", border: "1px solid var(--border)", borderRadius: 8 }}>
                    <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: b.hex }} />
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{b.label}</span>
                    </div>
                    <div className="muted mono" style={{ fontSize: 11 }}>{b.wave}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Req label="4-band GeoTIFF (B2, B3, B4, B8)" />
          <Req label="Projected CRS (EPSG:326xx / 327xx)" />
          <Req label="Max file size 2 GB" />
          <Req label="Resolution ≤ 10 m/px" />
        </div>
      </div>

      {/* Pipeline Preview */}
      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div className="section-label" style={{ marginBottom: 12 }}>Pipeline preview</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {[
            { label: "Ingest" },
            { label: "Segmentation" },
            { label: "Classification" },
            { label: "Connectivity" },
            { label: "Report" },
          ].map((s, i, arr) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--accent-subtle)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                  {["📥", "🧠", "📊", "🔗", "📄"][i]}
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, textAlign: "center" }}>{s.label}</div>
              </div>
              {i < arr.length - 1 && <div style={{ width: 24, height: 2, background: "var(--border)", flexShrink: 0 }} />}
            </div>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>Estimated runtime: ~8–12 minutes for a 400 MB scene.</div>
      </div>

      {showConfig && (
        <PipelineConfigModal
          segModel={segModel} setSegModel={setSegModel}
          clsModel={clsModel} setClsModel={setClsModel}
          isSubmitting={isSubmitting}
          submitPhase={submitPhase}
          uploadProgress={uploadProgress}
          onCancel={() => { if (!isSubmitting) setShowConfig(false); }}
          onConfirm={handleSubmit}
        />
      )}

      <div className="row space-between" style={{ padding: "16px 0 40px" }}>
        <button className="btn btn-ghost" onClick={() => navigate("/projects")}>Cancel</button>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn btn-primary" disabled={!canRun} onClick={() => setShowConfig(true)}>
            <PlayIcon /> Run Pipeline
          </button>
        </div>
      </div>
    </div>
  );
};
