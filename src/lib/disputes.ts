import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertTransition, type TransitionAction } from "@/lib/domain/status";
import { routeDispute } from "@/lib/domain/routing";
import { DEFAULT_DETECTION, runDetection, type DetectionSettings } from "@/lib/domain/detection";
import type { Dispute, DisputeStatus, RoutingRule, Transaction } from "@/lib/domain/types";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";

export class ConflictError extends Error {}

/**
 * Applies a status transition with optimistic concurrency: the update only
 * succeeds if the dispute is still in the expected status. This is what
 * prevents double approvals and duplicate submissions.
 */
export async function transition(
  admin: SupabaseClient,
  dispute: Pick<Dispute, "dispute_id" | "status">,
  action: TransitionAction,
  actor: "customer" | "staff" | "system",
  actorId: string | null,
  remarks: string | null,
  extra: Record<string, unknown> = {},
): Promise<DisputeStatus> {
  const to = assertTransition(action, dispute.status, actor, remarks);
  const { data, error } = await admin
    .from("disputes")
    .update({ status: to, ...extra })
    .eq("dispute_id", dispute.dispute_id)
    .eq("status", dispute.status)
    .select("dispute_id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new ConflictError("This dispute was updated by someone else. Please refresh.");

  await admin.from("dispute_status_history").insert({
    dispute_id: dispute.dispute_id,
    previous_status: dispute.status,
    new_status: to,
    updated_by: actorId,
    action,
    remarks,
  });
  await audit(admin, actorId, `dispute.${action}`, "dispute", dispute.dispute_id, { from: dispute.status, to, remarks });
  return to;
}

export async function loadRules(admin: SupabaseClient): Promise<RoutingRule[]> {
  const { data } = await admin.from("routing_rules").select("*").eq("is_active", true);
  return (data as RoutingRule[]) ?? [];
}

export async function computeRouting(admin: SupabaseClient, dispute: Dispute, txn: Transaction) {
  const rules = await loadRules(admin);
  return routeDispute(
    {
      paymentMethod: txn.payment_method,
      category: dispute.dispute_category ?? "other",
      transactionDate: txn.transaction_date,
      transactionStatus: txn.transaction_status,
    },
    rules,
  );
}

export async function loadDetectionSettings(admin: SupabaseClient): Promise<DetectionSettings> {
  const { data } = await admin.from("system_settings").select("key, value");
  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  return {
    duplicateEnabled: map.duplicate_detection?.enabled ?? DEFAULT_DETECTION.duplicateEnabled,
    duplicateWindowMinutes: Number(map.duplicate_detection?.window_minutes ?? DEFAULT_DETECTION.duplicateWindowMinutes),
    failedDebitEnabled: map.failed_debit_detection?.enabled ?? DEFAULT_DETECTION.failedDebitEnabled,
  };
}

/**
 * Runs the deterministic detection rules for a customer and records new
 * alerts. Dismissed or confirmed alerts are never re-opened (dedupe key).
 */
export async function syncAlerts(admin: SupabaseClient, userId: string) {
  try {
    const [{ data: txns }, settings] = await Promise.all([
      admin.from("transactions").select("*").eq("user_id", userId),
      loadDetectionSettings(admin),
    ]);
    const detected = runDetection((txns as Transaction[]) ?? [], settings);
    if (!detected.length) return;

    const { data: inserted } = await admin
      .from("dispute_alerts")
      .upsert(
        detected.map((d) => ({ ...d, user_id: userId })),
        { onConflict: "dedupe_key", ignoreDuplicates: true },
      )
      .select("alert_id, dedupe_key");

    for (const a of inserted ?? []) {
      await notify(admin, {
        userId,
        type: "potential_dispute",
        title: "Potential issue found",
        message: "We spotted a transaction you may want to check. Tap to review it.",
        dedupeKey: `alert:${a.dedupe_key}`,
      });
    }
  } catch (e) {
    // Detection is best-effort; it must never block the dashboard.
    console.error("[detection] failed", e);
  }
}
