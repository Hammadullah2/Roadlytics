# Roadlytics Handoff

This folder is the quick context bundle for continuing Roadlytics from another Codex account or developer machine.

## Recommended Reading Order

1. `project-context.md` - what Roadlytics does and the user workflow.
2. `current-architecture.md` - how the current app is structured.
3. `rag-assistant.md` - what the RAG assistant does and how it is configured.
4. `modal-migration.md` - how inference is being moved to Modal GPU functions.
5. `current-state-next-steps.md` - branches, current state, manual setup, and next actions.

## What To Ignore

The older Azure VM click-by-click deployment guidance is intentionally not repeated here. Azure Blob still matters because it remains the object store, but inference hosting is moving to Modal.

## Current Working Assumption

The repo of record is:

```text
https://github.com/Hammadullah2/Roadlytics
```

The local project folder used during development was:

```text
C:\Users\hammad\Roadlytics
```
