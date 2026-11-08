import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { saveRule } from "@/app/actions/admin";
import { Badge, Card, Notice, PageTitle, SectionTitle } from "@/components/ui";
import type { DisputeCategory, RoutingRule } from "@/lib/domain/types";

export const metadata = { title: "Routing rules" };

export default async function RulesPage({ searchParams }: PageProps<"/admin/rules">) {
  await requireAdmin();
  const sp = await searchParams;
  const db = createAdminClient();
  const [{ data: rules }, { data: cats }] = await Promise.all([
    db.from("routing_rules").select("*").order("payment_method").order("dispute_category"),
    db.from("dispute_categories").select("*").order("sort_order"),
  ]);
  const categories = (cats as DisputeCategory[]) ?? [];

  return (
    <div>
      <PageTitle title="Routing rules and filing deadlines" subtitle="Deterministic rules decide procedure, reason code, queue and deadline. Card and e-payment rules are separate." />
      <Notice tone="warn">Seeded windows and reason codes are placeholders. Confirm them against the bank&apos;s card scheme procedures and the MAS E-Payments User Protection Guidelines before production use.</Notice>
      {sp.saved && <Notice tone="ok">Rule saved.</Notice>}
      {sp.error && <Notice tone="error">Could not save the rule: {String(sp.error)}</Notice>}

      <div className="space-y-3">
        {((rules as RoutingRule[]) ?? []).map((r) => (
          <RuleForm key={r.rule_id} rule={r} categories={categories} />
        ))}
      </div>
      <SectionTitle>Add a rule</SectionTitle>
      <RuleForm categories={categories} />
    </div>
  );
}

function RuleForm({ rule, categories }: { rule?: RoutingRule; categories: DisputeCategory[] }) {
  return (
    <Card>
      <form action={saveRule} className="grid gap-2 md:grid-cols-6">
        {rule && <input type="hidden" name="rule_id" value={rule.rule_id} />}
        <div className="md:col-span-2">
          <label className="label">Name</label>
          <input name="name" defaultValue={rule?.name} className="input" required />
        </div>
        <div>
          <label className="label">Method</label>
          <select name="payment_method" defaultValue={rule?.payment_method ?? "card"} className="input">
            {["card", "paynow", "fast", "giro"].map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Category</label>
          <select name="dispute_category" defaultValue={rule?.dispute_category ?? "other"} className="input">
            {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Reason code</label>
          <input name="reason_code" defaultValue={rule?.reason_code} className="input" required />
        </div>
        <div>
          <label className="label">Procedure</label>
          <input name="procedure" defaultValue={rule?.procedure ?? "card_chargeback"} className="input" />
        </div>
        <div>
          <label className="label">Window</label>
          <input name="filing_window" type="number" min={1} max={730} defaultValue={rule?.filing_window ?? 120} className="input" />
        </div>
        <div>
          <label className="label">Unit</label>
          <select name="filing_window_unit" defaultValue={rule?.filing_window_unit ?? "days"} className="input">
            <option value="days">Calendar days</option>
            <option value="business_days">Business days</option>
          </select>
        </div>
        <div>
          <label className="label">Queue</label>
          <input name="review_queue" defaultValue={rule?.review_queue ?? "disputes"} className="input" />
        </div>
        <div className="md:col-span-3">
          <label className="label">Required fields (comma separated)</label>
          <input name="required_fields" defaultValue={rule?.required_fields.join(", ") ?? "customer_description"} className="input" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="escalation_required" defaultChecked={rule?.escalation_required} /> Escalate
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={rule?.is_active ?? true} /> Active
        </label>
        <div className="flex items-center gap-2 md:col-span-6">
          <button className="btn-primary">{rule ? "Save" : "Add rule"}</button>
          {rule && !rule.is_active && <Badge>Inactive</Badge>}
        </div>
      </form>
    </Card>
  );
}
