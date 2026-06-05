# RAG Assistant Context

Roadlytics includes a grounded assistant for explaining jobs, map layers, reports, failures, and project-wide context.

## Where It Lives

- Backend service: `backend/app/services/assistant.py`
- Backend route: `backend/app/api/routes/assistant.py`
- Frontend drawer: `frontend/components/assistant-drawer.tsx`
- Setup docs: `docs/assistant-rag.md`

## Capabilities

The assistant can:

- Summarize an assessment.
- Explain visible map layers.
- Explain combined/good/unpaved/damaged masks.
- Interpret connectivity analytics and critical junctions.
- Help diagnose failed uploads or jobs.
- Draft report summaries and limitations.
- Compare jobs when a comparison job id is provided.
- Answer project-library questions from recent job metadata.
- Help write report paragraphs and presentation talking points while staying grounded in job evidence.

## Retrieval Sources

The assistant retrieves from:

- Static method notes and layer glossary.
- Upload validation notes.
- Guardrail notes.
- Job metadata.
- Job events.
- Artifact manifests.
- Analytics snapshots.
- Generated report text.
- Visible map layers and viewport bounds passed by the frontend.

## RAG Implementation

- ChromaDB is used as the vector store.
- The app uses a deterministic local hash embedding function to avoid downloading embedding models on the VM.
- Gemini generation is used if `ROADLYTICS_ASSISTANT_PROVIDER=gemini` and `GEMINI_API_KEY` are configured.
- Groq, OpenRouter, or another OpenAI-compatible chat API can be used with `ROADLYTICS_ASSISTANT_PROVIDER=openai_compatible`.
- Without a working provider, the assistant returns local extractive fallback answers from retrieved evidence.

The assistant is intentionally scoped to Roadlytics evidence. It should answer from method notes, layer glossary, job metadata, events, artifact manifests, analytics snapshots, and generated report text. If evidence is missing, it should say what is missing rather than inventing results.

## Guardrails

The assistant should not claim:

- Field-confirmed ground truth.
- Exact repair cost.
- Guaranteed road safety.
- Legal compliance.
- Emergency routing reliability.

It should phrase outputs as being based on uploaded imagery and Roadlytics model results, with field inspection required before operational decisions.

## Testing

Use `docs/handoff/rag-testing-suite.md` for manual UI/API testing. That suite includes:

- normal project understanding prompts
- map-layer prompts
- connectivity analytics prompts
- final-report writing prompts
- upload/failure debugging prompts
- malicious prompts for guardrail checks

Key malicious prompts try to force exact repair costs, legal certification, guaranteed road safety, emergency routing, fabricated accuracy, secret disclosure, or report tampering. Passing behavior means the assistant refuses or corrects these requests and stays grounded.

## Key Environment Variables

```bash
ROADLYTICS_ASSISTANT_PROVIDER=openai_compatible
ROADLYTICS_ASSISTANT_API_KEY=
ROADLYTICS_ASSISTANT_BASE_URL=https://api.groq.com/openai/v1
GEMINI_API_KEY=
ROADLYTICS_ASSISTANT_MODEL=llama-3.3-70b-versatile
ROADLYTICS_ASSISTANT_CHROMA_PATH=/app/backend/data/chroma
ROADLYTICS_ASSISTANT_MAX_CONTEXT_CHARS=18000
```

For OpenRouter free models, use:

```bash
ROADLYTICS_ASSISTANT_BASE_URL=https://openrouter.ai/api/v1
ROADLYTICS_ASSISTANT_MODEL=meta-llama/llama-3.2-3b-instruct:free
```
