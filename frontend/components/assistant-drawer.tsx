"use client";

import { useState, type FormEvent } from "react";

import { chatWithAssistant } from "@/lib/api";
import type { AssistantChatResponse, AssistantMode, JobDetail } from "@/lib/types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  response?: AssistantChatResponse;
}

interface Props {
  job?: JobDetail | null;
  mode: AssistantMode;
  visibleLayers?: string[];
  viewportBounds?: number[] | null;
  title?: string;
}

function defaultPrompts(mode: AssistantMode) {
  if (mode === "reports") {
    return [
      "Write an executive summary.",
      "List the key limitations.",
      "Create technical report bullets.",
    ];
  }
  if (mode === "map") {
    return [
      "Summarize the visible layers.",
      "Explain the combined mask.",
      "What should be inspected first?",
    ];
  }
  return [
    "Summarize this assessment.",
    "Why did this job fail?",
    "Explain Roadlytics outputs.",
  ];
}

export function AssistantDrawer({
  job,
  mode,
  visibleLayers = [],
  viewportBounds,
  title = "Roadlytics Copilot",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed || isSending) {
      return;
    }
    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    setInput("");
    setError(null);
    setIsSending(true);
    try {
      const response = await chatWithAssistant({
        message: trimmed,
        mode,
        job_id: job?.id ?? null,
        visible_layers: visibleLayers,
        viewport_bounds: viewportBounds ?? null,
      });
      setMessages((current) => [
        ...current,
        { role: "assistant", content: response.answer, response },
      ]);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Assistant request failed.");
    } finally {
      setIsSending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  const prompts = defaultPrompts(mode);

  return (
    <>
      <button className="assistant-launcher" type="button" onClick={() => setIsOpen(true)}>
        AI
      </button>

      {isOpen ? (
        <div className="assistant-overlay" role="dialog" aria-modal="true">
          <aside className="assistant-drawer">
            <div className="assistant-header">
              <div>
                <span className="eyebrow">Assistant</span>
                <h2>{title}</h2>
                {job ? <p>{job.project_name}</p> : <p>Project-wide Roadlytics context</p>}
              </div>
              <button className="button ghost" type="button" onClick={() => setIsOpen(false)}>
                Close
              </button>
            </div>

            <div className="assistant-prompts">
              {prompts.map((prompt) => (
                <button key={prompt} type="button" onClick={() => void sendMessage(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>

            <div className="assistant-thread">
              {messages.length === 0 ? (
                <div className="assistant-empty">
                  Ask about assessment summaries, map layers, failure reasons, or report wording.
                </div>
              ) : null}

              {messages.map((message, index) => (
                <div className={`assistant-message ${message.role}`} key={`${message.role}-${index}`}>
                  <div className="assistant-bubble">{message.content}</div>
                  {message.response?.citations.length ? (
                    <div className="assistant-citations">
                      {message.response.citations.map((citation, citationIndex) => (
                        <span key={`${citation.source}-${citationIndex}`}>
                          {citation.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {message.response?.limitations.length ? (
                    <div className="footer-note">{message.response.limitations[0]}</div>
                  ) : null}
                </div>
              ))}

              {isSending ? <div className="assistant-empty">Thinking through the evidence...</div> : null}
            </div>

            {error ? <div className="error-text">{error}</div> : null}

            <form className="assistant-input" onSubmit={handleSubmit}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask Roadlytics about this assessment..."
              />
              <button className="button primary" type="submit" disabled={isSending}>
                Send
              </button>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}
