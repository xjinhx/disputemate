"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { computeRouting, ConflictError, transition } from "@/lib/disputes";
import { processEvidence, prepareSummary, recommendCategory } from "@/lib/ai";
import { BUCKET, safeFileName, validateUpload } from "@/lib/evidence";
import { customerCanEdit } from "@/lib/domain/status";
import {
  CATEGORY_QUESTIONS,
  detectScamIndicators,
  templateSummary,
  validateForSubmission,
} from "@/lib/domain/rules";
import type { AiSummary, Dispute, DisputeCategoryKey, Evidence, Transaction } from "@/lib/domain/types";

const CATEGORY_KEYS: DisputeCategoryKey[] = ["unauthorised", "duplicate", "goods_services", "failed_debited", "other"];

async function ownDispute(disputeId: string) {
  const user = await requireUser(["customer"]);
  const admin = createAdminClient();
  const { data } = await admin.from("disputes").select("*").eq("dispute_id", disputeId).single();
  const dispute = data as Dispute | null;
  if (!dispute || dispute.user_id !== user.user_id) redirect("/app/disputes");
  const { data: txn } = await admin.from("transactions").select("*").eq("transaction_id", dispute.transaction_id).single();
  return { user, admin, dispute, txn: txn as Transaction };
}

const back = (id: string, step: string, extra = "") => `/app/disputes/${id}?step=${step}${extra}`;

// ---------------------------------------------------------------------------
// Start a dispute (FR-04). Detection results never create disputes on their own.
// ---------------------------------------------------------------------------
export async function startDispute(formData: FormData) {
  const user = await requireUser(["customer"]);
  const admin = createAdminClient();
  const transactionId = String(formData.get("transaction_id") ?? "");
  const alertId = String(formData.get("alert_id") ?? "") || null;
  const acknowledged = formData.get("acknowledge_existing") === "on";

  const { data: txn } = await admin.from("transactions").select("*").eq("transaction_id", transactionId).single();
  if (!txn || txn.user_id !== user.user_id) redirect("/app/transactions");

  // FR-02: a transaction already under an active dispute cannot be disputed again.
  const { data: active } = await admin
    .from("disputes")
    .select("dispute_id, status")
    .eq("transaction_id", transactionId)
    .not("status", "in", "(resolved,rejected)")
    .maybeSingle();
  if (active) redirect(`/app/disputes/${active.dispute_id}?notice=already_active`);

  // A previously closed dispute exists: require explicit acknowledgement.
  const { count: closedCount } = await admin
    .from("disputes")
    .select("dispute_id", { count: "exact", head: true })
    .eq("transaction_id", transactionId);
  if ((closedCount ?? 0) > 0 && !acknowledged) redirect(`/app/transactions/${transactionId}?warn=previous_dispute`);

  let category: DisputeCategoryKey | null = null;
  let related: string | null = null;
  if (alertId) {
    const { data: alert } = await admin.from("dispute_alerts").select("*").eq("alert_id", alertId).single();
    if (alert && alert.user_id === user.user_id) {
      category = alert.alert_type === "duplicate" ? "duplicate" : alert.alert_type === "failed_debited" ? "failed_debited" : "unauthorised";
      related = alert.related_transaction_id;
      await admin.from("dispute_alerts").update({ status: "confirmed", resolved_at: new Date().toISOString() }).eq("alert_id", alertId);
    }
  }
  if (formData.get("unrecognised") === "on") category = "unauthorised";

  const { data: created, error } = await admin
    .from("disputes")
    .insert({ user_id: user.user_id, transaction_id: transactionId, related_transaction_id: related, dispute_category: category })
    .select("dispute_id")
    .single();
  if (error || !created) {
    console.error("[startDispute]", error?.message);
    redirect(`/app/transactions/${transactionId}?error=start_failed`);
  }

  await admin.from("dispute_status_history").insert({
    dispute_id: created.dispute_id,
    previous_status: null,
    new_status: "draft",
    updated_by: user.user_id,
    action: "create",
    remarks: alertId ? "Started from a potential dispute alert" : "Started by customer",
  });
  await audit(admin, user.user_id, "dispute.create", "dispute", created.dispute_id, { transactionId, alertId });
  await notify(admin, {
    userId: user.user_id,
    disputeId: created.dispute_id,
    type: "draft_saved",
    title: "Dispute draft saved",
    message: `Your dispute for ${txn.merchant_name} is saved as a draft. You can continue any time.`,
    dedupeKey: `draft:${created.dispute_id}`,
  });
  redirect(back(created.dispute_id, "details"));
}

