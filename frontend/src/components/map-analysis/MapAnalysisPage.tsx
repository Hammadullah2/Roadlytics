import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { AssessmentMap } from "@/components/map/AssessmentMap";
import type { ExternalLayerState } from "@/components/map/AssessmentMap";
import { useJobRecords } from "@/hooks/useJobRecords";
import { useJobResults } from "@/hooks/useJobResults";
import { useRegions } from "@/hooks/useRegions";

function DownloadIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
}
function FileTextIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
}
function ArrowLeftIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>;
}
function CheckIcon({ size = 11 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;
}
function InfoIcon({ size = 11 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>;
}

const formatDateTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return <button className={`toggle ${on ? "on" : ""}`} onClick={onClick} type="button" />;
}

function LayerRow({ label, sub, active, onToggle, opacity, setOpacity, dot }: {
  label: string; sub?: string; active: boolean; onToggle: () => void;
  opacity: number; setOpacity: (v: number) => void; dot?: string;
}) {
  return (
    <div style={{ padding: active ? "10px 12px" : "8px 12px", background: active ? "var(--bg-primary)" : "transparent", border: active ? "1px solid var(--border)" : "1px solid transparent", borderRadius: 10, transition: "background .15s" }}>
      <div className="row space-between">
        <div className="row" style={{ gap: 10, flex: 1, minWidth: 0 }}>
          {dot && <span style={{ width: 10, height: 10, borderRadius: 3, background: dot, flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
            {sub && <div className="muted" style={{ fontSize: 11, marginTop: 1 }}>{sub}</div>}
          </div>
        </div>
        <Toggle on={active} onClick={onToggle} />
      </div>
      {active && (
        <div className="row" style={{ gap: 8, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
          <span style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Opacity</span>
          <input type="range" min={0} max={100} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(Number(e.target.value) / 100)} style={{ flex: 1, accentColor: "var(--accent)" }} />
          <span className="mono" style={{ fontSize: 11, fontWeight: 600, width: 30, textAlign: "right" }}>{Math.round(opacity * 100)}%</span>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ padding: "10px 12px", background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 8 }}>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

const formatMetricValue = (value: unknown): string => {
  if (typeof value === "number") return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && value.trim() !== "") return value;
  return JSON.stringify(value);
};

export const MapAnalysisPage = (): JSX.Element => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedJobID = searchParams.get("job") ?? "";

  const { regions, isLoading: isRegionsLoading } = useRegions();
  const { records: jobRecords } = useJobRecords();

  const [layers, setLayers] = useState({
    osm: true,
    segmentation: true,
    combined: true,
    good: false,
    damaged: false,
    unpaved: false,
    connectivity: false,
  });
  const [opacities, setOpacities] = useState({
    segmentation: 0.7,
    combined: 0.75,
    good: 0.85,
    damaged: 0.85,
    unpaved: 0.85,
    connectivity: 0.75,
  });
  const [showNetwork, setShowNetwork] = useState(true);

  const toggle = (k: keyof typeof layers) => setLayers((l) => ({ ...l, [k]: !l[k] }));
  const setOp = (k: keyof typeof opacities) => (v: number) => setOpacities((o) => ({ ...o, [k]: v }));

  const selectableJobRecords = useMemo(() => {
    const completed = jobRecords.filter((r) => r.job.status === "completed");
    return completed.length > 0 ? completed : jobRecords;
  }, [jobRecords]);

  const selectedRecord = useMemo(() => {
    if (requestedJobID) {
      const found = selectableJobRecords.find((r) => r.job.id === requestedJobID);
      if (found) return found;
    }
    return selectableJobRecords[0] ?? null;
  }, [requestedJobID, selectableJobRecords]);

  const { results, isLoading: isResultsLoading } = useJobResults(selectedRecord?.job.id ?? "");
  const downloads = selectedRecord?.job.result_refs?.downloads;

  const connectivityMetrics = useMemo(() => {
    if (!isRecord(results?.connectivity?.metrics)) return [];
    return Object.entries(results.connectivity.metrics).slice(0, 8);
  }, [results]);

  const externalLayers: ExternalLayerState = {
    showSatellite: !layers.osm,
    showSegMask: layers.segmentation,
    showCombined: layers.combined,
    showGood: layers.good,
    showDamaged: layers.damaged,
    showUnpaved: layers.unpaved,
    showConnMap: layers.connectivity,
    segMaskOpacity: opacities.segmentation,
    combinedOpacity: opacities.combined,
    goodOpacity: opacities.good,
    damagedOpacity: opacities.damaged,
    unpavedOpacity: opacities.unpaved,
    connMapOpacity: opacities.connectivity,
  };

  const activeLayers = [
    layers.segmentation && "Segmentation mask",
    layers.combined && "Combined classification",
    layers.good && '"Good" roads',
    layers.damaged && '"Damaged" roads',
    layers.unpaved && '"Unpaved" roads',
    layers.connectivity && "Connectivity map",
  ].filter(Boolean) as string[];

  return (
    <div style={{ margin: "-28px -32px", height: "calc(100vh - 56px)", position: "relative", overflow: "hidden" }}>
      {isRegionsLoading ? (
        <div style={{ position: "absolute", inset: 0, background: "var(--bg-secondary)" }} />
      ) : (
        <AssessmentMap
          regions={regions}
          guestMode={false}
          selectedRegionId={selectedRecord?.region.id ?? ""}
          results={results}
          downloads={downloads}
          isFullscreen
          externalLayers={externalLayers}
        />
      )}

      {/* Header bar */}
      <div style={{ position: "absolute", top: 20, left: 20, right: 360, zIndex: 10, display: "flex", gap: 12, alignItems: "flex-start" }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate("/projects")} style={{ background: "white", border: "1px solid var(--border)", boxShadow: "var(--shadow-soft)", whiteSpace: "nowrap" }}>
          <ArrowLeftIcon /> Projects
        </button>
        {selectedRecord && (
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-soft)", padding: "8px 14px", flex: 1, maxWidth: 560 }}>
            <div className="row space-between">
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{selectedRecord.project.name} · {selectedRecord.region.name}</div>
                <div className="muted mono" style={{ fontSize: 11, marginTop: 2 }}>
                  Job {selectedRecord.job.id.slice(0, 8).toUpperCase()} · {formatDateTime(selectedRecord.job.created_at)}
                </div>
              </div>
              {selectedRecord.job.status === "completed"
                ? <span className="pill pill-success"><CheckIcon size={11} />Pipeline complete</span>
                : <span className="pill pill-warning"><span className="dot" />{selectedRecord.job.status}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Floating right panel */}
      <div style={{ position: "absolute", top: 20, right: 20, bottom: 20, width: 320, zIndex: 10, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-elev)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <div className="row space-between" style={{ marginBottom: 10 }}>
            <div className="map-panel-title" style={{ padding: 0 }}>Base Map</div>
            <span className="pill pill-neutral" style={{ fontSize: 10 }}>Default</span>
          </div>
          <div className="row space-between">
            <div style={{ fontSize: 13 }}>OpenStreetMap</div>
            <Toggle on={layers.osm} onClick={() => toggle("osm")} />
          </div>
        </div>

        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <div className="row space-between" style={{ marginBottom: 6 }}>
            <div className="map-panel-title" style={{ padding: 0 }}>AI Outputs</div>
            <span style={{ fontSize: 10, color: "var(--text-secondary)", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>Raster · 10 m/px</span>
          </div>
          <div className="muted" style={{ fontSize: 11, marginBottom: 12, fontStyle: "italic", display: "flex", gap: 6 }}>
            <InfoIcon size={11} /> Pixel-level masks — not vector lines
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <LayerRow label="Segmentation Mask" sub="Binary road pixels" active={layers.segmentation} onToggle={() => toggle("segmentation")} opacity={opacities.segmentation} setOpacity={setOp("segmentation")} dot="#38bdf8" />
            <LayerRow label="Combined Classification" sub="All 3 classes in one mask" active={layers.combined} onToggle={() => toggle("combined")} opacity={opacities.combined} setOpacity={setOp("combined")} dot="#B8763E" />
            <LayerRow label={'"Good" Roads'} sub="Paved, well-maintained" active={layers.good} onToggle={() => toggle("good")} opacity={opacities.good} setOpacity={setOp("good")} dot="var(--success)" />
            <LayerRow label={'"Damaged" Roads'} sub="Needs repair" active={layers.damaged} onToggle={() => toggle("damaged")} opacity={opacities.damaged} setOpacity={setOp("damaged")} dot="var(--danger)" />
            <LayerRow label={'"Unpaved" Roads'} sub="Dirt / gravel tracks" active={layers.unpaved} onToggle={() => toggle("unpaved")} opacity={opacities.unpaved} setOpacity={setOp("unpaved")} dot="var(--warning)" />
            <LayerRow label="Connectivity Map" sub="Connected components" active={layers.connectivity} onToggle={() => toggle("connectivity")} opacity={opacities.connectivity} setOpacity={setOp("connectivity")} dot="#9170B4" />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
          <div className="row space-between" style={{ marginBottom: 10 }}>
            <div>
              <div className="map-panel-title" style={{ padding: 0 }}>Network Analysis</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>Stage 5 · graph metrics</div>
            </div>
            <Toggle on={showNetwork} onClick={() => setShowNetwork((s) => !s)} />
          </div>

          {isResultsLoading && (
            <div style={{ height: 80, borderRadius: "var(--radius-btn)", background: "var(--bg-secondary)" }} />
          )}

          {!isResultsLoading && !selectedRecord && (
            <div className="muted" style={{ fontSize: 12, fontStyle: "italic" }}>No completed job selected.</div>
          )}

          {!isResultsLoading && selectedRecord && showNetwork && connectivityMetrics.length === 0 && (
            <div className="muted" style={{ fontSize: 12, fontStyle: "italic" }}>Network metrics not available for this job.</div>
          )}

          {!isResultsLoading && showNetwork && connectivityMetrics.length > 0 && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                {connectivityMetrics.slice(0, 4).map(([key, val]) => (
                  <MetricCard key={key} label={key.replace(/_/g, " ")} value={formatMetricValue(val)} />
                ))}
              </div>

              {connectivityMetrics.length > 4 && (
                <>
                  <div className="section-label" style={{ fontSize: 11, marginBottom: 8 }}>Additional Metrics</div>
                  <div className="stack" style={{ gap: 4, marginBottom: 12 }}>
                    {connectivityMetrics.slice(4).map(([key, val]) => (
                      <div key={key} className="row space-between" style={{ fontSize: 12 }}>
                        <span className="muted" style={{ textTransform: "capitalize" }}>{key.replace(/_/g, " ")}</span>
                        <span className="mono" style={{ fontWeight: 600, fontSize: 11 }}>{formatMetricValue(val)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {selectableJobRecords.length > 1 && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <div className="section-label" style={{ fontSize: 11, marginBottom: 8 }}>Switch Job</div>
              <select value={selectedRecord?.job.id ?? ""} onChange={(e) => navigate(`/map-analysis?job=${e.target.value}`)} style={{ width: "100%", fontSize: 12 }}>
                {selectableJobRecords.map((rec) => (
                  <option key={rec.job.id} value={rec.job.id}>
                    {rec.project.name} · {formatDateTime(rec.job.created_at)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div style={{ padding: 12, borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" style={{ flex: 1 }}><DownloadIcon />GeoTIFF</button>
          <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => navigate("/reports")}>
            <FileTextIcon />Reports
          </button>
        </div>
      </div>

      {activeLayers.length > 0 && (
        <div style={{ position: "absolute", bottom: 20, left: 20, zIndex: 10, background: "white", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-soft)", padding: "12px 14px", minWidth: 200 }}>
          <div className="map-panel-title" style={{ padding: "0 0 8px" }}>Active Layers</div>
          <div className="stack" style={{ gap: 6, fontSize: 12 }}>
            {activeLayers.map((label) => (
              <div key={label} className="row" style={{ gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--accent)", flexShrink: 0 }} />
                {label}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border)", fontSize: 10, color: "var(--text-secondary)", fontFamily: "monospace" }}>
            © OpenStreetMap · AI outputs by Roadlytics
          </div>
        </div>
      )}
    </div>
  );
};
