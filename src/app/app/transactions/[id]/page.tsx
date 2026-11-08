import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { startDispute } from "@/app/actions/customer";
import { Card, dateTime, money, Notice, PageTitle, Row, StatusBadge, TxnStatusBadge } from "@/components/ui";
import { isActive } from "@/lib/domain/status";
import type { Dispute, Transaction } from "@/lib/domain/types";

export const metadata = { title: "Transaction" };

export default async function TransactionPage({ params, searchParams }: PageProps<"/app/transactions/[id]">) {
  const user = await requireUser(["customer"]);
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("transactions").select("*").eq("transaction_id", id).eq("user_id", user.user_id).maybeSingle();
  if (!data) notFound();
  const t = data as Transaction;
  const { data: disputes } = await supabase.from("disputes").select("*").eq("transaction_id", id).order("created_at", { ascending: false });
  const list = (disputes as Dispute[]) ?? [];
  const active = list.find((d) => isActive(d.status));

  return (
    <div>
      <PageTitle title={t.merchant_name} back="/app/transactions" />
      {sp.warn === "previous_dispute" && (
        <Notice tone="warn">This transaction already had a dispute that is now closed. Tick the box below to confirm you want to open a new one.</Notice>
      )}
      {sp.error && <Notice tone="error">We could not start the dispute. Please try again.</Notice>}

      <Card>
        <div className="mb-3 text-3xl font-bold tabular">−{money(t.amount, t.currency)}</div>
        <Row label="Status"><TxnStatusBadge status={t.transaction_status} /></Row>
        <Row label="Date">{dateTime(t.transaction_date)}</Row>
        <Row label="Payment method">{t.payment_method.toUpperCase()}</Row>
        <Row label="Account debited">{t.account_debited ? "Yes" : "No"}</Row>
        <Row label="Reference"><span className="font-mono text-xs">{t.reference_number}</span></Row>
        <Row label="Transaction ID"><span className="font-mono text-[10px]">{t.transaction_id}</span></Row>
      </Card>

      {active ? (
        <Card className="mt-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">This transaction is already under dispute</div>
            <StatusBadge status={active.status} />
          </div>
          <p className="mt-1 text-sm text-ink-2">You cannot open a second dispute while this one is active.</p>
          <Link href={`/app/disputes/${active.dispute_id}`} className="btn-secondary mt-3 w-full">View dispute</Link>
        </Card>
      ) : (
        <Card className="mt-4">
          <div className="text-sm font-semibold">Something wrong with this transaction?</div>
          <p className="mt-1 text-sm text-ink-2">We will guide you through it step by step. Your progress is saved as a draft.</p>
          <form action={startDispute} className="mt-3 space-y-2">
            <input type="hidden" name="transaction_id" value={t.transaction_id} />
            {list.length > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="acknowledge_existing" /> I understand a previous dispute was closed
              </label>
            )}
            <button className="btn-primary w-full">Dispute this transaction</button>
            <button name="unrecognised" value="on" className="btn-secondary w-full">I don&apos;t recognise this</button>
          </form>
        </Card>
      )}
    </div>
  );
}
