"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { notify, type NotificationType } from "@/lib/notify";
import { computeRouting, ConflictError, transition } from "@/lib/disputes";
import { explainDecision } from "@/lib/ai";
import { generateSubmissionReference } from "@/lib/domain/rules";
import type { TransitionAction } from "@/lib/domain/status";
import type { Dispute, DisputeCategoryKey, Transaction } from "@/lib/domain/types";

async function loadForStaff(disputeId: string) {
  const staff = await requireStaff();
  const admin = createAdminClient();
  const { data } = await admin.from("disputes").select("*").eq("dispute_id", disputeId).single();
  if (!data) redirect("/review/queue");
  return { staff, admin, dispute: data as Dispute };
}

const page = (id: string, extra = "") => `/review/disputes/${id}${extra}`;

const CUSTOMER_MESSAGES: Partial<Record<TransitionAction, { type: NotificationType; title: string; message: string }>> = {
  request_info: {
    type: "info_requested",
    title: "We need more information",
    message: "Our dispute team needs a bit more information to continue. Please open your dispute to respond.",
  },
  return_for_correction: {
    type: "info_requested",
    title: "Please check your dispute",
    message: "Our dispute team has returned your dispute for a correction. Please open it to see what is needed.",
  },
  reject: { type: "rejected", title: "Dispute not accepted", message: "Your dispute was not accepted. Open it to see the reason and your options." },
  start_investigation: {
    type: "status_updated",
    title: "Investigation started",
    message: "The bank has started investigating your dispute.",
  },
  resolve: { type: "resolved", title: "Dispute resolved", message: "The investigation has concluded. Open your dispute to see the decision." },
  reject_after_investigation: {
    type: "rejected",
    title: "Dispute outcome available",
    message: "The investigation has concluded. Open your dispute to see the decision and your options.",
  },
};

/**
 * FR-08 reviewer decisions. Every action is recorded with the reviewer,
 * timestamp and remarks. Approval immediately triggers the simulated filing
 * (FR-09); the AI never takes part in the decision itself.
 */
export async function reviewAction(formData: FormData) {
  const disputeId = String(formData.get("dispute_id"));
  const action = String(formData.get("action")) as TransitionAction;
  const remarks = String(formData.get("remarks") ?? "").trim() || null;
  const allowed: TransitionAction[] = [
    "approve",
    "reject",
    "request_info",
    "return_for_correction",
    "start_investigation",
    "resolve",
    "reject_after_investigation",
  ];
  if (!allowed.includes(action)) redirect(page(disputeId, "?error=bad_action"));

  const { staff, admin, dispute } = await loadForStaff(disputeId);
  const extra: Record<string, unknown> = { assigned_reviewer_id: dispute.assigned_reviewer_id ?? staff.user_id };

  if (action === "approve" && !dispute.dispute_category) redirect(page(disputeId, "?error=" + encodeURIComponent("Set a dispute category before approving.")));

  if (action === "reject" || action === "resolve" || action === "reject_after_investigation") {
    const decision = action === "resolve" ? String(formData.get("decision") ?? "Resolved in customer's favour") : "Rejected";
    const nextSteps = String(formData.get("next_steps") ?? "").trim() || null;
    extra.decision = decision;
    extra.decision_reason = remarks;
    extra.next_steps = nextSteps;
    if (remarks) extra.decision_explanation = await explainDecision(admin, disputeId, decision, remarks);
  }

  let newStatus;
  try {
    newStatus = await transition(admin, dispute, action, "staff", staff.user_id, remarks, extra);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Action failed";
    redirect(page(disputeId, "?error=" + encodeURIComponent(msg)));
  }

  const msg = CUSTOMER_MESSAGES[action];
  if (msg) {
    await notify(admin, {
      userId: dispute.user_id,
      disputeId,
      ...msg,
      dedupeKey: `${action}:${disputeId}:${Date.now()}`,
    });
  }

  if (action === "approve" && newStatus === "approved_for_filing") {
    await notify(admin, {
      userId: dispute.user_id,
      disputeId,
      type: "approved",
      title: "Dispute approved for filing",
      message: "Good news, your dispute has been approved and is being filed.",
      dedupeKey: `approved:${disputeId}`,
    });
    await fileDispute(admin, { ...dispute, status: "approved_for_filing" }, staff.user_id);
  }

  revalidatePath("/review");
  redirect(page(disputeId, "?notice=" + action));
}

