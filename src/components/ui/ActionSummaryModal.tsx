"use client";

import { LoaderCircle, Save, X } from "lucide-react";
import { useEffect } from "react";
import type { FormChange } from "@/lib/forms/use-form-diff";

type ActionSummaryModalProps = {
  open: boolean;
  title: string;
  description?: string;
  changes: FormChange[];
  confirmLabel?: string;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ActionSummaryModal({
  open,
  title,
  description,
  changes,
  confirmLabel = "Confirm & Save",
  isPending = false,
  onCancel,
  onConfirm,
}: ActionSummaryModalProps) {
  useEffect(() => {
    if (!open || isPending) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPending, onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-summary-title"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id="action-summary-title" className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            aria-label="Cancel changes"
            disabled={isPending}
            onClick={onCancel}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-5">
          {changes.length ? changes.map((change) => (
            <div
              key={change.field}
              className="grid gap-1 rounded-xl border border-border bg-background/70 p-3 sm:grid-cols-[minmax(7rem,0.7fr)_1fr]"
            >
              <span className="text-xs font-semibold text-muted-foreground">{change.field}</span>
              <span className="min-w-0 break-words text-sm">
                <span className="text-muted-foreground line-through">{change.previousValue}</span>
                <span className="mx-2 text-muted-foreground" aria-hidden="true">→</span>
                <span className="font-medium text-success">{change.nextValue}</span>
              </span>
            </div>
          )) : (
            <p className="rounded-xl border border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
              No fields have changed.
            </p>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-border bg-muted/30 px-5 py-4">
          <button
            type="button"
            disabled={isPending}
            onClick={onCancel}
            className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending || !changes.length}
            onClick={onConfirm}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isPending ? "Saving..." : confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
