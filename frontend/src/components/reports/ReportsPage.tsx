import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useReportRecords } from "@/hooks/useReportRecords";

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
    </svg>
  );
}

function CheckIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
}

function XIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}

const formatDate = (value: string): string => {
  return new Date(value).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const PAGE_SIZE = 10;

export const ReportsPage = (): JSX.Element => {
  const navigate = useNavigate();
  const { records, isLoading, error } = useReportRecords();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const filtered = records.filter((rec) => {
    const matchSearch = search === "" ||
      rec.project.name.toLowerCase().includes(search.toLowerCase()) ||
      rec.region.name.toLowerCase().includes(search.toLowerCase()) ||
      rec.report.id.toLowerCase().includes(search.toLowerCase());
    // Reports don't have a status field — they are created on completion
    const matchStatus = statusFilter === "all" || statusFilter === "completed" || statusFilter === "ready";
    return matchSearch && matchStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSlice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const statusPill = (status: string): JSX.Element => {
    if (status === "completed" || status === "ready") {
      return <span className="pill pill-success"><CheckIcon />Completed</span>;
    }
    if (status === "generating" || status === "processing" || status === "pending") {
      return <span className="pill pill-warning"><span className="dot" />Generating…</span>;
    }
    return <span className="pill pill-danger"><XIcon />Error</span>;
  };

  const handleSearch = (value: string): void => {
    setSearch(value);
    setPage(1);
  };

  return (
    <div>
      {/* Header */}
      <div className="row space-between" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Reports</h1>
          <div className="muted" style={{ marginTop: 4 }}>Download assessment reports and raw data.</div>
        </div>
      </div>

      {/* Filters */}
      <div className="row" style={{ gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <div className="input-wrap" style={{ flex: 1, maxWidth: 360 }}>
          <SearchIcon />
          <input
            placeholder="Search reports…"
            value={search}
            onChange={(e) => { handleSearch(e.target.value); }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ width: 150 }}
        >
          <option value="all">All statuses</option>
          <option value="completed">Completed</option>
          <option value="ready">Ready</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Table */}
      {error ? (
        <div style={{ padding: "14px 16px", borderRadius: "var(--radius-btn)", background: "color-mix(in srgb, var(--danger) 10%, white)", color: "var(--danger)", fontSize: 14, border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)" }}>
          {error}
        </div>
      ) : isLoading ? (
        <div className="card" style={{ overflow: "hidden" }}>
          {["s1", "s2", "s3", "s4"].map((k) => (
            <div key={k} style={{ height: 52, borderBottom: "1px solid var(--border)", padding: "0 16px", display: "flex", alignItems: "center" }}>
              <div style={{ height: 12, width: "60%", borderRadius: 6, background: "var(--bg-secondary)" }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Report ID</th>
                <th>Region</th>
                <th>Generated</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageSlice.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-secondary)" }}>
                    No reports found.
                  </td>
                </tr>
              ) : (
                pageSlice.map((rec) => (
                  <tr key={rec.report.id}>
                    <td className="mono" style={{ color: "var(--text-secondary)" }}>
                      {rec.report.id.slice(0, 12).toUpperCase()}
                    </td>
                    <td style={{ fontWeight: 500 }}>{rec.project.name} · {rec.region.name}</td>
                    <td className="muted">{formatDate(rec.report.created_at)}</td>
                    <td>{statusPill(rec.report.signed_url ? "completed" : "completed")}</td>
                    <td style={{ textAlign: "right" }}>
                      <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        <button
                          className="btn btn-primary btn-sm"
                          type="button"
                          onClick={() => { navigate(`/reports/${rec.report.id}`); }}
                        >
                          <EyeIcon />View
                        </button>
                        <button className="btn btn-ghost btn-sm" type="button" style={{ padding: "6px 8px" }}>
                          <MoreIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && !error && (
        <div className="row space-between" style={{ marginTop: 16 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            Showing {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} reports
          </div>
          <div className="row" style={{ gap: 4 }}>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              style={{ minWidth: 32, padding: "6px 10px" }}
              onClick={() => { setPage((p) => Math.max(1, p - 1)); }}
              disabled={page === 1}
            >
              ‹
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                className={`btn ${page === p ? "btn-primary" : "btn-ghost"} btn-sm`}
                type="button"
                style={{ minWidth: 32, padding: "6px 10px" }}
                onClick={() => { setPage(p); }}
              >
                {p}
              </button>
            ))}
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              style={{ minWidth: 32, padding: "6px 10px" }}
              onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); }}
              disabled={page === totalPages}
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