/**
 * FR-09 simulated submission. Idempotent: the status check in transition()
 * plus the unique submission_reference column prevent double filing.
 */
async function fileDispute(admin: ReturnType<typeof createAdminClient>, dispute: Dispute, actorId: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const reference = generateSubmissionReference();
    try {
      await transition(admin, dispute, "file", "system", actorId, `Simulated filing, reference ${reference}`, {
        submission_reference: reference,
        submitted_at: new Date().toISOString(),
      });
      await audit(admin, actorId, "dispute.submission_attempt", "dispute", dispute.dispute_id, { reference, outcome: "success" });
      await notify(admin, {
        userId: dispute.user_id,
        disputeId: dispute.dispute_id,
        type: "submitted",
        title: "Dispute filed",
        message: `Your dispute has been filed. Your reference number is ${reference}.`,
        dedupeKey: `submitted:${dispute.dispute_id}`,
      });
      return;
    } catch (e) {
      await audit(admin, actorId, "dispute.submission_attempt", "dispute", dispute.dispute_id, {
        reference,
        outcome: "failed",
        error: String(e),
      });
      if (e instanceof ConflictError) return; // already filed by another request
    }
  }
}

export async function retryFiling(formData: FormData) {
  const disputeId = String(formData.get("dispute_id"));
  const { staff, admin, dispute } = await loadForStaff(disputeId);
  if (dispute.status === "approved_for_filing") await fileDispute(admin, dispute, staff.user_id);
  redirect(page(disputeId));
}

export async function escalateToFraud(formData: FormData) {
  const disputeId = String(formData.get("dispute_id"));
  const remarks = String(formData.get("remarks") ?? "").trim();
  const { staff, admin, dispute } = await loadForStaff(disputeId);
  if (!remarks) redirect(page(disputeId, "?error=" + encodeURIComponent("Add a note explaining the escalation.")));
  await admin.from("disputes").update({ escalated_to_fraud: true, requires_human_routing: true }).eq("dispute_id", disputeId);
  await admin.from("dispute_status_history").insert({
    dispute_id: disputeId,
    previous_status: dispute.status,
    new_status: dispute.status,
    updated_by: staff.user_id,
    action: "escalate_fraud",
    remarks,
  });
  await audit(admin, staff.user_id, "dispute.escalate_fraud", "dispute", disputeId, { remarks });
  redirect(page(disputeId, "?notice=escalated"));
}

export async function assignToMe(formData: FormData) {
  const disputeId = String(formData.get("dispute_id"));
  const { staff, admin } = await loadForStaff(disputeId);
  await admin.from("disputes").update({ assigned_reviewer_id: staff.user_id }).eq("dispute_id", disputeId);
  await audit(admin, staff.user_id, "dispute.assign", "dispute", disputeId, { to: staff.user_id });
  redirect(page(disputeId));
}

/** Reviewers can correct the category; routing is recalculated deterministically. */
export async function updateCategory(formData: FormData) {
  const disputeId = String(formData.get("dispute_id"));
  const category = String(formData.get("dispute_category")) as DisputeCategoryKey;
  const { staff, admin, dispute } = await loadForStaff(disputeId);
  if (dispute.status !== "pending_review") redirect(page(disputeId, "?error=" + encodeURIComponent("Category can only be changed while pending review.")));
  const { data: txn } = await admin.from("transactions").select("*").eq("transaction_id", dispute.transaction_id).single();
  const updated = { ...dispute, dispute_category: category };
  const routing = await computeRouting(admin, updated, txn as Transaction);
  await admin
    .from("disputes")
    .update({
      dispute_category: category,
      routing_rule_id: routing.rule?.rule_id ?? null,
      recommended_reason_code: routing.reasonCode,
      routing_explanation: `Category changed by reviewer. ${routing.explanation}`,
      filing_deadline: routing.filingDeadline?.toISOString() ?? null,
      requires_human_routing: routing.requiresHumanRouting || dispute.scam_indicators.length > 0,
    })
    .eq("dispute_id", disputeId);
  await audit(admin, staff.user_id, "dispute.recategorise", "dispute", disputeId, { from: dispute.dispute_category, to: category });
  redirect(page(disputeId, "?notice=recategorised"));
}

export async function addNote(formData: FormData) {
  const disputeId = String(formData.get("dispute_id"));
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  const { staff, admin } = await loadForStaff(disputeId);
  if (body) await admin.from("reviewer_notes").insert({ dispute_id: disputeId, author_id: staff.user_id, body });
  redirect(page(disputeId));
}
