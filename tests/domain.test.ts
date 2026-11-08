import { describe, expect, it } from "vitest";
import { detectDuplicates, detectFailedDebits, runDetection } from "../src/lib/domain/detection";
import { addWindow, routeDispute } from "../src/lib/domain/routing";
import { allowedActions, assertTransition, TransitionError } from "../src/lib/domain/status";
import {
  detectScamIndicators,
  generateSubmissionReference,
  templateSummary,
  validateForSubmission,
} from "../src/lib/domain/rules";
import type { RoutingRule, Transaction } from "../src/lib/domain/types";

const tx = (over: Partial<Transaction>): Transaction => ({
  transaction_id: crypto.randomUUID(),
  user_id: "u1",
  merchant_name: "ABC Store",
  amount: 85,
  currency: "SGD",
  transaction_date: "2026-11-05T10:00:00Z",
  payment_method: "card",
  transaction_status: "success",
  account_debited: true,
  reference_number: crypto.randomUUID(),
  ...over,
});

const rule = (over: Partial<RoutingRule>): RoutingRule => ({
  rule_id: crypto.randomUUID(),
  name: "Card: duplicate",
  payment_method: "card",
  dispute_category: "duplicate",
  reason_code: "CARD-DUP-01",
  procedure: "card_chargeback",
  review_queue: "disputes",
  filing_window: 120,
  filing_window_unit: "days",
  required_fields: ["customer_description", "related_transaction"],
  escalation_required: false,
  is_active: true,
  updated_at: "",
  ...over,
});

describe("duplicate detection (FR-03)", () => {
  it("flags same merchant + amount within the window", () => {
    const a = tx({ transaction_date: "2026-11-05T10:00:00Z" });
    const b = tx({ transaction_date: "2026-11-05T10:04:00Z" });
    const alerts = detectDuplicates([a, b], 30);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].transaction_id).toBe(b.transaction_id);
    expect(alerts[0].related_transaction_id).toBe(a.transaction_id);
    expect(alerts[0].explanation).toContain("4 minutes apart");
  });

  it("ignores charges outside the window, different amounts or failed charges", () => {
    const a = tx({ transaction_date: "2026-11-05T10:00:00Z" });
    expect(detectDuplicates([a, tx({ transaction_date: "2026-11-05T11:00:00Z" })], 30)).toHaveLength(0);
    expect(detectDuplicates([a, tx({ amount: 86, transaction_date: "2026-11-05T10:01:00Z" })], 30)).toHaveLength(0);
    expect(
      detectDuplicates([a, tx({ transaction_status: "failed", transaction_date: "2026-11-05T10:01:00Z" })], 30),
    ).toHaveLength(0);
  });

  it("matches merchants case-insensitively", () => {
    const a = tx({ merchant_name: "ABC  Store" });
    const b = tx({ merchant_name: "abc store", transaction_date: "2026-11-05T10:02:00Z" });
    expect(detectDuplicates([a, b], 30)).toHaveLength(1);
  });

  it("flags failed but debited transactions", () => {
    const f = tx({ transaction_status: "failed", payment_method: "fast" });
    expect(detectFailedDebits([f, tx({ transaction_status: "failed", account_debited: false })])).toHaveLength(1);
  });

  it("respects disabled settings", () => {
    const a = tx({});
    const b = tx({ transaction_date: "2026-11-05T10:01:00Z" });
    expect(runDetection([a, b], { duplicateEnabled: false, failedDebitEnabled: true, duplicateWindowMinutes: 30 })).toHaveLength(0);
  });
});

