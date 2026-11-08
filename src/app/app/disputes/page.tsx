import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime, Empty, money, PageTitle, SectionTitle, StatusBadge } from "@/components/ui";
import { isActive } from "@/lib/domain/status";
import type { Dispute, Transaction } from "@/lib/domain/types";

export const metadata = { title: "My disputes" };

export default async function DisputesPage() {
  const user = await requireUser(["customer"]);
  const supabase = await createClient();
  const { data } = await supabase.from("disputes").select("*").eq("user_id", user.user_id).order("updated_at", { ascending: false });
  const disputes = (data as Dispute[]) ?? [];
  const ids = disputes.map((d) => d.transaction_id);
  const { data: txns } = ids.length ? await supabase.from("transactions").select("*").in("transaction_id", ids) : { data: [] };
  const byId = new Map(((txns as Transaction[]) ?? []).map((t) => [t.transaction_id, t]));

  const active = disputes.filter((d) => isActive(d.status));
  const closed = disputes.filter((d) => !isActive(d.status));

  return (
    <div>
      <PageTitle title="My disputes" subtitle="Track every dispute in one place." />
      <SectionTitle>Active</SectionTitle>
      {active.length ? <List items={active} byId={byId} /> : <Empty>No active disputes. Start one from a transaction.</Empty>}
      <SectionTitle>Resolved and closed</SectionTitle>
      {closed.length ? <List items={closed} byId={byId} /> : <Empty>Nothing here yet.</Empty>}
      <Link href="/app/transactions" className="btn-secondary mt-6 w-full">Start a new dispute</Link>
    </div>
  );
}

function List({ items, byId }: { items: Dispute[]; byId: Map<string, Transaction> }) {
  return (
    <ul className="space-y-2">
      {items.map((d) => {
        const t = byId.get(d.transaction_id);
        return (
          <li key={d.dispute_id}>
            <Link href={`/app/disputes/${d.dispute_id}`} className="card block p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{t?.merchant_name}</div>
                  <div className="text-xs text-ink-3">{t && money(t.amount, t.currency)} · {d.submission_reference ?? "No reference yet"}</div>
                </div>
                <StatusBadge status={d.status} />
              </div>
              <div className="mt-2 text-[11px] text-ink-3">Updated {dateTime(d.updated_at)}</div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
