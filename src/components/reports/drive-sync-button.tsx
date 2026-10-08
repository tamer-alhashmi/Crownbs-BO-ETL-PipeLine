"use client";

import { ArrowDownToLine, LoaderCircle } from "lucide-react";
import { useActionState } from "react";
import { runDriveReportSync } from "@/app/actions/drive-sync";
import { initialDriveSyncState } from "@/lib/etl/drive-sync-state";

export function DriveSyncButton() {
  const [state, action, pending] = useActionState(
    runDriveReportSync,
    initialDriveSyncState,
  );

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowDownToLine className="h-3.5 w-3.5" />
          )}
          {pending ? "Syncing Drive..." : "Sync Google Drive"}
        </button>
      </form>
      {state.message && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`max-w-[420px] text-right text-[11px] leading-4 ${state.status === "error" ? "text-danger" : "text-success"}`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
