import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { syncAlerts } from "@/lib/disputes";
import { dismissAlert, startDispute } from "@/app/actions/customer";
import { Card, dateTime, Empty, money, SectionTitle, StatusBadge, TxnStatusBadge } from "@/components/ui";
import { isActive } from "@/lib/domain/status";
import type { Dispute, DisputeAlert, Transaction } from "@/lib/domain/types";

export const metadata = { title: "Home" };

export default async function HomePage() {
  const user = await requireUser(["customer"]);
  await syncAlerts(createAdminClient(), user.user_id);
  const supabase = await createClient();

  const [{ data: txns }, { data: alerts }, { data: disputes }, { data: notes }] = await Promise.all([
    supabase.from("transactions").select("*").eq("user_id", user.user_id).order("transaction_date", { ascending: false }),
    supabase.from("dispute_alerts").select("*").eq("user_id", user.user_id).eq("status", "open").order("created_at"),
    supabase.from("disputes").select("*").eq("user_id", user.user_id).order("updated_at", { ascending: false }),
    supabase.from("notifications").select("*").eq("user_id", user.user_id).order("created_at", { ascending: false }).limit(3),
  ]);
  const transactions = (txns as Transaction[]) ?? [];
  const byId = new Map(transactions.map((t) => [t.transaction_id, t]));
  const all = (disputes as Dispute[]) ?? [];
  const active = all.filter((d) => isActive(d.status));
  const disputedTx = new Set(active.map((d) => d.transaction_id));
  const actionNeeded = active.filter((d) => d.status === "info_required" || d.status === "draft");
  const openAlerts = ((alerts as DisputeAlert[]) ?? []).filter((a) => !disputedTx.has(a.transaction_id));

  return (
    <div>
      <section className="rounded-2xl bg-brand p-5 text-white">
        <p className="text-sm text-white/70">Welcome back</p>
        <h1 className="text-2xl font-bold">{user.name || "there"}</h1>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Link href="/app/disputes" className="rounded-xl bg-white/10 p-3 hover:bg-white/15">
            <div className="text-2xl font-bold tabular">{active.length}</div>
            <div className="text-white/70">Active disputes</div>
          </Link>
          <Link href="/app/disputes" className="rounded-xl bg-white/10 p-3 hover:bg-white/15">
            <div className="text-2xl font-bold tabular">{actionNeeded.length}</div>
            <div className="text-white/70">Need your action</div>
          </Link>
        </div>
      </section>

      {openAlerts.length > 0 && (
        <>
          <SectionTitle>Worth a check</SectionTitle>
          <div className="space-y-3">
            {openAlerts.map((a) => (
              <AlertCard key={a.alert_id} alert={a} txn={byId.get(a.transaction_id)} related={a.related_transaction_id ? byId.get(a.related_transaction_id) : undefined} />
            ))}
          </div>
        </>
      )}

      {actionNeeded.length > 0 && (
        <>
          <SectionTitle>Action needed</SectionTitle>
          <div className="space-y-2">
            {actionNeeded.map((d) => (
              <Link key={d.dispute_id} href={`/app/disputes/${d.dispute_id}`} className="card flex items-center justify-between p-3">
                <div>
                  <div className="text-sm font-semibold">{byId.get(d.transaction_id)?.merchant_name}</div>
                  <div className="text-xs text-ink-3">{d.status === "draft" ? "Finish and submit your dispute" : "The bank needs more information"}</div>
                </div>
                <StatusBadge status={d.status} />
              </Link>
            ))}
          </div>
        </>
      )}

      <SectionTitle action={<Link href="/app/transactions" className="text-sm font-semibold text-brand-2">See all</Link>}>
        Recent transactions
      </SectionTitle>
      <Card className="p-0">
        <ul>
          {transactions.slice(0, 5).map((t) => (
            <li key={t.transaction_id} className="border-b border-line last:border-0">
              <Link href={`/app/transactions/${t.transaction_id}`} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm font-semibold">{t.merchant_name}</div>
                  <div className="text-xs text-ink-3">{dateTime(t.transaction_date)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular">−{money(t.amount, t.currency)}</div>
                  {disputedTx.has(t.transaction_id) ? <span className="text-[11px] font-semibold text-accent">Under dispute</span> : <TxnStatusBadge status={t.transaction_status} />}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <SectionTitle action={<Link href="/app/notifications" className="text-sm font-semibold text-brand-2">All updates</Link>}>
        Latest updates
      </SectionTitle>
      {notes?.length ? (
        <div className="space-y-2">
          {notes.map((n) => (
            <Link key={n.notification_id} href={n.dispute_id ? `/app/disputes/${n.dispute_id}` : "/app"} className="card block p-3">
              <div className="text-sm font-semibold">{n.title}</div>
              <div className="text-xs text-ink-2">{n.message}</div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty>No updates yet.</Empty>
      )}
    </div>
  );
}

function AlertCard({ alert, txn, related }: { alert: DisputeAlert; txn?: Transaction; related?: Transaction }) {
  if (!txn) return null;
  const title = alert.alert_type === "duplicate" ? "Possible duplicate charge" : "Failed transfer, money debited";
  return (
    <Card className="border-[#f0d7a8] bg-accent-soft/50">
      <div className="text-sm font-bold">{title}</div>
      <p className="mt-1 text-sm text-ink-2">{alert.explanation}</p>
      <ul className="mt-3 space-y-1.5">
        {[related, txn].filter(Boolean).map((t) => (
          <li key={t!.transaction_id} className="flex justify-between rounded-lg bg-card px-3 py-2 text-xs">
            <span>
              <span className="font-semibold">{t!.merchant_name}</span> · {dateTime(t!.transaction_date)}
            </span>
            <span className="font-semibold tabular">{money(t!.amount, t!.currency)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-3">We never file a dispute automatically. Please confirm what happened.</p>
      <div className="mt-3 flex gap-2">
        <form action={startDispute} className="flex-1">
          <input type="hidden" name="transaction_id" value={txn.transaction_id} />
          <input type="hidden" name="alert_id" value={alert.alert_id} />
          <button className="btn-primary w-full">{alert.alert_type === "duplicate" ? "Yes, it's a duplicate" : "Start a dispute"}</button>
        </form>
        <form action={dismissAlert}>
          <input type="hidden" name="alert_id" value={alert.alert_id} />
          <button className="btn-secondary">{alert.alert_type === "duplicate" ? "Both are mine" : "Dismiss"}</button>
        </form>
      </div>
    </Card>
  );
}
