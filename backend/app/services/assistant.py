"""Grounded assistant service for Roadlytics jobs and reports."""

from __future__ import annotations

import hashlib
import html
import json
import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence

try:  # Optional at import time so local development still starts before deps install.
    import chromadb
except ImportError:  # pragma: no cover
    chromadb = None

try:
    from google import genai
except ImportError:  # pragma: no cover
    genai = None

from ..config import Settings
from ..database import Repository
from ..schemas import AssistantChatRequest


STATIC_DOCS: Dict[str, str] = {
    "layer_glossary": """
Roadlytics layer glossary:
- Sentinel RGB: display raster generated from the uploaded Sentinel-2 GeoTIFF.
- Road Segmentation: binary road mask produced by DeepLabV3 or PakOSM.
- Good Roads: condition mask for roads classified as good, displayed in green.
- Unpaved Roads: condition mask for unpaved roads, displayed in red.
- Damaged Roads: condition mask for damaged roads, displayed in yellow.
- Combined Condition Mask: single raster containing all three road-condition classes.
- Connected Components: raster-first connectivity grouping of the road network.
- Betweenness Criticality: criticality surface highlighting more important network areas.
- Critical Junctions: GeoJSON points representing high-priority connectivity locations.
""",
    "method_notes": """
Roadlytics method notes:
DeepLabV3 performs learned road segmentation from Sentinel-2 imagery. PakOSM rasterizes OSM
road geometries onto the uploaded GeoTIFF grid. KMeans provides unsupervised condition grouping,
while EfficientNet uses a learned classifier for road condition classes. Model outputs are
decision-support signals and require field validation before operational commitments.
""",
    "validation_notes": """
Roadlytics expects a 4-band Sentinel-2 Level-2 GeoTIFF in B2, B3, B4, B8 order. A failed upload
usually means the raster is not a TIFF/GeoTIFF, has the wrong band count, lacks georeferencing,
or is not in the expected band order.
""",
    "guardrail_notes": """
Roadlytics cannot confirm ground truth, exact repair cost, legal compliance, or guaranteed road
safety from model output alone. The assistant must use language such as based on the uploaded
imagery and Roadlytics model outputs, and should recommend field inspection for decisions.
""",
}


@dataclass(frozen=True)
class EvidenceChunk:
    source: str
    label: str
    text: str
    metadata: Dict[str, Any]


def _utcnow() -> str:
    return datetime.now(UTC).isoformat()


def _strip_html(value: str) -> str:
    value = re.sub(r"<script[\s\S]*?</script>", " ", value, flags=re.IGNORECASE)
    value = re.sub(r"<style[\s\S]*?</style>", " ", value, flags=re.IGNORECASE)
    value = re.sub(r"<[^>]+>", " ", value)
    value = html.unescape(value)
    return re.sub(r"\s+", " ", value).strip()


def _json_text(value: Any) -> str:
    return json.dumps(value, indent=2, sort_keys=True, default=str)


def _chunk_text(text: str, *, max_chars: int = 1300) -> List[str]:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if len(cleaned) <= max_chars:
        return [cleaned] if cleaned else []

    chunks: List[str] = []
    start = 0
    while start < len(cleaned):
        end = min(start + max_chars, len(cleaned))
        if end < len(cleaned):
            sentence_end = cleaned.rfind(". ", start, end)
            if sentence_end > start + 400:
                end = sentence_end + 1
        chunks.append(cleaned[start:end].strip())
        start = end
    return [chunk for chunk in chunks if chunk]


class HashEmbeddingFunction:
    """Small deterministic embedding function so Chroma works without model downloads."""

    def __call__(self, input: List[str]) -> List[List[float]]:  # Chroma expects this arg name.
        vectors: List[List[float]] = []
        for document in input:
            vector = [0.0] * 256
            tokens = re.findall(r"[a-zA-Z0-9_]+", document.lower())
            for token in tokens:
                digest = hashlib.sha1(token.encode("utf-8")).digest()
                index = int.from_bytes(digest[:2], "big") % len(vector)
                sign = 1.0 if digest[2] % 2 == 0 else -1.0
                vector[index] += sign
            magnitude = sum(value * value for value in vector) ** 0.5
            vectors.append([value / magnitude for value in vector] if magnitude else vector)
        return vectors


