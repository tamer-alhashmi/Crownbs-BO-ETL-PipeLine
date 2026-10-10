"use client";

import { useCallback } from "react";

export type FormChange = {
  field: string;
  previousValue: string;
  nextValue: string;
};

export function useFormDiff() {
  return useCallback(
    <T extends Record<string, string>>(
      previous: T,
      next: T,
      labels: Partial<Record<keyof T, string>> = {},
    ): FormChange[] =>
      (Object.keys(next) as Array<keyof T>)
        .filter((key) => previous[key] !== next[key])
        .map((key) => ({
          field: labels[key] ?? String(key),
          previousValue: previous[key] || "—",
          nextValue: next[key] || "—",
        })),
    [],
  );
}
