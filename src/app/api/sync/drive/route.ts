import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { syncDriveReports } from "@/lib/etl/sync-drive-reports";
import type { DriveSyncProgressEvent } from "@/lib/etl/drive-sync-progress";

export const runtime = "nodejs";

const encoder = new TextEncoder();

function eventChunk(event: DriveSyncProgressEvent) {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") {
    return Response.json(
      { error: `Unable to verify the signed-in user: ${error.message}` },
      { status: 500 },
    );
  }
  if (!data.user) {
    return Response.json({ error: "Sign in to run a Google Drive import." }, { status: 401 });
  }

  let disconnected = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: DriveSyncProgressEvent) => {
        if (!disconnected) controller.enqueue(eventChunk(event));
      };
      void (async () => {
        try {
          const summary = await syncDriveReports(data.user.id, send);
          revalidatePath("/");
          send({ type: "complete", summary });
        } catch (syncError) {
          send({
            type: "error",
            message: syncError instanceof Error ? syncError.message : "The Google Drive import failed.",
          });
        } finally {
          if (!disconnected) controller.close();
        }
      })();
    },
    cancel() {
      disconnected = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
