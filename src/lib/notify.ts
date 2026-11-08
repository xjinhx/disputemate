import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationType =
  | "potential_dispute"
  | "draft_saved"
  | "info_requested"
  | "approved"
  | "submitted"
  | "status_updated"
  | "resolved"
  | "rejected";

/**
 * In-app notification (FR-11). The dedupe key prevents duplicate notifications
 * for the same event. A failed notification never affects dispute records.
 */
export async function notify(
  admin: SupabaseClient,
  n: { userId: string; disputeId?: string | null; type: NotificationType; title: string; message: string; dedupeKey: string },
) {
  const { error } = await admin.from("notifications").upsert(
    {
      user_id: n.userId,
      dispute_id: n.disputeId ?? null,
      notification_type: n.type,
      title: n.title,
      message: n.message,
      dedupe_key: n.dedupeKey,
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );
  if (error) console.error("[notify] failed", n.type, error.message);
}
