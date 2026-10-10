"use client";

import { ArrowDownToLine, LoaderCircle } from "lucide-react";
import { useDriveSync } from "@/hooks/useDriveSync";
import { DriveSyncProgressWidget } from "@/components/ui/DriveSyncProgressWidget";

export function DriveSyncButton() {
  const { state, startSync, close, reopen, toggleCollapsed } = useDriveSync();

  return (
    <>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <button
          type="button"
          disabled={state.isRunning}
          onClick={() => void startSync()}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.isRunning ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowDownToLine className="h-3.5 w-3.5" />
          )}
          {state.isRunning ? "Syncing Drive..." : "Sync Google Drive"}
        </button>
        {state.error && !state.isOpen && (
          <p role="alert" className="max-w-[420px] text-right text-[11px] leading-4 text-danger">
            {state.error}
          </p>
        )}
      </div>
      <DriveSyncProgressWidget
        state={state}
        onClose={close}
        onReopen={reopen}
        onToggleCollapsed={toggleCollapsed}
      />
    </>
  );
}
