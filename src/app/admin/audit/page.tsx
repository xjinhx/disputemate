import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime, PageTitle } from "@/components/ui";

export const metadata = { title: "Audit log" };

export default async function AuditPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_logs")
    .select("*, actor:users!audit_logs_actor_id_fkey(name, email)")
    .order("created_at", { ascending: false })
    .limit(200);
  return (
    <div>
      <PageTitle title="Audit log" subtitle="Latest 200 sensitive operations." />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-3">
            <tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Actor</th><th className="px-4 py-2">Action</th><th className="px-4 py-2">Entity</th><th className="px-4 py-2">Details</th></tr>
          </thead>
          <tbody className="divide-y divide-line align-top">
            {(data ?? []).map((a) => (
              <tr key={a.audit_id}>
                <td className="whitespace-nowrap px-4 py-2 text-xs">{dateTime(a.created_at)}</td>
                <td className="px-4 py-2 text-xs">{a.actor?.email ?? "system"}</td>
                <td className="px-4 py-2 font-mono text-xs">{a.action}</td>
                <td className="px-4 py-2 font-mono text-[10px]">{a.entity_type}:{a.entity_id?.slice(0, 8)}</td>
                <td className="max-w-xs truncate px-4 py-2 font-mono text-[10px] text-ink-3">{JSON.stringify(a.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
