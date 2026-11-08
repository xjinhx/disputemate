import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { saveCategory } from "@/app/actions/admin";
import { Card, Notice, PageTitle } from "@/components/ui";
import type { DisputeCategory } from "@/lib/domain/types";

export const metadata = { title: "Dispute categories" };

export default async function CategoriesPage({ searchParams }: PageProps<"/admin/categories">) {
  await requireAdmin();
  const sp = await searchParams;
  const { data } = await createAdminClient().from("dispute_categories").select("*").order("sort_order");
  return (
    <div>
      <PageTitle title="Dispute categories" subtitle="Labels and descriptions customers see. Inactive categories are hidden from new disputes." />
      {sp.saved && <Notice tone="ok">Category saved.</Notice>}
      <div className="space-y-3">
        {((data as DisputeCategory[]) ?? []).map((c) => (
          <Card key={c.key}>
            <form action={saveCategory} className="grid gap-2 md:grid-cols-[1fr_2fr_auto_auto] md:items-end">
              <input type="hidden" name="key" value={c.key} />
              <div>
                <label className="label">Label <span className="font-mono text-[10px] text-ink-3">{c.key}</span></label>
                <input name="label" defaultValue={c.label} className="input" />
              </div>
              <div>
                <label className="label">Description</label>
                <input name="description" defaultValue={c.description} className="input" />
              </div>
              <label className="flex items-center gap-2 pb-2.5 text-sm">
                <input type="checkbox" name="is_active" defaultChecked={c.is_active} /> Active
              </label>
              <button className="btn-primary">Save</button>
            </form>
          </Card>
        ))}
      </div>
    </div>
  );
}
