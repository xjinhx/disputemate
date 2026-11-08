import type { AiSummary, Dispute, DisputeCategoryKey, Evidence, Transaction } from "./types";

// ---------------------------------------------------------------------------
// Category-specific questions (FR-04)
// ---------------------------------------------------------------------------
export interface CategoryQuestion {
  id: string;
  label: string;
  type: "yesno" | "text";
  required: boolean;
}

export const CATEGORY_QUESTIONS: Record<DisputeCategoryKey, CategoryQuestion[]> = {
  unauthorised: [
    { id: "card_in_possession", label: "Is your card still with you?", type: "yesno", required: true },
    {
      id: "shared_credentials",
      label: "Did you share an OTP, password or card details with anyone, or install an app someone asked you to?",
      type: "yesno",
      required: true,
    },
    { id: "contacted_by_someone", label: "Did anyone contact you about this payment before it happened?", type: "yesno", required: false },
  ],
  duplicate: [
    { id: "single_purchase", label: "Did you make only one purchase at this merchant at that time?", type: "yesno", required: true },
    { id: "merchant_contacted", label: "Have you contacted the merchant about the extra charge?", type: "yesno", required: false },
  ],
  goods_services: [
    { id: "merchant_contacted", label: "Have you contacted the merchant to resolve this?", type: "yesno", required: true },
    { id: "expected_date", label: "When did you expect to receive the goods or service?", type: "text", required: false },
  ],
  failed_debited: [
    { id: "recipient_received", label: "Has the recipient confirmed they did not receive the money?", type: "yesno", required: false },
  ],
  other: [],
};

// ---------------------------------------------------------------------------
// Scam indicators (PRD 6.4: scam indicators must trigger human escalation)
// ---------------------------------------------------------------------------
const SCAM_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "Customer mentions sharing an OTP or code", re: /\b(otp|one[- ]time (password|pin|code)|verification code)\b/i },
  { label: "Customer mentions a caller posing as bank, police or government", re: /\b(called|caller|phone call|whatsapp|telegram).{0,60}\b(bank|police|mas|government|ica|customs|officer)\b/i },
  { label: "Customer mentions installing an app or remote access", re: /\b(installed|download(ed)?|apk|anydesk|teamviewer|remote access)\b/i },
  { label: "Customer mentions an investment or job offer", re: /\b(investment|crypto|job offer|task|commission|guaranteed returns?)\b/i },
  { label: "Customer mentions being asked to transfer money urgently", re: /\b(urgent(ly)?|safe account|asked me to transfer)\b/i },
];

export function detectScamIndicators(text: string, answers: Record<string, string> = {}): string[] {
  const found = SCAM_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label);
  if (answers.shared_credentials === "yes") found.push("Customer shared credentials or installed an app at someone's request");
  if (answers.contacted_by_someone === "yes") found.push("Customer was contacted by someone before the payment");
  return Array.from(new Set(found));
}

// ---------------------------------------------------------------------------
// Mandatory field validation (deterministic, PRD 6.2)
// ---------------------------------------------------------------------------
export interface ValidationResult {
  ok: boolean;
  missing: string[];
}

export const FIELD_LABELS: Record<string, string> = {
  dispute_category: "Dispute category",
  customer_description: "Description of the issue (at least 20 characters)",
  related_transaction: "The matching original charge",
  merchant_contacted: "Whether you contacted the merchant",
  card_in_possession: "Whether your card is still with you",
  shared_credentials: "Whether you shared credentials",
  evidence: "At least one supporting document",
  single_purchase: "Whether you made only one purchase",
  customer_confirmation: "Confirmation that the information is accurate",
};

export function validateForSubmission(
  dispute: Pick<Dispute, "dispute_category" | "customer_description" | "category_answers" | "related_transaction_id">,
  evidenceCount: number,
  requiredFields: string[],
  confirmed: boolean,
): ValidationResult {
  const missing: string[] = [];
  if (!dispute.dispute_category) missing.push("dispute_category");
  if ((dispute.customer_description ?? "").trim().length < 20) missing.push("customer_description");

  const answers = dispute.category_answers ?? {};
  if (dispute.dispute_category) {
    for (const q of CATEGORY_QUESTIONS[dispute.dispute_category] ?? []) {
      if (q.required && !answers[q.id]?.trim()) missing.push(q.id);
    }
  }
  for (const f of requiredFields) {
    if (f === "customer_description" || missing.includes(f)) continue;
    if (f === "evidence" && evidenceCount === 0) missing.push("evidence");
    else if (f === "related_transaction" && dispute.dispute_category === "duplicate" && !dispute.related_transaction_id)
      missing.push("related_transaction");
    else if (!["evidence", "related_transaction"].includes(f) && f in FIELD_LABELS && !answers[f]?.trim())
      missing.push(f);
  }
  if (!confirmed) missing.push("customer_confirmation");
  return { ok: missing.length === 0, missing: Array.from(new Set(missing)) };
}

// ---------------------------------------------------------------------------
// Submission reference (FR-09)
// ---------------------------------------------------------------------------
export function generateSubmissionReference(now = new Date(), random = Math.random): string {
  const y = now.getUTCFullYear().toString().slice(2);
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(random() * alphabet.length)];
  return `DM-${y}${m}${d}-${code}`;
}

// ---------------------------------------------------------------------------
// Deterministic fallback summary, used when AI is unavailable (PRD 8.3).
// Only restates known facts, never invents anything.
// ---------------------------------------------------------------------------
export function templateSummary(
  dispute: Pick<Dispute, "dispute_category" | "customer_description" | "category_answers">,
  categoryLabel: string,
  txn: Transaction,
  related: Transaction | null,
  evidence: Pick<Evidence, "file_name" | "customer_description">[],
  missing: string[],
): AiSummary {
  const fmt = (t: Transaction) =>
    `${t.merchant_name}, ${t.currency} ${Number(t.amount).toFixed(2)}, ${new Date(t.transaction_date).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })} (ref ${t.reference_number})`;

  const evidenceLines = evidence.map((e) => `Customer upload: ${e.file_name}${e.customer_description ? ` (${e.customer_description})` : ""}`);
  if (related) evidenceLines.unshift(`Transaction record: matching charge ${fmt(related)}`);
  evidenceLines.unshift(`Transaction record: ${fmt(txn)}`);

  return {
    dispute_category: categoryLabel,
    transaction_details: fmt(txn),
    customer_explanation: dispute.customer_description.trim(),
    evidence_summary: evidenceLines,
    missing_information: missing.map((m) => FIELD_LABELS[m] ?? m),
    recommended_filing_reason: `${categoryLabel} reported by customer. Requires reviewer assessment.`,
    suggested_next_steps: [
      "Check that the details above are correct before submitting.",
      "A bank reviewer will assess the dispute after you submit it.",
    ],
    inconsistencies: [],
    sources: ["transaction_record", ...evidence.map((e) => `evidence:${e.file_name}`)],
  };
}
