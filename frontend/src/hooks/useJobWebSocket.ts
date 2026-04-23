import { useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabaseClient";
import type { JobStatus, JobWebSocketMessage, PipelineStage } from "@/types";

type UseJobWebSocketResult = {
  progress: number;
  status: JobStatus;
  stage: PipelineStage;
  isConnected: boolean;
  error: string | null;
};

const MAX_RETRIES = 3;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isJobStatus = (value: unknown): value is JobStatus => {
  return value === "pending" || value === "running" || value === "completed" || value === "failed";
};

const isPipelineStage = (value: unknown): value is PipelineStage => {
  return value === "segmentation" || value === "classification" || value === "connectivity";
};

const clampProgress = (value: number): number => {
  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return value;
};

const deriveStage = (progress: number, status: JobStatus): PipelineStage => {
  if (status === "completed") {
    return "connectivity";
  }

  if (progress >= 66) {
    return "connectivity";
  }

  if (progress >= 33) {
    return "classification";
  }

  return "segmentation";
};

const parsePayloadMessage = (payload: unknown): string | null => {
  if (!isRecord(payload)) {
    return null;
  }

  const message = payload.message;
  if (typeof message === "string" && message.trim() !== "") {
    return message;
  }

  const error = payload.error;
  if (typeof error === "string" && error.trim() !== "") {
    return error;
  }

  return null;
};

const parseWebSocketMessage = (value: unknown): JobWebSocketMessage | null => {
  if (!isRecord(value)) {
    return null;
  }

  const type = value.type;
  const status = value.status;
  const progress = value.progress;
  const stage = value.stage;
  const jobID = value.job_id;

  if (
    (type !== "progress" && type !== "status" && type !== "result" && type !== "error") ||
    !isJobStatus(status) ||
    typeof progress !== "number" ||
    !isPipelineStage(stage) ||
    typeof jobID !== "string"
  ) {
    return null;
  }

  return {
    job_id: jobID,
    type,
    progress: clampProgress(progress),
    status,
    stage,
    payload: value.payload,
  };
};

export const useJobWebSocket = (jobID: string): UseJobWebSocketResult => {
  const [progress, setProgress] = useState<number>(0);
  const [status, setStatus] = useState<JobStatus>("pending");
  const [stage, setStage] = useState<PipelineStage>("segmentation");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const isUnmountedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!jobID) {
      setIsConnected(false);
      setError(null);
      return;
    }

    setProgress(0);
    setStatus("pending");
    setStage("segmentation");
    const webSocketBaseUrl = (import.meta.env.NEXT_PUBLIC_WS_URL ?? "").replace(/\/+$/, "");
    if (!webSocketBaseUrl) {
      setError("NEXT_PUBLIC_WS_URL is required for live job updates.");
      return;
    }

    isUnmountedRef.current = false;
    reconnectAttemptsRef.current = 0;
    setError(null);

    const clearReconnectTimer = (): void => {
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    const connect = async (): Promise<void> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token = session?.access_token;
      if (!token) {
        setError("No active session found for realtime job updates.");
        setIsConnected(false);
        return;
      }

      const nextSocket = new WebSocket(
        `${webSocketBaseUrl}/jobs/${encodeURIComponent(jobID)}?token=${encodeURIComponent(token)}`,
      );
      socketRef.current = nextSocket;

      nextSocket.onopen = () => {
        if (isUnmountedRef.current) {
          return;
        }

        reconnectAttemptsRef.current = 0;
        setIsConnected(true);
        setError(null);
      };

      nextSocket.onmessage = (event: MessageEvent<string>) => {
        let parsedValue: unknown;

        try {
          parsedValue = JSON.parse(event.data) as unknown;
        } catch {
          return;
        }

        const message = parseWebSocketMessage(parsedValue);
        if (!message) {
          return;
        }

        setProgress(clampProgress(message.progress));
        setStatus(message.status);
        setStage(message.stage);

        if (message.type === "error") {
          setError(parsePayloadMessage(message.payload) ?? "The backend reported a job processing error.");
          return;
        }

        setError(null);
      };

      nextSocket.onerror = () => {
        if (isUnmountedRef.current) {
          return;
        }

        setError("Live WebSocket connection encountered an error.");
      };

      nextSocket.onclose = () => {
        if (isUnmountedRef.current) {
          return;
        }

        setIsConnected(false);

        if (reconnectAttemptsRef.current >= MAX_RETRIES) {
          setError("Live WebSocket connection was lost. Falling back to Supabase Realtime.");
          return;
        }

        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = window.setTimeout(() => {
          void connect();
        }, reconnectAttemptsRef.current * 1500);
      };
    };

    void connect();

    return () => {
      isUnmountedRef.current = true;
      clearReconnectTimer();

      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [jobID]);

  useEffect(() => {
    if (!isConnected && error === null) {
      setStage(deriveStage(progress, status));
    }
  }, [error, isConnected, progress, status]);

  return {
    progress,
    status,
    stage,
    isConnected,
    error,
  };
};
