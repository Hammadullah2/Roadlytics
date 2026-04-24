"use client";

import { useState, type FormEvent } from "react";

import { createAssessment } from "@/lib/api";

interface Props {
  onCreated?: (jobId: string) => void;
}

export function NewAssessmentForm({ onCreated }: Props) {
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [segmenter, setSegmenter] = useState<"DeepLabV3" | "PakOSM">("DeepLabV3");
  const [classifier, setClassifier] = useState<"KMeans" | "EfficientNet">("KMeans");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a Sentinel-2 GeoTIFF before starting the assessment.");
      return;
    }
    if (!projectName.trim()) {
      setError("Project name is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const job = await createAssessment({
        projectName,
        description,
        file,
        segmenter,
        classifier,
      });
      setSuccess("Assessment queued successfully.");
      onCreated?.(job.id);
      setProjectName("");
      setDescription("");
      setFile(null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The upload or job creation request failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="card field-grid" onSubmit={handleSubmit}>
      <div>
        <span className="eyebrow">New Assessment</span>
        <h2 style={{ margin: "8px 0 10px", fontFamily: "var(--font-serif)" }}>
          Upload a Sentinel-2 scene
        </h2>
        <p className="helper">
          Roadlytics expects a 4-band Sentinel-2 L2 GeoTIFF in B2, B3, B4, B8 order. The
          selected segmentation and condition models will run automatically after upload.
        </p>
      </div>

      <div className="field-row">
        <label htmlFor="project-name">Project Name</label>
        <input
          id="project-name"
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          placeholder="Karachi peri-urban sample"
        />
      </div>

      <div className="field-row">
        <label htmlFor="project-description">Description</label>
        <textarea
          id="project-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Describe the AOI, objective, or expected road condition focus."
        />
      </div>

      <div className="grid grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="field-row">
          <label htmlFor="segmenter">Segmentation Model</label>
          <select
            id="segmenter"
            value={segmenter}
            onChange={(event) => setSegmenter(event.target.value as "DeepLabV3" | "PakOSM")}
          >
            <option value="DeepLabV3">DeepLabV3</option>
            <option value="PakOSM">PakOSM</option>
          </select>
        </div>

        <div className="field-row">
          <label htmlFor="classifier">Condition Model</label>
          <select
            id="classifier"
            value={classifier}
            onChange={(event) => setClassifier(event.target.value as "KMeans" | "EfficientNet")}
          >
            <option value="KMeans">KMeans</option>
            <option value="EfficientNet">EfficientNet</option>
          </select>
        </div>
      </div>

      <div className="dropzone">
        <strong>Source GeoTIFF</strong>
        <p className="helper" style={{ marginTop: 0 }}>
          TIFF or GeoTIFF files only. The upload is stored directly in Azure Blob when
          configured, or proxied through the backend during local development.
        </p>
        <input
          type="file"
          accept=".tif,.tiff"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <div className="footer-note">{file ? `Selected: ${file.name}` : "No file selected yet."}</div>
      </div>

      {error ? <div className="error-text">{error}</div> : null}
      {success ? <div className="success-text">{success}</div> : null}

      <div className="button-row">
        <button className="button primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Starting Assessment..." : "Create Assessment"}
        </button>
      </div>
    </form>
  );
}
