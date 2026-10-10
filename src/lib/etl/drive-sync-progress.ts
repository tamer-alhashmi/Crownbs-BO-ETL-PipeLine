import type { DriveSyncSummary } from "@/lib/etl/sync-drive-reports";

export type DriveSyncFileStatus = "pending" | "processing" | "completed" | "failed";

export type DriveSyncFile = {
  id: string;
  name: string;
  status: DriveSyncFileStatus;
  error?: string;
};

export type DriveSyncProgressEvent =
  | { type: "files"; files: DriveSyncFile[] }
  | { type: "file"; file: DriveSyncFile }
  | { type: "complete"; summary: DriveSyncSummary }
  | { type: "error"; message: string };
