import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { markNotificationsRead } from "@/app/actions/customer";
import { cx, dateTime, Empty, PageTitle } from "@/components/ui";
import type { Notification } from "@/lib/domain/types";

export const metadata = { title: "Updates" };

export default async function NotificationsPage() {
  const user = await requireUser(["customer"]);
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("*").eq("user_id", user.user_id).order("created_at", { ascending: false }).limit(100);
  const items = (data as Notification[]) ?? [];
  const unread = items.some((n) => !n.is_read);

  return (
    <div>
      <PageTitle title="Updates" subtitle="Your notification history." />
      {unread && (
        <form action={markNotificationsRead} className="mb-3 text-right">
          <button className="btn-ghost">Mark all as read</button>
        </form>
      )}
      {items.length === 0 ? (
        <Empty>No updates yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.notification_id}>
              <Link href={n.dispute_id ? `/app/disputes/${n.dispute_id}` : "/app"} className={cx("card block p-3", !n.is_read && "border-brand-2")}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{n.title}</span>
                  {!n.is_read && <span className="h-2 w-2 rounded-full bg-brand-2" />}
                </div>
                <p className="text-sm text-ink-2">{n.message}</p>
                <p className="mt-1 text-[11px] text-ink-3">{dateTime(n.created_at)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
