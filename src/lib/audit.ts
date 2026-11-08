import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Records a sensitive operation. Failures are logged, never thrown. */
export async function audit(
  admin: SupabaseClient,
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> = {},
) {
  const { error } = await admin.from("audit_logs").insert({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
  });
  if (error) console.error("[audit] failed", action, error.message);
}
