import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/nav";
import { signOut } from "@/app/actions/auth";

export default async function CustomerLayout({ children }: LayoutProps<"/app">) {
  const user = await requireUser(["customer"]);
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("notification_id", { count: "exact", head: true })
    .eq("user_id", user.user_id)
    .eq("is_read", false);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 bg-brand text-white">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <Link href="/app" className="flex items-center gap-2 font-bold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-sm text-brand">D</span>
            DisputeMate
          </Link>
          <form action={signOut}>
            <button className="text-xs font-medium text-white/80 hover:text-white">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-28 pt-4">{children}</main>
      <BottomNav
        items={[
          { href: "/app", label: "Home", icon: "⌂" },
          { href: "/app/transactions", label: "Transactions", icon: "≡" },
          { href: "/app/disputes", label: "Disputes", icon: "◎" },
          { href: "/app/notifications", label: "Updates", icon: "◔", badge: count ?? 0 },
        ]}
      />
    </div>
  );
}
