export type UserRole = "customer" | "reviewer" | "administrator";
export type PaymentMethod = "card" | "paynow" | "fast" | "giro";
export type TransactionStatus = "success" | "pending" | "failed" | "reversed";

export type DisputeStatus =
  | "draft"
  | "pending_review"
  | "info_required"
  | "approved_for_filing"
  | "submitted"
  | "under_investigation"
  | "resolved"
  | "rejected";

export type DisputeCategoryKey =
  | "unauthorised"
  | "duplicate"
  | "goods_services"
  | "failed_debited"
  | "other";

export interface AppUser {
  user_id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface Transaction {
  transaction_id: string;
  user_id: string;
  merchant_name: string;
  amount: number;
  currency: string;
  transaction_date: string;
  payment_method: PaymentMethod;
  transaction_status: TransactionStatus;
  account_debited: boolean;
  reference_number: string;
}

export interface DisputeCategory {
  key: DisputeCategoryKey;
  label: string;
  description: string;
  is_active: boolean;
  sort_order: number;
}

export interface RoutingRule {
  rule_id: string;
  name: string;
  payment_method: PaymentMethod;
  dispute_category: DisputeCategoryKey;
  reason_code: string;
  procedure: string;
  review_queue: string;
  filing_window: number;
  filing_window_unit: "days" | "business_days";
  required_fields: string[];
  escalation_required: boolean;
  is_active: boolean;
  updated_at: string;
}

export interface AiSummary {
  dispute_category: string;
  transaction_details: string;
  customer_explanation: string;
  evidence_summary: string[];
  missing_information: string[];
  recommended_filing_reason: string;
  suggested_next_steps: string[];
  inconsistencies: string[];
  sources: string[];
}

export interface Dispute {
  dispute_id: string;
  user_id: string;
  transaction_id: string;
  related_transaction_id: string | null;
  dispute_category: DisputeCategoryKey | null;
  customer_description: string;
  category_answers: Record<string, string>;
  ai_recommended_category: DisputeCategoryKey | null;
  ai_category_reasoning: string | null;
  ai_category_confidence: number | null;
  ai_summary: AiSummary | null;
  ai_summary_source: "ai" | "template" | null;
  recommended_reason_code: string | null;
  routing_rule_id: string | null;
  routing_explanation: string | null;
  filing_deadline: string | null;
  requires_human_routing: boolean;
  scam_indicators: string[];
  escalated_to_fraud: boolean;
  status: DisputeStatus;
  assigned_reviewer_id: string | null;
  submission_reference: string | null;
  submitted_at: string | null;
  customer_confirmed_at: string | null;
  decision: string | null;
  decision_reason: string | null;
  decision_explanation: string | null;
  next_steps: string | null;
  created_at: string;
  updated_at: string;
}

export interface Evidence {
  evidence_id: string;
  dispute_id: string;
  file_name: string;
  file_url: string | null;
  storage_path: string | null;
  file_type: string;
  file_size: number | null;
  evidence_source: "customer_upload" | "transaction_record" | "reviewer_upload";
  customer_description: string;
  extracted_text: string | null;
  ai_summary: string | null;
  processing_status: "uploaded" | "processing" | "processed" | "failed";
  uploaded_at: string;
}

export interface StatusHistory {
  history_id: string;
  dispute_id: string;
  previous_status: DisputeStatus | null;
  new_status: DisputeStatus;
  updated_by: string | null;
  action: string;
  remarks: string | null;
  created_at: string;
}

export interface Notification {
  notification_id: string;
  user_id: string;
  dispute_id: string | null;
  notification_type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface DisputeAlert {
  alert_id: string;
  user_id: string;
  alert_type: "duplicate" | "failed_debited" | "unrecognised";
  transaction_id: string;
  related_transaction_id: string | null;
  explanation: string;
  status: "open" | "confirmed" | "dismissed";
  created_at: string;
}
