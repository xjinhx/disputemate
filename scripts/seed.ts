/**
 * Creates demo accounts (customer, reviewer, administrator) and one sample
 * dispute waiting for review. Run after applying the migrations:
 *
 *   DEMO_PASSWORD='choose-a-strong-one' npm run seed
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
 * The password is never stored in the repo.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_PASSWORD;
const domain = process.env.DEMO_EMAIL_DOMAIN ?? "demo.disputemate.app";

if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
if (!password || password.length < 10) throw new Error("Set DEMO_PASSWORD (at least 10 characters)");

const db = createClient(url, key, { auth: { persistSession: false } });

const accounts = [
  { email: `customer@${domain}`, name: "Tan Mei Ling", role: "customer" },
  { email: `reviewer@${domain}`, name: "Rahul Nair", role: "reviewer" },
  { email: `admin@${domain}`, name: "Siti Rahman", role: "administrator" },
] as const;

async function ensureUser(a: (typeof accounts)[number]) {
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
  let user = list?.users.find((u) => u.email === a.email);
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({
      email: a.email,
      password,
      email_confirm: true,
      user_metadata: { name: a.name },
    });
    if (error) throw error;
    user = data.user!;
    console.log(`created ${a.email}`);
  } else {
    await db.auth.admin.updateUserById(user.id, { password });
    console.log(`exists  ${a.email} (password reset)`);
  }
  await db.from("users").update({ role: a.role, name: a.name }).eq("user_id", user.id);
  return user.id;
}

async function main() {
  const ids: Record<string, string> = {};
  for (const a of accounts) ids[a.role] = await ensureUser(a);

  // Sample case for the reviewer queue: an unrecognised overseas charge.
  const { data: txn } = await db
    .from("transactions")
    .select("*")
    .eq("user_id", ids.customer)
    .eq("merchant_name", "XYZ*DIGITALGOODS HK")
    .single();
  if (!txn) return;
  const { count } = await db.from("disputes").select("dispute_id", { count: "exact", head: true }).eq("transaction_id", txn.transaction_id);
  if (count) return console.log("sample dispute already present");

  const { data: rule } = await db.from("routing_rules").select("*").eq("payment_method", "card").eq("dispute_category", "unauthorised").eq("is_active", true).single();
  const deadline = new Date(new Date(txn.transaction_date).getTime() + (rule?.filing_window ?? 120) * 86_400_000);
  const description = "I don't recognise this charge. My card has been with me the whole time and I have never bought from this merchant.";
  const { data: d } = await db
    .from("disputes")
    .insert({
      user_id: ids.customer,
      transaction_id: txn.transaction_id,
      dispute_category: "unauthorised",
      customer_description: description,
      category_answers: { card_in_possession: "yes", shared_credentials: "no", contacted_by_someone: "no" },
      ai_summary: {
        dispute_category: "Unauthorised transaction",
        transaction_details: `${txn.merchant_name}, SGD ${Number(txn.amount).toFixed(2)}, ref ${txn.reference_number}`,
        customer_explanation: description,
        evidence_summary: [`Bank record: card payment to ${txn.merchant_name} for SGD ${Number(txn.amount).toFixed(2)}`],
        missing_information: [],
        recommended_filing_reason: "Customer reports the card payment was not authorised while the card remained in their possession.",
        suggested_next_steps: ["Reviewer to check device and authentication logs", "Consider blocking and reissuing the card"],
        inconsistencies: [],
        sources: ["transaction_record"],
      },
      ai_summary_source: "template",
      routing_rule_id: rule?.rule_id ?? null,
      recommended_reason_code: rule?.reason_code ?? null,
      routing_explanation: rule ? `Matched rule "${rule.name}". Seeded sample case.` : "No rule found",
      filing_deadline: deadline.toISOString(),
      requires_human_routing: rule?.escalation_required ?? true,
      status: "pending_review",
      customer_confirmed_at: new Date().toISOString(),
    })
    .select("dispute_id")
    .single();
  if (d) {
    await db.from("dispute_status_history").insert([
      { dispute_id: d.dispute_id, previous_status: null, new_status: "draft", updated_by: ids.customer, action: "create", remarks: "Started by customer" },
      { dispute_id: d.dispute_id, previous_status: "draft", new_status: "pending_review", updated_by: ids.customer, action: "submit_for_review", remarks: "Submitted by customer" },
    ]);
    console.log("created sample pending dispute");
  }
}

main().then(
  () => console.log(`\nDemo logins: ${accounts.map((a) => a.email).join(", ")} (password from DEMO_PASSWORD)`),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
