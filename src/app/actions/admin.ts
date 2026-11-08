"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

const PAYMENT_METHODS = ["card", "paynow", "fast", "giro"];
const ROLES = ["customer", "reviewer", "administrator"];

export async function saveRule(formData: FormData) {
  const admin = await requireAdmin();
  const db = createAdminClient();
  const ruleId = String(formData.get("rule_id") ?? "") || null;
  const window = Number(formData.get("filing_window"));
  const paymentMethod = String(formData.get("payment_method"));
  if (!Number.isInteger(window) || window <= 0 || window > 730) redirect("/admin/rules?error=window");
  if (!PAYMENT_METHODS.includes(paymentMethod)) redirect("/admin/rules?error=method");

  const row = {
    name: String(formData.get("name") ?? "").slice(0, 120),
    payment_method: paymentMethod,
    dispute_category: String(formData.get("dispute_category")),
    reason_code: String(formData.get("reason_code") ?? "").slice(0, 40),
    procedure: String(formData.get("procedure") ?? "manual_assessment").slice(0, 60),
    review_queue: String(formData.get("review_queue") ?? "disputes").slice(0, 40),
    filing_window: window,
    filing_window_unit: formData.get("filing_window_unit") === "business_days" ? "business_days" : "days",
    required_fields: String(formData.get("required_fields") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    escalation_required: formData.get("escalation_required") === "on",
    is_active: formData.get("is_active") === "on",
  };

  const { error } = ruleId
    ? await db.from("routing_rules").update(row).eq("rule_id", ruleId)
    : await db.from("routing_rules").insert(row);
  if (error) redirect("/admin/rules?error=" + encodeURIComponent(error.message));
  await audit(db, admin.user_id, ruleId ? "routing_rule.update" : "routing_rule.create", "routing_rule", ruleId, row);
  redirect("/admin/rules?saved=1");
}

export async function saveDetection(formData: FormData) {
  const admin = await requireAdmin();
  const db = createAdminClient();
  const minutes = Number(formData.get("window_minutes"));
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 10080) redirect("/admin?error=window");
  const updates = [
    { key: "duplicate_detection", value: { window_minutes: minutes, enabled: formData.get("duplicate_enabled") === "on" } },
    { key: "failed_debit_detection", value: { enabled: formData.get("failed_enabled") === "on" } },
  ];
  await db.from("system_settings").upsert(updates.map((u) => ({ ...u, updated_at: new Date().toISOString() })));
  await audit(db, admin.user_id, "settings.detection", "system_settings", null, { updates });
  redirect("/admin?saved=1");
}

export async function saveCategory(formData: FormData) {
  const admin = await requireAdmin();
  const db = createAdminClient();
  const key = String(formData.get("key"));
  const row = {
    label: String(formData.get("label") ?? "").slice(0, 80),
    description: String(formData.get("description") ?? "").slice(0, 300),
    is_active: formData.get("is_active") === "on",
  };
  await db.from("dispute_categories").update(row).eq("key", key);
  await audit(db, admin.user_id, "category.update", "dispute_category", key, row);
  redirect("/admin/categories?saved=1");
}

export async function setRole(formData: FormData) {
  const admin = await requireAdmin();
  const db = createAdminClient();
  const userId = String(formData.get("user_id"));
  const role = String(formData.get("role"));
  if (!ROLES.includes(role)) redirect("/admin/users?error=role");
  if (userId === admin.user_id) redirect("/admin/users?error=self");
  await db.from("users").update({ role }).eq("user_id", userId);
  await audit(db, admin.user_id, "user.set_role", "user", userId, { role });
  redirect("/admin/users?saved=1");
}
