import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, cx, dateTime, money, PageTitle, StatusBadge } from "@/components/ui";
import { daysUntil } from "@/lib/domain/routing";
import { STATUS_LABELS } from "@/lib/domain/status";
import type { Dispute, DisputeStatus, Transaction } from "@/lib/domain/types";

export const metadata = { title: "Dispute queue" };

type Row = Dispute & { txn: Transaction | null; customer: { name: string; email: string } | null };

function priority(d: Row): { score: number; label: string; tone: "danger" | "accent" | "neutral" } {
  const days = daysUntil(d.filing_deadline);
  if (d.escalated_to_fraud || d.scam_indicators.length) return { score: 3, label: "Fraud risk", tone: "danger" };
  if (days !== null && days <= 7) return { score: 3, label: "Deadline soon", tone: "danger" };
  if (d.requires_human_routing) return { score: 2, label: "Needs routing", tone: "accent" };
  if (days !== null && days <= 30) return { score: 1, label: "Normal", tone: "neutral" };
  return { score: 0, label: "Normal", tone: "neutral" };
}

export default async function QueuePage({ searchParams }: PageProps<"/review/queue">) {
  await requireStaff();
  const sp = await searchParams;
  const status = String(sp.status ?? "pending_review");
  const category = String(sp.category ?? "");
  const q = String(sp.q ?? "").trim().toLowerCase();
  const sort = String(sp.sort ?? "deadline");

  const supabase = await createClient();
  let query = supabase
    .from("disputes")
    .select("*, txn:transactions!disputes_transaction_id_fkey(*), customer:users!disputes_user_id_fkey(name, email)")
    .neq("status", "draft");
  if (status !== "all") query = query.eq("status", status);
  if (category) query = query.eq("dispute_category", category);
  const { data } = await query;
  let rows = ((data as Row[]) ?? []).filter(
    (d) =>
      !q ||
      d.submission_reference?.toLowerCase().includes(q) ||
      d.txn?.merchant_name.toLowerCase().includes(q) ||
      d.customer?.email.toLowerCase().includes(q) ||
      d.dispute_id.startsWith(q),
  );
  rows = rows.sort((a, b) => {
    if (sort === "amount") return Number(b.txn?.amount ?? 0) - Number(a.txn?.amount ?? 0);
    if (sort === "submitted") return +new Date(a.customer_confirmed_at ?? a.created_at) - +new Date(b.customer_confirmed_at ?? b.created_at);
    if (sort === "priority") return priority(b).score - priority(a).score;
    return +new Date(a.filing_deadline ?? "2999-01-01") - +new Date(b.filing_deadline ?? "2999-01-01");
  });

  const statuses: (DisputeStatus | "all")[] = ["pending_review", "info_required", "approved_for_filing", "submitted", "under_investigation", "resolved", "rejected", "all"];

  return (
    <div>
      <PageTitle title="Dispute queue" />
      <form className="card mb-4 grid gap-2 p-3 sm:grid-cols-5">
        <input name="q" defaultValue={q} placeholder="Reference, merchant or email" className="input sm:col-span-2" />
        <select name="status" defaultValue={status} className="input">
          {statuses.map((s) => (
            <option key={s} value={s}>{s === "all" ? "All statuses" : STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select name="category" defaultValue={category} className="input">
          <option value="">All categories</option>
          <option value="unauthorised">Unauthorised</option>
          <option value="duplicate">Duplicate</option>
          <option value="goods_services">Goods or services</option>
          <option value="failed_debited">Failed, debited</option>
          <option value="other">Other</option>
        </select>
        <div className="flex gap-2">
          <select name="sort" defaultValue={sort} className="input">
            <option value="deadline">Deadline</option>
            <option value="priority">Priority</option>
            <option value="submitted">Oldest first</option>
            <option value="amount">Amount</option>
          </select>
          <button className="btn-primary">Go</button>
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-3">
            <tr>
              <th className="px-4 py-2">Case</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2">Submitted</th>
              <th className="px-4 py-2">Deadline</th>
              <th className="px-4 py-2">Priority</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((d) => {
              const p = priority(d);
              const days = daysUntil(d.filing_deadline);
              return (
                <tr key={d.dispute_id} className="hover:bg-paper">
                  <td className="px-4 py-3">
                    <Link href={`/review/disputes/${d.dispute_id}`} className="font-semibold text-brand-2 underline-offset-2 hover:underline">
                      {d.txn?.merchant_name}
                    </Link>
                    <div className="font-mono text-[11px] text-ink-3">{d.submission_reference ?? d.dispute_id.slice(0, 8)} · {d.customer?.email}</div>
                  </td>
                  <td className="px-4 py-3 capitalize">{(d.dispute_category ?? "none").replace("_", " ")}</td>
                  <td className="px-4 py-3 text-right tabular">{d.txn && money(d.txn.amount, d.txn.currency)}</td>
                  <td className="px-4 py-3 text-xs">{dateTime(d.customer_confirmed_at ?? d.created_at, "date")}</td>
                  <td className={cx("px-4 py-3 text-xs", days !== null && days <= 14 && "font-semibold text-danger")}>
                    {d.filing_deadline ? `${dateTime(d.filing_deadline, "date")} (${days}d)` : "Needs routing"}
                  </td>
                  <td className="px-4 py-3"><Badge tone={p.tone}>{p.label}</Badge></td>
                  <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-3">No disputes match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