// ---------------------------------------------------------------------------
// Step 1: category, explanation and category questions
// ---------------------------------------------------------------------------
export async function saveDetails(formData: FormData) {
  const disputeId = String(formData.get("dispute_id"));
  const { user, admin, dispute, txn } = await ownDispute(disputeId);
  if (!customerCanEdit(dispute.status)) redirect(back(disputeId, "overview"));

  const categoryRaw = String(formData.get("dispute_category") ?? "");
  const category = CATEGORY_KEYS.includes(categoryRaw as DisputeCategoryKey) ? (categoryRaw as DisputeCategoryKey) : null;
  const description = String(formData.get("customer_description") ?? "").slice(0, 4000);
  const answers: Record<string, string> = {};
  for (const q of CATEGORY_QUESTIONS[category ?? "other"]) {
    const v = formData.get(`q_${q.id}`);
    if (v) answers[q.id] = String(v).slice(0, 500);
  }
  const relatedId = String(formData.get("related_transaction_id") ?? "") || null;
  if (relatedId) {
    const { data: rel } = await admin.from("transactions").select("user_id").eq("transaction_id", relatedId).single();
    if (!rel || rel.user_id !== user.user_id) redirect(back(disputeId, "details", "&error=bad_related"));
  }

  const scam = detectScamIndicators(description, answers);
  const ai = description.trim().length >= 10 ? await recommendCategory(admin, disputeId, txn, description, category) : null;

  await admin
    .from("disputes")
    .update({
      dispute_category: category,
      customer_description: description,
      category_answers: answers,
      related_transaction_id: category === "duplicate" ? relatedId : null,
      scam_indicators: scam,
      ai_recommended_category: ai?.category ?? null,
      ai_category_reasoning: ai?.reasoning ?? null,
      ai_category_confidence: ai?.confidence ?? null,
      // Any edit invalidates a previously generated summary.
      ai_summary: null,
      ai_summary_source: null,
    })
    .eq("dispute_id", disputeId);

  if (!category) redirect(back(disputeId, "details", "&error=category"));
  // Show the AI recommendation if it disagrees, so the customer can switch.
  if (ai && ai.category !== category) redirect(back(disputeId, "details", "&ai=check"));
  redirect(back(disputeId, "evidence"));
}

export async function acceptAiCategory(formData: FormData) {
  const disputeId = String(formData.get("dispute_id"));
  const { admin, dispute } = await ownDispute(disputeId);
  if (!customerCanEdit(dispute.status) || !dispute.ai_recommended_category) redirect(back(disputeId, "details"));
  await admin
    .from("disputes")
    .update({ dispute_category: dispute.ai_recommended_category, category_answers: {}, ai_summary: null })
    .eq("dispute_id", disputeId);
  redirect(back(disputeId, "details", "&accepted=1"));
}

