"use client";

import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock3,
  LoaderCircle,
  X,
} from "lucide-react";
import type { DriveSyncState } from "@/hooks/useDriveSync";

type DriveSyncProgressWidgetProps = {
  state: DriveSyncState;
  onClose: () => void;
  onReopen: () => void;
  onToggleCollapsed: () => void;
};

export function DriveSyncProgressWidget({
  state,
  onClose,
  onReopen,
  onToggleCollapsed,
}: DriveSyncProgressWidgetProps) {
  const finished = !state.isRunning && state.summary !== null;
  const failed = state.files.some((file) => file.status === "failed") || Boolean(state.error);
  const title = state.isRunning
    ? `Syncing ${state.files.length || ""} ${state.files.length === 1 ? "file" : "files"}...`
    : state.error
      ? "Sync failed"
      : failed
        ? "Sync finished with errors"
        : finished
          ? "All syncs complete"
          : "Google Drive sync";

  if (!state.isOpen) {
    if (!state.isRunning && !state.summary && !state.error) return null;
    return (
      <button
        type="button"
        onClick={onReopen}
        className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-card-foreground shadow-xl transition hover:bg-muted"
      >
        {state.isRunning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
        {state.isRunning ? "View sync progress" : "View sync results"}
      </button>
    );
  }

  return (
    <section
      aria-label="Google Drive sync progress"
      className="fixed bottom-4 right-4 z-50 w-80 overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl sm:w-96 animate-in slide-in-from-bottom-2 fade-in duration-200"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${failed ? "bg-danger/10 text-danger" : "bg-primary/10 text-primary"}`}>
            {state.isRunning ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : failed ? (
              <CircleAlert className="h-4 w-4" />
            ) : (
              <ArrowDownToLine className="h-4 w-4" />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{title}</p>
            <p className="text-[11px] text-muted-foreground">
              {state.isRunning
                ? `${state.files.filter((file) => file.status === "completed").length} of ${state.files.length} complete`
                : state.files.length
                  ? `${state.files.length} report ${state.files.length === 1 ? "file" : "files"}`
                  : "Google Drive"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={state.isCollapsed ? "Expand sync progress" : "Collapse sync progress"}
            onClick={onToggleCollapsed}
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            {state.isCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button
            type="button"
            aria-label="Close sync progress"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {!state.isCollapsed && (
        <>
          <div className="max-h-[min(52vh,24rem)] divide-y divide-border overflow-y-auto">
            {state.files.map((file) => (
              <div key={file.id} className="flex items-start gap-3 px-4 py-3">
                <div className="mt-0.5 shrink-0">
                  {file.status === "pending" ? (
                    <Clock3 className="h-4 w-4 text-muted-foreground" />
                  ) : file.status === "processing" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
                  ) : file.status === "completed" ? (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-success/15 text-success">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : (
                    <span title={file.error} aria-label={file.error || "File sync failed"}>
                      <CircleAlert className="h-4 w-4 text-danger" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium" title={file.name}>{file.name}</p>
                  <p className={`mt-0.5 text-[10px] ${file.status === "failed" ? "text-danger" : "text-muted-foreground"}`}>
                    {file.status === "pending" ? "Waiting" : file.status === "processing" ? "Processing" : file.status === "completed" ? "Complete" : file.error || "Failed"}
                  </p>
                </div>
              </div>
            ))}
            {!state.files.length && state.isRunning && (
              <p className="px-4 py-5 text-xs text-muted-foreground">Finding report files...</p>
            )}
            {state.error && (
              <p role="alert" className="flex gap-2 px-4 py-3 text-xs text-danger">
                <CircleAlert className="h-4 w-4 shrink-0" /> {state.error}
              </p>
            )}
          </div>
          {finished && state.summary && (
            <footer className="border-t border-border bg-muted/30 px-4 py-3">
              <p className="inline-flex items-center rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success">
                {state.summary.importedBookings} Bookings imported · {state.summary.importedPayments} Payments reconciled
              </p>
              {!!state.summary.rejectedRows && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {state.summary.rejectedRows} invalid rows skipped
                </p>
              )}
              {!!state.summary.errors.length && (
                <ul className="mt-2 space-y-1 text-[11px] text-danger">
                  {state.summary.errors.map((error) => <li key={error}>{error}</li>)}
                </ul>
              )}
            </footer>
          )}
        </>
      )}
    </section>
  );
}
