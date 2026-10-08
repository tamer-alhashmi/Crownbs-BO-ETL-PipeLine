"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { syncDriveReports } from "@/lib/etl/sync-drive-reports";
import type { DriveSyncActionState } from "@/lib/etl/drive-sync-state";

export async function runDriveReportSync(
  previousState: DriveSyncActionState,
  formData: FormData,
): Promise<DriveSyncActionState> {
  void previousState;
  void formData;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError") {
      throw new Error(`Unable to verify the signed-in user: ${error.message}`);
    }
    if (!data.user) {
      return { status: "error", message: "Sign in to run a Google Drive import." };
    }

    const summary = await syncDriveReports(data.user.id);
    if (summary.errors.length) {
      revalidatePath("/");
      return {
        status: "error",
        message: `Imported ${summary.importedBookings} bookings and ${summary.importedPayments} payments; ${summary.rejectedRows} rows were rejected. ${summary.errors.join(" ")}`,
      };
    }

    revalidatePath("/");
    return {
      status: "success",
      message: summary.processedFiles
        ? `Imported ${summary.importedBookings} bookings and ${summary.importedPayments} payments from ${summary.processedFiles} files. Dropped ${summary.droppedBookings} canceled zero-value bookings; rejected ${summary.rejectedRows} invalid rows.`
        : "No new matching CSV files were found in the Google Drive folder.",
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "The Google Drive import failed.",
    };
  }
}