class AssistantRetriever:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._collection = None
        if chromadb is not None:
            try:
                client = chromadb.PersistentClient(path=str(settings.assistant_chroma_path))
                self._collection = client.get_or_create_collection(
                    "roadlytics_assistant",
                    embedding_function=HashEmbeddingFunction(),
                )
            except Exception:
                self._collection = None

    @staticmethod
    def _id_for(chunk: EvidenceChunk) -> str:
        digest = hashlib.sha1(
            f"{chunk.source}:{chunk.label}:{chunk.text}".encode("utf-8")
        ).hexdigest()
        return digest

    def upsert(self, chunks: Sequence[EvidenceChunk]) -> None:
        if not chunks or self._collection is None:
            return
        self._collection.upsert(
            ids=[self._id_for(chunk) for chunk in chunks],
            documents=[chunk.text for chunk in chunks],
            metadatas=[
                {
                    "source": chunk.source,
                    "label": chunk.label,
                    **{key: str(value) for key, value in chunk.metadata.items()},
                }
                for chunk in chunks
            ],
        )

    def search(self, query: str, chunks: Sequence[EvidenceChunk], limit: int = 6) -> List[EvidenceChunk]:
        self.upsert(chunks)
        if self._collection is not None:
            try:
                result = self._collection.query(query_texts=[query], n_results=limit)
                documents = result.get("documents", [[]])[0]
                metadatas = result.get("metadatas", [[]])[0]
                retrieved: List[EvidenceChunk] = []
                for document, metadata in zip(documents, metadatas):
                    retrieved.append(
                        EvidenceChunk(
                            source=str(metadata.get("source", "retrieval")),
                            label=str(metadata.get("label", "Retrieved Evidence")),
                            text=document,
                            metadata=dict(metadata),
                        )
                    )
                if retrieved:
                    return retrieved
            except Exception:
                pass

        tokens = {token.lower() for token in re.findall(r"[a-zA-Z0-9_]+", query)}
        scored = []
        for chunk in chunks:
            haystack = chunk.text.lower()
            score = sum(1 for token in tokens if token in haystack)
            if score:
                scored.append((score, chunk))
        scored.sort(key=lambda item: item[0], reverse=True)
        return [chunk for _, chunk in scored[:limit]] or list(chunks[:limit])


class GeminiClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    @property
    def available(self) -> bool:
        return bool(self.settings.gemini_api_key) and genai is not None

    def generate(self, prompt: str) -> str:
        if not self.settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured.")
        if genai is None:
            raise RuntimeError("google-genai is not installed in the backend container.")

        client = genai.Client(api_key=self.settings.gemini_api_key)
        response = client.models.generate_content(
            model=self.settings.assistant_model,
            contents=prompt,
        )
        text = getattr(response, "text", None)
        if not text:
            raise RuntimeError("Gemini returned an empty response.")
        return text.strip()


