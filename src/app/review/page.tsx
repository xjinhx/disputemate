import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime, PageTitle, SectionTitle, Stat, StatusBadge } from "@/components/ui";
import { daysUntil } from "@/lib/domain/routing";
import { isActive } from "@/lib/domain/status";
import type { Dispute } from "@/lib/domain/types";

export const metadata = { title: "Reviewer dashboard" };

export default async function ReviewDashboard() {
  const user = await requireStaff();
  const supabase = await createClient();
  const { data } = await supabase.from("disputes").select("*").neq("status", "draft").order("updated_at", { ascending: false });
  const all = (data as Dispute[]) ?? [];
  const active = all.filter((d) => isActive(d.status));
  const approaching = active.filter((d) => {
    const n = daysUntil(d.filing_deadline);
    return n !== null && n <= 14 && ["pending_review", "info_required", "approved_for_filing"].includes(d.status);
  });

  return (
    <div>
      <PageTitle title={`Hello, ${user.name.split(" ")[0] || "reviewer"}`} subtitle="Every MVP filing needs your approval. AI output is advisory only." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pending review" value={all.filter((d) => d.status === "pending_review").length} tone="accent" />
        <Stat label="Awaiting customer info" value={all.filter((d) => d.status === "info_required").length} />
        <Stat label="Deadline within 14 days" value={approaching.length} tone={approaching.length ? "danger" : undefined} />
        <Stat label="Under investigation" value={all.filter((d) => d.status === "under_investigation" || d.status === "submitted").length} />
      </div>

      {approaching.length > 0 && (
        <>
          <SectionTitle>Approaching deadlines</SectionTitle>
          <CaseList items={approaching} />
        </>
      )}
      <SectionTitle action={<Link href="/review/queue" className="text-sm font-semibold text-brand-2">Open queue</Link>}>Recently updated</SectionTitle>
      <CaseList items={all.slice(0, 8)} />
    </div>
  );
}

function CaseList({ items }: { items: Dispute[] }) {
  if (!items.length) return <div className="card p-6 text-center text-sm text-ink-3">Nothing to show.</div>;
  return (
    <ul className="card divide-y divide-line">
      {items.map((d) => (
        <li key={d.dispute_id}>
          <Link href={`/review/disputes/${d.dispute_id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-paper">
            <span className="font-mono text-xs">{d.submission_reference ?? d.dispute_id.slice(0, 8)}</span>
            <span className="capitalize text-ink-2">{(d.dispute_category ?? "uncategorised").replace("_", " ")}</span>
            <span className="text-xs text-ink-3">Updated {dateTime(d.updated_at)}</span>
            <StatusBadge status={d.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