describe("routing and deadlines (FR-07)", () => {
  const rules = [
    rule({}),
    rule({ name: "FAST: unauthorised", payment_method: "fast", dispute_category: "unauthorised", filing_window: 30, escalation_required: true }),
  ];

  it("matches the card rule and computes the card deadline", () => {
    const r = routeDispute(
      { paymentMethod: "card", category: "duplicate", transactionDate: "2026-11-05T10:00:00Z", transactionStatus: "success", now: new Date("2026-11-08T00:00:00Z") },
      rules,
    );
    expect(r.reasonCode).toBe("CARD-DUP-01");
    expect(r.filingDeadline?.toISOString()).toBe("2027-03-05T10:00:00.000Z");
    expect(r.requiresHumanRouting).toBe(false);
  });

  it("never applies an e-payment rule to a card dispute", () => {
    const r = routeDispute(
      { paymentMethod: "card", category: "unauthorised", transactionDate: "2026-11-05T10:00:00Z", transactionStatus: "success" },
      rules,
    );
    expect(r.rule).toBeNull();
    expect(r.requiresHumanRouting).toBe(true);
  });

  it("escalates when the rule requires it or the window has passed", () => {
    const esc = routeDispute(
      { paymentMethod: "fast", category: "unauthorised", transactionDate: "2026-11-05T10:00:00Z", transactionStatus: "success", now: new Date("2026-11-06") },
      rules,
    );
    expect(esc.requiresHumanRouting).toBe(true);
    const late = routeDispute(
      { paymentMethod: "card", category: "duplicate", transactionDate: "2025-01-01T00:00:00Z", transactionStatus: "success", now: new Date("2026-11-08") },
      rules,
    );
    expect(late.deadlinePassed).toBe(true);
    expect(late.requiresHumanRouting).toBe(true);
  });

  it("counts business days skipping weekends", () => {
    // Friday + 1 business day = Monday
    expect(addWindow(new Date("2026-11-06T00:00:00Z"), 1, "business_days").toISOString()).toBe("2026-11-09T00:00:00.000Z");
  });
});

describe("status machine (6.2)", () => {
  it("allows the happy path", () => {
    expect(assertTransition("submit_for_review", "draft", "customer")).toBe("pending_review");
    expect(assertTransition("approve", "pending_review", "staff")).toBe("approved_for_filing");
    expect(assertTransition("file", "approved_for_filing", "system")).toBe("submitted");
    expect(assertTransition("resolve", "under_investigation", "staff", "Refunded")).toBe("resolved");
  });

  it("blocks customers from approving and filing without approval", () => {
    expect(() => assertTransition("approve", "pending_review", "customer")).toThrow(TransitionError);
    expect(() => assertTransition("file", "pending_review", "system")).toThrow(TransitionError);
  });

  it("requires remarks for rejections", () => {
    expect(() => assertTransition("reject", "pending_review", "staff", "")).toThrow(/explanation/);
  });

  it("lists allowed reviewer actions", () => {
    expect(allowedActions("pending_review", "staff")).toEqual(
      expect.arrayContaining(["approve", "reject", "request_info", "return_for_correction"]),
    );
  });
});

describe("rules", () => {
  it("detects scam indicators", () => {
    const found = detectScamIndicators("Someone called me saying they were from the bank and I gave them the OTP", {
      shared_credentials: "yes",
    });
    expect(found.length).toBeGreaterThanOrEqual(3);
  });

  it("validates mandatory fields", () => {
    const res = validateForSubmission(
      { dispute_category: "duplicate", customer_description: "short", category_answers: {}, related_transaction_id: null },
      0,
      ["customer_description", "related_transaction"],
      false,
    );
    expect(res.ok).toBe(false);
    expect(res.missing).toEqual(
      expect.arrayContaining(["customer_description", "single_purchase", "related_transaction", "customer_confirmation"]),
    );
    const ok = validateForSubmission(
      {
        dispute_category: "duplicate",
        customer_description: "I was charged twice for the same purchase at ABC Store.",
        category_answers: { single_purchase: "yes" },
        related_transaction_id: "x",
      },
      0,
      ["customer_description", "related_transaction"],
      true,
    );
    expect(ok.ok).toBe(true);
  });

  it("generates well-formed references", () => {
    expect(generateSubmissionReference(new Date("2026-11-08T00:00:00Z"), () => 0)).toBe("DM-261108-AAAAAA");
  });

  it("template summary only restates known facts", () => {
    const t = tx({});
    const s = templateSummary(
      { dispute_category: "duplicate", customer_description: "Charged twice", category_answers: {} },
      "Duplicate charge",
      t,
      null,
      [],
      ["evidence"],
    );
    expect(s.customer_explanation).toBe("Charged twice");
    expect(s.missing_information).toEqual(["At least one supporting document"]);
    expect(s.transaction_details).toContain(t.reference_number);
  });
});
