import type { DisputeCategoryKey, PaymentMethod, RoutingRule, TransactionStatus } from "./types";

/**
 * FR-07 deterministic routing and deadline engine. No LLM involvement.
 * Card disputes and e-payment disputes are matched to their own rules, so an
 * e-payment filing window is never applied to a card dispute.
 */
export interface RoutingInput {
  paymentMethod: PaymentMethod;
  category: DisputeCategoryKey;
  transactionDate: string | Date;
  transactionStatus: TransactionStatus;
  now?: Date;
}

export interface RoutingResult {
  rule: RoutingRule | null;
  reasonCode: string | null;
  procedure: string;
  reviewQueue: string;
  filingDeadline: Date | null;
  deadlinePassed: boolean;
  requiresHumanRouting: boolean;
  requiredFields: string[];
  explanation: string;
}

export function addWindow(start: Date, amount: number, unit: "days" | "business_days"): Date {
  const d = new Date(start.getTime());
  if (unit === "days") {
    d.setUTCDate(d.getUTCDate() + amount);
    return d;
  }
  // Business days: skips Saturdays and Sundays. Public holidays are not
  // modelled in the prototype; add a holiday calendar before production.
  let added = 0;
  while (added < amount) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

export function routeDispute(input: RoutingInput, rules: RoutingRule[]): RoutingResult {
  const now = input.now ?? new Date();
  const matches = rules.filter(
    (r) => r.is_active && r.payment_method === input.paymentMethod && r.dispute_category === input.category,
  );

  if (matches.length !== 1) {
    return {
      rule: null,
      reasonCode: null,
      procedure: "manual_assessment",
      reviewQueue: "disputes",
      filingDeadline: null,
      deadlinePassed: false,
      requiresHumanRouting: true,
      requiredFields: ["customer_description"],
      explanation:
        matches.length === 0
          ? `No active routing rule for ${input.paymentMethod.toUpperCase()} + ${input.category}. Escalated to a reviewer to decide the procedure.`
          : `Multiple routing rules match ${input.paymentMethod.toUpperCase()} + ${input.category}. Escalated to a reviewer.`,
    };
  }

  const rule = matches[0];
  const deadline = addWindow(new Date(input.transactionDate), rule.filing_window, rule.filing_window_unit);
  const deadlinePassed = deadline.getTime() < now.getTime();
  const unitLabel = rule.filing_window_unit === "days" ? "calendar days" : "business days";

  return {
    rule,
    reasonCode: rule.reason_code,
    procedure: rule.procedure,
    reviewQueue: rule.review_queue,
    filingDeadline: deadline,
    deadlinePassed,
    requiresHumanRouting: rule.escalation_required || deadlinePassed,
    requiredFields: rule.required_fields,
    explanation:
      `Matched rule "${rule.name}" (reason code ${rule.reason_code}, procedure ${rule.procedure}). ` +
      `Filing window is ${rule.filing_window} ${unitLabel} from the transaction date.` +
      (rule.escalation_required ? " This rule requires reviewer escalation." : "") +
      (deadlinePassed ? " The configured filing window has passed, so a reviewer must assess it." : ""),
  };
}

export function daysUntil(deadline: string | Date | null, now = new Date()): number | null {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline).getTime() - now.getTime()) / 86_400_000);
}
