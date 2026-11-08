import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { loadDetectionSettings } from "@/lib/disputes";
import { saveDetection } from "@/app/actions/admin";
import { Card, Notice, PageTitle, SectionTitle, Stat } from "@/components/ui";
import { STATUS_LABELS } from "@/lib/domain/status";
import type { DisputeStatus } from "@/lib/domain/types";

export const metadata = { title: "Administration" };

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  const sp = await searchParams;
  const db = createAdminClient();
  const [{ data: disputes }, { data: ai }, settings, { count: alertsTotal }, { count: alertsDismissed }] = await Promise.all([
    db.from("disputes").select("status, dispute_category, ai_recommended_category, ai_summary_source"),
    db.from("ai_requests").select("task, succeeded, latency_ms").order("created_at", { ascending: false }).limit(500),
    loadDetectionSettings(db),
    db.from("dispute_alerts").select("alert_id", { count: "exact", head: true }),
    db.from("dispute_alerts").select("alert_id", { count: "exact", head: true }).eq("status", "dismissed"),
  ]);
  const ds = disputes ?? [];
  const byStatus = ds.reduce<Record<string, number>>((m, d) => ((m[d.status] = (m[d.status] ?? 0) + 1), m), {});
  const reqs = ai ?? [];
  const failed = reqs.filter((r) => !r.succeeded).length;
  const avgLatency = reqs.length ? Math.round(reqs.reduce((s, r) => s + (r.latency_ms ?? 0), 0) / reqs.length) : 0;
  const withAi = ds.filter((d) => d.ai_recommended_category && d.dispute_category);
  const overrides = withAi.filter((d) => d.ai_recommended_category !== d.dispute_category).length;
  const info = ds.filter((d) => d.status === "info_required").length;

  return (
    <div>
      <PageTitle title="Administration" subtitle="System-wide statistics, AI monitoring and detection settings." />
      {sp.saved && <Notice tone="ok">Settings saved.</Notice>}
      {sp.error && <Notice tone="error">Enter a duplicate window between 1 and 10080 minutes.</Notice>}

      <SectionTitle>Disputes by status</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(Object.keys(STATUS_LABELS) as DisputeStatus[]).map((s) => (
          <Stat key={s} label={STATUS_LABELS[s]} value={byStatus[s] ?? 0} />
        ))}
      </div>

      <SectionTitle>AI and detection monitoring</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="AI requests (last 500)" value={reqs.length} />
        <Stat label="AI failure rate" value={reqs.length ? `${Math.round((failed / reqs.length) * 100)}%` : "n/a"} tone={failed ? "accent" : undefined} />
        <Stat label="Avg AI latency" value={reqs.length ? `${(avgLatency / 1000).toFixed(1)}s` : "n/a"} />
        <Stat label="Category override rate" value={withAi.length ? `${Math.round((overrides / withAi.length) * 100)}%` : "n/a"} />
        <Stat label="Template fallbacks" value={ds.filter((d) => d.ai_summary_source === "template").length} />
        <Stat label="Alerts dismissed" value={alertsTotal ? `${Math.round(((alertsDismissed ?? 0) / alertsTotal) * 100)}%` : "n/a"} />
        <Stat label="Needs more info" value={ds.length ? `${Math.round((info / ds.length) * 100)}%` : "n/a"} />
        <Stat label="AI configured" value={process.env.ANTHROPIC_API_KEY ? "Yes" : "No"} tone={process.env.ANTHROPIC_API_KEY ? undefined : "danger"} />
      </div>

      <SectionTitle>Detection rules</SectionTitle>
      <Card>
        <form action={saveDetection} className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="duplicate_enabled" defaultChecked={settings.duplicateEnabled} /> Duplicate detection
          </label>
          <div>
            <label className="label" htmlFor="wm">Duplicate window (minutes)</label>
            <input id="wm" name="window_minutes" type="number" min={1} max={10080} defaultValue={settings.duplicateWindowMinutes} className="input" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="failed_enabled" defaultChecked={settings.failedDebitEnabled} /> Failed-but-debited detection
          </label>
          <button className="btn-primary sm:col-span-3 sm:justify-self-start">Save detection settings</button>
        </form>
      </Card>
    </div>
  );
}
