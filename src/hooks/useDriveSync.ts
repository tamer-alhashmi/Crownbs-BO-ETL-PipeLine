"use client";

import { useCallback, useRef, useState } from "react";
import type { DriveSyncProgressEvent, DriveSyncFile } from "@/lib/etl/drive-sync-progress";
import type { DriveSyncSummary } from "@/lib/etl/sync-drive-reports";

export type DriveSyncState = {
  files: DriveSyncFile[];
  isRunning: boolean;
  isOpen: boolean;
  isCollapsed: boolean;
  summary: DriveSyncSummary | null;
  error: string;
};

const initialState: DriveSyncState = {
  files: [],
  isRunning: false,
  isOpen: false,
  isCollapsed: false,
  summary: null,
  error: "",
};

function parseEvent(frame: string): DriveSyncProgressEvent | null {
  const data = frame
    .split(/\r?\n/)
    .find((line) => line.startsWith("data:"))
    ?.slice(5)
    .trim();
  if (!data) return null;
  return JSON.parse(data) as DriveSyncProgressEvent;
}

export function useDriveSync() {
  const [state, setState] = useState(initialState);
  const running = useRef(false);

  const startSync = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setState({ ...initialState, isRunning: true, isOpen: true });

    try {
      const response = await fetch("/api/sync/drive", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error || "Could not start Google Drive sync.");
      }
      if (!response.body) throw new Error("Google Drive sync did not provide a progress stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;

      const handleFrame = (frame: string) => {
        const event = parseEvent(frame);
        if (!event) return;
        if (event.type === "files") {
          setState((current) => ({ ...current, files: event.files }));
        } else if (event.type === "file") {
          setState((current) => ({
            ...current,
            files: current.files.map((file) =>
              file.id === event.file.id ? event.file : file,
            ),
          }));
        } else if (event.type === "complete") {
          completed = true;
          setState((current) => ({ ...current, isRunning: false, summary: event.summary }));
        } else {
          completed = true;
          setState((current) => ({ ...current, isRunning: false, error: event.message }));
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";
        for (const frame of frames) handleFrame(frame);
        if (done) break;
      }
      if (buffer.trim()) handleFrame(buffer);
      if (!completed) throw new Error("Google Drive progress stream ended before sync completed.");
    } catch (error) {
      setState((current) => ({
        ...current,
        isRunning: false,
        error: error instanceof Error ? error.message : "Google Drive sync failed.",
      }));
    } finally {
      running.current = false;
    }
  }, []);

  const close = useCallback(() => setState((current) => ({ ...current, isOpen: false })), []);
  const reopen = useCallback(() => setState((current) => ({ ...current, isOpen: true })), []);
  const toggleCollapsed = useCallback(
    () => setState((current) => ({ ...current, isCollapsed: !current.isCollapsed })),
    [],
  );

  return { state, startSync, close, reopen, toggleCollapsed };
}
