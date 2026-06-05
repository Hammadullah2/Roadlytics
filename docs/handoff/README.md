# Roadlytics Handoff

This folder is the quick context bundle for continuing Roadlytics from another assistant, another Codex account, or a developer machine. It is also suitable as the source context for generating the final FYP report.

## Recommended Reading Order

1. `final-report-context.md` - full narrative history, major changes, current results, and final-report framing.
2. `project-context.md` - what Roadlytics does, user workflow, domain rules, and analytics definitions.
3. `current-architecture.md` - how the current deployed app is structured.
4. `modal-migration.md` - Modal GPU inference split and deployment status.
5. `rag-assistant.md` - what the RAG assistant does and how it is configured.
6. `rag-testing-suite.md` - manual prompt suite and malicious guardrail checks.
7. `current-state-next-steps.md` - branch, live state, completed jobs, and next actions.

## What To Ignore

The older Azure VM click-by-click deployment guidance is intentionally not repeated here. Azure Blob still matters because it remains the object store, and Modal is now the active inference host.

## Current Working Assumption

The repo of record is:

```text
https://github.com/Hammadullah2/Roadlytics
```

The local project folder used during development was:

```text
C:\Users\hammad\Roadlytics
```

## Current Report Anchor

For report generation, anchor current results around completed job:

```text
67336c53-0a5b-4b9c-bd98-36315aaf786d
DeepLabV3 + EfficientNet
13 artifacts
completed on 2026-06-05
```
