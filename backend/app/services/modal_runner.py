"""Modal invocation helpers for remote Roadlytics pipeline execution."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict

from ..config import Settings

try:  # Modal is only required when ROADLYTICS_PROCESSOR=modal.
    import modal
except ImportError:  # pragma: no cover
    modal = None


@dataclass(frozen=True)
class ModalFunctionCall:
    """Tiny protocol-like wrapper around Modal FunctionCall for tests."""

    raw_call: Any

    @property
    def object_id(self) -> str | None:
        return getattr(self.raw_call, "object_id", None)

    def get(self, timeout: float | None = None) -> Dict[str, Any]:
        return self.raw_call.get(timeout=timeout)


class ModalPipelineRunner:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def spawn(self, payload: Dict[str, Any]) -> ModalFunctionCall:
        if modal is None:
            raise RuntimeError(
                "The modal Python package is required when ROADLYTICS_PROCESSOR=modal."
            )
        function = modal.Function.from_name(
            self.settings.modal_app_name,
            self.settings.modal_function_name,
            environment_name=self.settings.modal_environment_name or None,
        )
        return ModalFunctionCall(function.spawn(payload))
