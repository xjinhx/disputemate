import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { setRole } from "@/app/actions/admin";
import { dateTime, Notice, PageTitle } from "@/components/ui";
import type { AppUser } from "@/lib/domain/types";

export const metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const { data } = await createAdminClient().from("users").select("*").order("created_at", { ascending: false });
  return (
    <div>
      <PageTitle title="Users and roles" subtitle="Grant reviewer or administrator access. Role changes are audited." />
      {sp.saved && <Notice tone="ok">Role updated.</Notice>}
      {sp.error === "self" && <Notice tone="error">You cannot change your own role.</Notice>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-3">
            <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Email</th><th className="px-4 py-2">Joined</th><th className="px-4 py-2">Role</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {((data as AppUser[]) ?? []).map((u) => (
              <tr key={u.user_id}>
                <td className="px-4 py-2 font-medium">{u.name}</td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2 text-xs">{dateTime(u.created_at, "date")}</td>
                <td className="px-4 py-2">
                  {u.user_id === me.user_id ? (
                    <span className="capitalize">{u.role} (you)</span>
                  ) : (
                    <form action={setRole} className="flex gap-2">
                      <input type="hidden" name="user_id" value={u.user_id} />
                      <select name="role" defaultValue={u.role} className="input py-1.5">
                        <option value="customer">Customer</option>
                        <option value="reviewer">Reviewer</option>
                        <option value="administrator">Administrator</option>
                      </select>
                      <button className="btn-secondary py-1.5">Save</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
