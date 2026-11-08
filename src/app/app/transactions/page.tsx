import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime, Empty, money, PageTitle, TxnStatusBadge } from "@/components/ui";
import type { Transaction } from "@/lib/domain/types";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage({ searchParams }: PageProps<"/app/transactions">) {
  const user = await requireUser(["customer"]);
  const sp = await searchParams;
  const q = String(sp.q ?? "");
  const status = String(sp.status ?? "");
  const from = String(sp.from ?? "");
  const to = String(sp.to ?? "");

  const supabase = await createClient();
  let query = supabase.from("transactions").select("*").eq("user_id", user.user_id).order("transaction_date", { ascending: false });
  if (q) query = query.ilike("merchant_name", `%${q.replace(/[%_]/g, "")}%`);
  if (status) query = query.eq("transaction_status", status);
  if (from) query = query.gte("transaction_date", `${from}T00:00:00+08:00`);
  if (to) query = query.lte("transaction_date", `${to}T23:59:59+08:00`);

  const [{ data }, { data: active }] = await Promise.all([
    query,
    supabase.from("disputes").select("transaction_id").eq("user_id", user.user_id).not("status", "in", "(resolved,rejected)"),
  ]);
  const txns = (data as Transaction[]) ?? [];
  const disputed = new Set((active ?? []).map((d) => d.transaction_id));

  return (
    <div>
      <PageTitle title="Transactions" subtitle="Tap a transaction to see details or raise a dispute." />
      <form className="card mb-4 grid grid-cols-2 gap-2 p-3">
        <input name="q" defaultValue={q} placeholder="Search merchant" className="input col-span-2" />
        <select name="status" defaultValue={status} className="input">
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="reversed">Reversed</option>
        </select>
        <button className="btn-primary">Filter</button>
        <label className="text-xs text-ink-3">
          From
          <input type="date" name="from" defaultValue={from} className="input mt-1" />
        </label>
        <label className="text-xs text-ink-3">
          To
          <input type="date" name="to" defaultValue={to} className="input mt-1" />
        </label>
      </form>

      {txns.length === 0 ? (
        <Empty>No transactions match those filters.</Empty>
      ) : (
        <ul className="card divide-y divide-line">
          {txns.map((t) => (
            <li key={t.transaction_id}>
              <Link href={`/app/transactions/${t.transaction_id}`} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{t.merchant_name}</div>
                  <div className="text-xs text-ink-3">
                    {dateTime(t.transaction_date)} · {t.payment_method.toUpperCase()}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold tabular">−{money(t.amount, t.currency)}</div>
                  {disputed.has(t.transaction_id) ? (
                    <span className="text-[11px] font-semibold text-[#8a5a12]">Under dispute</span>
                  ) : (
                    <TxnStatusBadge status={t.transaction_status} />
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
