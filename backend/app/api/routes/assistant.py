"""Roadlytics assistant routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from ...schemas import AssistantChatRequest, AssistantChatResponse, AssistantSuggestionResponse

router = APIRouter()


@router.post("/chat", response_model=AssistantChatResponse)
async def chat(request: Request, payload: AssistantChatRequest) -> dict:
    assistant = request.app.state.assistant_service
    try:
        return assistant.chat(payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Job not found.") from exc


@router.get("/suggestions", response_model=AssistantSuggestionResponse)
async def suggestions(request: Request, mode: str | None = None) -> dict:
    assistant = request.app.state.assistant_service
    return {"suggestions": assistant.suggestions(mode)}


@router.post("/reindex")
async def reindex(request: Request) -> dict:
    assistant = request.app.state.assistant_service
    return assistant.reindex()
