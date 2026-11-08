import type { DisputeStatus, UserRole } from "./types";

/**
 * Deterministic dispute status machine (PRD 6.2: status transitions must not
 * be delegated to an LLM). Every transition names who may perform it.
 */
export type TransitionAction =
  | "submit_for_review"
  | "resubmit"
  | "approve"
  | "reject"
  | "request_info"
  | "return_for_correction"
  | "file"
  | "start_investigation"
  | "resolve"
  | "reject_after_investigation";

type Actor = "customer" | "staff" | "system";

interface TransitionDef {
  from: DisputeStatus[];
  to: DisputeStatus;
  actor: Actor;
  requiresRemarks?: boolean;
}

export const TRANSITIONS: Record<TransitionAction, TransitionDef> = {
  submit_for_review: { from: ["draft"], to: "pending_review", actor: "customer" },
  resubmit: { from: ["info_required"], to: "pending_review", actor: "customer" },
  approve: { from: ["pending_review"], to: "approved_for_filing", actor: "staff" },
  reject: { from: ["pending_review"], to: "rejected", actor: "staff", requiresRemarks: true },
  request_info: { from: ["pending_review"], to: "info_required", actor: "staff", requiresRemarks: true },
  return_for_correction: { from: ["pending_review"], to: "info_required", actor: "staff", requiresRemarks: true },
  file: { from: ["approved_for_filing"], to: "submitted", actor: "system" },
  start_investigation: { from: ["submitted"], to: "under_investigation", actor: "staff" },
  resolve: { from: ["submitted", "under_investigation"], to: "resolved", actor: "staff", requiresRemarks: true },
  reject_after_investigation: {
    from: ["submitted", "under_investigation"],
    to: "rejected",
    actor: "staff",
    requiresRemarks: true,
  },
};

export class TransitionError extends Error {}

export function actorForRole(role: UserRole): Actor {
  return role === "customer" ? "customer" : "staff";
}

/** Returns the target status or throws if the transition is not allowed. */
export function assertTransition(
  action: TransitionAction,
  current: DisputeStatus,
  actor: Actor,
  remarks?: string | null,
): DisputeStatus {
  const def = TRANSITIONS[action];
  if (!def) throw new TransitionError(`Unknown action ${action}`);
  if (def.actor !== actor) {
    throw new TransitionError(`${actor} cannot perform ${action}`);
  }
  if (!def.from.includes(current)) {
    throw new TransitionError(`Cannot ${action.replace(/_/g, " ")} a dispute that is ${STATUS_LABELS[current]}`);
  }
  if (def.requiresRemarks && !remarks?.trim()) {
    throw new TransitionError("An explanation is required for this action");
  }
  return def.to;
}

export function allowedActions(current: DisputeStatus, actor: Actor): TransitionAction[] {
  return (Object.keys(TRANSITIONS) as TransitionAction[]).filter(
    (a) => TRANSITIONS[a].actor === actor && TRANSITIONS[a].from.includes(current),
  );
}

export const FINAL_STATUSES: DisputeStatus[] = ["resolved", "rejected"];
export const isActive = (s: DisputeStatus) => !FINAL_STATUSES.includes(s);
export const customerCanEdit = (s: DisputeStatus) => s === "draft" || s === "info_required";

export const STATUS_LABELS: Record<DisputeStatus, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  info_required: "Additional Information Required",
  approved_for_filing: "Approved for Filing",
  submitted: "Submitted",
  under_investigation: "Under Investigation",
  resolved: "Resolved",
  rejected: "Rejected",
};

/** Plain-language explanation shown to customers (FR-10). */
export const STATUS_EXPLANATIONS: Record<DisputeStatus, string> = {
  draft: "You have started this dispute but have not sent it to the bank yet.",
  pending_review: "Our dispute team is checking your submission. You do not need to do anything right now.",
  info_required: "We need a bit more information from you before we can continue. Please see the request below.",
  approved_for_filing: "Your dispute has been approved and is being filed.",
  submitted: "Your dispute has been filed. Keep your reference number for any follow-ups.",
  under_investigation: "The bank is investigating your dispute. We will update you when there is news.",
  resolved: "The investigation has concluded. See the decision below.",
  rejected: "This dispute was not successful. See the reason and your options below.",
};

export const PROGRESS_STEPS: DisputeStatus[] = [
  "draft",
  "pending_review",
  "submitted",
  "under_investigation",
  "resolved",
];