class AssistantService:
    def __init__(self, settings: Settings, repository: Repository) -> None:
        self.settings = settings
        self.repository = repository
        self.retriever = AssistantRetriever(settings)
        self.llm = GeminiClient(settings)

    def suggestions(self, mode: str | None = None) -> List[str]:
        if mode == "reports":
            return [
                "Write an executive summary for this assessment.",
                "List the key limitations in stakeholder language.",
                "Create technical report bullets from this job.",
                "Compare this assessment with another completed job.",
            ]
        if mode == "map":
            return [
                "Summarize the visible layers.",
                "Explain the combined condition mask.",
                "What should be inspected first?",
                "Why are critical junctions important?",
            ]
        return [
            "Summarize this Roadlytics assessment.",
            "Why did this job fail?",
            "Which completed job looks most concerning?",
            "Explain how Roadlytics classifies road condition.",
        ]

    def chat(self, request: AssistantChatRequest) -> Dict[str, Any]:
        chunks = self._build_chunks(request)
        retrieved = self.retriever.search(request.message, chunks, limit=8)
        prompt = self._build_prompt(request, retrieved)

        provider = "local-fallback"
        model = "extractive"
        confidence = "medium"
        try:
            if self.llm.available:
                answer = self.llm.generate(prompt)
                provider = "gemini"
                model = self.settings.assistant_model
            else:
                answer = self._fallback_answer(request, retrieved)
                confidence = "low"
        except Exception as exc:
            answer = (
                "I could not reach the configured LLM, so I am answering from the available "
                f"Roadlytics evidence instead. Configuration detail: {exc}\n\n"
                + self._fallback_answer(request, retrieved)
            )
            confidence = "low"

        answer = self._append_required_caveat(answer)
        return {
            "message_id": str(uuid.uuid4()),
            "answer": answer,
            "citations": [
                {
                    "label": chunk.label,
                    "source": chunk.source,
                    "detail": str(chunk.metadata.get("job_id") or chunk.metadata.get("type") or ""),
                }
                for chunk in retrieved[:5]
            ],
            "suggested_questions": self.suggestions(request.mode)[:3],
            "recommended_actions": self._recommended_actions(request),
            "limitations": [
                "Roadlytics outputs are model-based decision support, not field-confirmed ground truth.",
                "Use field inspection before repair budgeting, safety decisions, or operational routing.",
            ],
            "confidence": confidence,
            "provider": provider,
            "model": model,
            "created_at": _utcnow(),
        }

    def reindex(self) -> Dict[str, Any]:
        request = AssistantChatRequest(message="reindex", mode="project_library")
        chunks = self._build_chunks(request)
        self.retriever.upsert(chunks)
        return {"indexed_chunks": len(chunks)}

    def _build_chunks(self, request: AssistantChatRequest) -> List[EvidenceChunk]:
        chunks: List[EvidenceChunk] = []
        for key, value in STATIC_DOCS.items():
            chunks.extend(
                EvidenceChunk("roadlytics_docs", key.replace("_", " ").title(), part, {"type": key})
                for part in _chunk_text(value)
            )

        if request.mode in {"project_library", "comparison", "knowledge"} and not request.job_id:
            for job in self.repository.list_jobs(limit=25):
                chunks.append(
                    EvidenceChunk(
                        "job_library",
                        f"Job: {job['project_name']}",
                        _json_text(
                            {
                                "id": job["id"],
                                "project_name": job["project_name"],
                                "status": job["status"],
                                "stage": job["stage"],
                                "progress": job["progress"],
                                "segmenter": job["segmenter"],
                                "classifier": job["classifier"],
                                "error_message": job.get("error_message"),
                                "created_at": job["created_at"],
                            }
                        ),
                        {"job_id": job["id"], "type": "job_summary"},
                    )
                )

        for job_id in self._requested_job_ids(request):
            chunks.extend(self._job_chunks(job_id))

        return chunks

    def _requested_job_ids(self, request: AssistantChatRequest) -> List[str]:
        ids = []
        if request.job_id:
            ids.append(request.job_id)
        if request.comparison_job_id and request.comparison_job_id not in ids:
            ids.append(request.comparison_job_id)
        return ids

    def _job_chunks(self, job_id: str) -> List[EvidenceChunk]:
        job = self.repository.get_job(job_id)
        if job is None:
            return [
                EvidenceChunk(
                    "job_lookup",
                    "Missing Job",
                    f"No Roadlytics job exists for id {job_id}.",
                    {"job_id": job_id, "type": "missing_job"},
                )
            ]

        chunks = [
            EvidenceChunk(
                "job_detail",
                f"Job Detail: {job['project_name']}",
                _json_text(job),
                {"job_id": job_id, "type": "job_detail"},
            )
        ]
        events = self.repository.list_events(job_id)
        if events:
            chunks.append(
                EvidenceChunk(
                    "job_events",
                    "Job Events",
                    _json_text(events),
                    {"job_id": job_id, "type": "events"},
                )
            )
        artifacts = self.repository.list_artifacts(job_id)
        if artifacts:
            chunks.append(
                EvidenceChunk(
                    "artifact_manifest",
                    "Artifact Manifest",
                    _json_text(
                        [
                            {
                                "type": artifact["artifact_type"],
                                "label": artifact["label"],
                                "layer_name": artifact.get("layer_name"),
                                "filename": Path(str(artifact["blob_path"])).name,
                                "bounds": artifact.get("bounds"),
                            }
                            for artifact in artifacts
                        ]
                    ),
                    {"job_id": job_id, "type": "artifacts"},
                )
            )
        analytics = self.repository.get_analytics(job_id)
        if analytics:
            chunks.append(
                EvidenceChunk(
                    "analytics_summary",
                    "Analytics Summary",
                    _json_text(analytics),
                    {"job_id": job_id, "type": "analytics"},
                )
            )
        report_text = self._report_text(artifacts)
        if report_text:
            chunks.extend(
                EvidenceChunk(
                    "generated_report",
                    "Generated Report",
                    part,
                    {"job_id": job_id, "type": "report"},
                )
                for part in _chunk_text(report_text)
            )
        return chunks

    @staticmethod
    def _report_text(artifacts: Iterable[Dict[str, Any]]) -> str:
        for artifact in artifacts:
            if artifact["artifact_type"] != "report":
                continue
            local_path = artifact.get("local_path")
            if local_path and Path(local_path).exists():
                return _strip_html(Path(local_path).read_text(encoding="utf-8", errors="ignore"))
        return ""

    def _build_prompt(self, request: AssistantChatRequest, chunks: Sequence[EvidenceChunk]) -> str:
        evidence = "\n\n".join(
            f"[{index + 1}] {chunk.label} ({chunk.source})\n{chunk.text}"
            for index, chunk in enumerate(chunks)
        )
        context = {
            "mode": request.mode,
            "job_id": request.job_id,
            "comparison_job_id": request.comparison_job_id,
            "visible_layers": request.visible_layers,
            "viewport_bounds": request.viewport_bounds,
        }
        return f"""
You are the Roadlytics assistant. Answer only from the evidence below and the Roadlytics
method notes. Be concise, useful, and specific. Do not claim field-confirmed truth. Do not
invent exact repair cost, legal compliance, guaranteed road safety, or emergency routing
reliability. If evidence is missing, say what is missing.

Context:
{_json_text(context)}

User question:
{request.message}

Evidence:
{evidence[: self.settings.assistant_max_context_chars]}

Return a helpful answer with a short caveat when making analytical claims.
""".strip()

    @staticmethod
    def _fallback_answer(request: AssistantChatRequest, chunks: Sequence[EvidenceChunk]) -> str:
        if not chunks:
            return "I do not have enough Roadlytics evidence to answer that yet."
        evidence_lines = "\n".join(f"- {chunk.label}: {chunk.text[:420]}" for chunk in chunks[:4])
        return (
            "Here is what I can tell from the available Roadlytics evidence:\n"
            f"{evidence_lines}\n\n"
            "For stronger natural-language reasoning, configure GEMINI_API_KEY on the backend."
        )

    @staticmethod
    def _append_required_caveat(answer: str) -> str:
        caveat = (
            "Based on the uploaded imagery and Roadlytics model outputs; field inspection is "
            "required before operational decisions."
        )
        if "field inspection" in answer.lower():
            return answer
        return f"{answer}\n\n{caveat}"

    @staticmethod
    def _recommended_actions(request: AssistantChatRequest) -> List[str]:
        if request.mode == "failure_help":
            return [
                "Check that the upload is a 4-band GeoTIFF in B2, B3, B4, B8 order.",
                "Review the job event timeline and backend logs for the first failure message.",
            ]
        if request.mode in {"map", "reports", "current_job"}:
            return [
                "Review the combined condition layer before inspecting individual masks.",
                "Use critical junctions and damaged road layers to prioritize field checks.",
            ]
        return ["Open a completed assessment for the most grounded assistant responses."]