// ---------------------------------------------------------------------------
// Step 2: evidence (FR-05)
// ---------------------------------------------------------------------------
export async function uploadEvidence(formData: FormData) {
  const disputeId = String(formData.get("dispute_id"));
  const { user, admin, dispute, txn } = await ownDispute(disputeId);
  if (!customerCanEdit(dispute.status)) redirect(back(disputeId, "overview"));

  const file = formData.get("file") as File | null;
  const problem = validateUpload(file);
  if (problem) redirect(back(disputeId, "evidence", `&error=${encodeURIComponent(problem)}`));

  const bytes = Buffer.from(await file!.arrayBuffer());
  const path = `${user.user_id}/${disputeId}/${crypto.randomUUID()}-${safeFileName(file!.name)}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: file!.type });
  if (upErr) {
    console.error("[uploadEvidence]", upErr.message);
    redirect(back(disputeId, "evidence", `&error=${encodeURIComponent("Upload failed, please try again.")}`));
  }

  const { data: ev } = await admin
    .from("evidence")
    .insert({
      dispute_id: disputeId,
      file_name: file!.name.slice(0, 200),
      storage_path: path,
      file_type: file!.type,
      file_size: file!.size,
      evidence_source: "customer_upload",
      customer_description: String(formData.get("note") ?? "").slice(0, 500),
      processing_status: "processing",
    })
    .select("evidence_id")
    .single();
  await audit(admin, user.user_id, "evidence.upload", "evidence", ev?.evidence_id ?? null, { disputeId, type: file!.type });

  // AI extraction is best-effort. Original file stays available regardless.
  const result = await processEvidence(admin, disputeId, txn, { name: file!.name, type: file!.type, bytes });
  await admin
    .from("evidence")
    .update(
      result
        ? {
            extracted_text: result.extracted_text,
            ai_summary:
              result.summary +
              (result.matches_transaction === "no" ? " This document may not match the disputed transaction." : "") +
              (result.inconsistencies.length ? ` Possible differences: ${result.inconsistencies.join("; ")}` : ""),
            processing_status: "processed",
          }
        : { processing_status: "failed" },
    )
    .eq("evidence_id", ev?.evidence_id);
  await admin.from("disputes").update({ ai_summary: null, ai_summary_source: null }).eq("dispute_id", disputeId);
  redirect(back(disputeId, "evidence"));
}

export async function removeEvidence(formData: FormData) {
  const disputeId = String(formData.get("dispute_id"));
  const evidenceId = String(formData.get("evidence_id"));
  const { user, admin, dispute } = await ownDispute(disputeId);
  if (!customerCanEdit(dispute.status)) redirect(back(disputeId, "overview"));
  const { data: ev } = await admin.from("evidence").select("*").eq("evidence_id", evidenceId).single();
  const e = ev as Evidence | null;
  if (!e || e.dispute_id !== disputeId || e.evidence_source !== "customer_upload") redirect(back(disputeId, "evidence"));
  // Evidence already seen by a reviewer is kept for the audit trail.
  if (dispute.status !== "draft") redirect(back(disputeId, "evidence", "&error=" + encodeURIComponent("Submitted evidence cannot be removed. Add a new file instead.")));
  if (e.storage_path) await admin.storage.from(BUCKET).remove([e.storage_path]);
  await admin.from("evidence").delete().eq("evidence_id", evidenceId);
  await admin.from("disputes").update({ ai_summary: null, ai_summary_source: null }).eq("dispute_id", disputeId);
  await audit(admin, user.user_id, "evidence.remove", "evidence", evidenceId, { disputeId });
  redirect(back(disputeId, "evidence"));
}

// ---------------------------------------------------------------------------
// Step 3: AI dispute preparation (FR-06)
// ---------------------------------------------------------------------------
export async function generateSummary(formData: FormData) {
  const disputeId = String(formData.get("dispute_id"));
  const { admin, dispute, txn } = await ownDispute(disputeId);
  if (!customerCanEdit(dispute.status)) redirect(back(disputeId, "overview"));
  if (!dispute.dispute_category) redirect(back(disputeId, "details", "&error=category"));

  const [{ data: evidence }, { data: cat }, related, routing] = await Promise.all([
    admin.from("evidence").select("*").eq("dispute_id", disputeId),
    admin.from("dispute_categories").select("label").eq("key", dispute.dispute_category).single(),
    dispute.related_transaction_id
      ? admin.from("transactions").select("*").eq("transaction_id", dispute.related_transaction_id).single().then((r) => r.data as Transaction)
      : Promise.resolve(null),
    computeRouting(admin, dispute, txn),
  ]);
  const ev = (evidence as Evidence[]) ?? [];
  const label = cat?.label ?? dispute.dispute_category;
  const missing = validateForSubmission(dispute, ev.length, routing.requiredFields, true).missing;

  let summary: AiSummary | null = await prepareSummary(admin, disputeId, {
    categoryLabel: label,
    txn,
    related,
    description: dispute.customer_description,
    answers: dispute.category_answers,
    evidence: ev,
    missingFields: missing,
  });
  let source: "ai" | "template" = "ai";
  if (!summary) {
    summary = templateSummary(dispute, label, txn, related, ev, missing);
    source = "template";
  }
  await admin.from("disputes").update({ ai_summary: summary, ai_summary_source: source }).eq("dispute_id", disputeId);
  redirect(back(disputeId, "review"));
}

// ---------------------------------------------------------------------------
// Step 4: review, confirm and submit (FR-06, FR-07)
// ---------------------------------------------------------------------------
export async function submitForReview(formData: FormData) {
  const disputeId = String(formData.get("dispute_id"));
  const { user, admin, dispute, txn } = await ownDispute(disputeId);
  if (!customerCanEdit(dispute.status)) redirect(back(disputeId, "overview"));

  // Customer edits to the AI-generated text.
  const explanation = String(formData.get("summary_explanation") ?? "").trim();
  const reason = String(formData.get("summary_reason") ?? "").trim();
  const summary = dispute.ai_summary
    ? {
        ...dispute.ai_summary,
        customer_explanation: explanation || dispute.ai_summary.customer_explanation,
        recommended_filing_reason: reason || dispute.ai_summary.recommended_filing_reason,
      }
    : null;
  const confirmed = formData.get("confirm") === "on";

  const { count } = await admin.from("evidence").select("evidence_id", { count: "exact", head: true }).eq("dispute_id", disputeId);
  const routing = await computeRouting(admin, dispute, txn);
  const validation = validateForSubmission(dispute, count ?? 0, routing.requiredFields, confirmed);
  if (!summary) validation.missing.push("summary");
  if (!validation.ok || !summary) {
    await admin.from("disputes").update({ ai_summary: summary }).eq("dispute_id", disputeId);
    redirect(back(disputeId, "review", `&missing=${validation.missing.join(",")}`));
  }

  const scam = detectScamIndicators(dispute.customer_description, dispute.category_answers);
  const aiUnsure = dispute.ai_category_confidence !== null && dispute.ai_category_confidence < 0.6;
  const needsHuman = routing.requiresHumanRouting || scam.length > 0 || aiUnsure || dispute.dispute_category === "other";

  try {
    await transition(
      admin,
      dispute,
      dispute.status === "draft" ? "submit_for_review" : "resubmit",
      "customer",
      user.user_id,
      dispute.status === "draft" ? "Submitted by customer" : "Customer provided additional information",
      {
        ai_summary: summary,
        customer_confirmed_at: new Date().toISOString(),
        routing_rule_id: routing.rule?.rule_id ?? null,
        recommended_reason_code: routing.reasonCode,
        routing_explanation: routing.explanation + (aiUnsure ? " AI could not confidently classify this case." : ""),
        filing_deadline: routing.filingDeadline?.toISOString() ?? null,
        requires_human_routing: needsHuman,
        scam_indicators: scam,
        escalated_to_fraud: dispute.escalated_to_fraud || scam.length > 0,
      },
    );
  } catch (e) {
    if (e instanceof ConflictError) redirect(back(disputeId, "overview", "&notice=conflict"));
    throw e;
  }

  await notify(admin, {
    userId: user.user_id,
    disputeId,
    type: "status_updated",
    title: "Dispute sent for review",
    message: "Our dispute team will review your submission. We will let you know if we need anything else.",
    dedupeKey: `pending:${disputeId}:${dispute.status}:${Date.now()}`,
  });
  revalidatePath("/app");
  redirect(back(disputeId, "overview", "&notice=submitted"));
}

export async function deleteDraft(formData: FormData) {
  const disputeId = String(formData.get("dispute_id"));
  const { user, admin, dispute } = await ownDispute(disputeId);
  if (dispute.status !== "draft") redirect(back(disputeId, "overview"));
  const { data: ev } = await admin.from("evidence").select("storage_path").eq("dispute_id", disputeId);
  const paths = (ev ?? []).map((e) => e.storage_path).filter(Boolean) as string[];
  if (paths.length) await admin.storage.from(BUCKET).remove(paths);
  await admin.from("disputes").delete().eq("dispute_id", disputeId).eq("status", "draft");
  await audit(admin, user.user_id, "dispute.delete_draft", "dispute", disputeId);
  redirect("/app/disputes");
}

// ---------------------------------------------------------------------------
// Alerts and notifications
// ---------------------------------------------------------------------------
export async function dismissAlert(formData: FormData) {
  const user = await requireUser(["customer"]);
  const admin = createAdminClient();
  const alertId = String(formData.get("alert_id"));
  await admin
    .from("dispute_alerts")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("alert_id", alertId)
    .eq("user_id", user.user_id);
  await audit(admin, user.user_id, "alert.dismiss", "alert", alertId);
  revalidatePath("/app");
}

export async function markNotificationsRead() {
  const user = await requireUser();
  const admin = createAdminClient();
  await admin.from("notifications").update({ is_read: true }).eq("user_id", user.user_id).eq("is_read", false);
  revalidatePath("/app/notifications");
}
