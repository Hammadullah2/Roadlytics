# Roadlytics RAG Technical Report

This folder contains the updated Roadlytics technical report with the Retrieval-Augmented Generation (RAG) assistant section added.

## Files

- `roadlytics_models_rag_report.pdf` - compiled IEEE-style PDF report.
- `roadlytics_models_rag_report.tex` - editable LaTeX source for the compiled report.
- `figures/` - image assets used in the report, including K-Means cluster plots, training curves, and confusion matrices.

## What Was Added

The report extends the original model-focused FYP technical write-up with:

- Roadlytics web application architecture.
- FastAPI, Next.js, Docker, Azure VM, Azure Blob, SQLite, and OSM map integration details.
- Detailed RAG assistant architecture.
- ChromaDB retrieval design with deterministic local hash embeddings.
- Gemini generation layer and local fallback behavior.
- Assistant API endpoints, UI drawer integration, citations, and guardrails.
- Limitations around field validation, road safety, legal compliance, and repair-cost claims.

## Build Command

From the repository root, compile with the bundled Tectonic executable or any local LaTeX setup that supports `IEEEtran`:

```powershell
& "C:\Users\hammad\.codex\plugins\cache\openai-bundled\latex-tectonic\0.1.1\bin\tectonic.exe" --outdir docs\report\rag\build docs\report\rag\roadlytics_models_rag_report.tex
```

The already compiled PDF is committed for convenience.
