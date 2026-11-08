import Link from "next/link";
import type { ReactNode } from "react";
import { SideNav } from "./nav";
import { signOut } from "@/app/actions/auth";
import type { AppUser } from "@/lib/domain/types";

export function StaffShell({ user, children, pending }: { user: AppUser; children: ReactNode; pending?: number }) {
  const items = [
    { href: "/review", label: "Dashboard", icon: "▦" },
    { href: "/review/queue", label: "Dispute queue", icon: "☰", badge: pending },
  ];
  if (user.role === "administrator") {
    items.push(
      { href: "/admin", label: "Admin overview", icon: "⚙" },
      { href: "/admin/rules", label: "Routing rules", icon: "⇄" },
      { href: "/admin/categories", label: "Categories", icon: "◧" },
      { href: "/admin/users", label: "Users", icon: "◍" },
      { href: "/admin/audit", label: "Audit log", icon: "⎙" },
    );
  }
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-line bg-card md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4">
          <Link href="/review" className="flex items-center gap-2 font-bold">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-sm text-accent">D</span>
            <span>
              DisputeMate <span className="block text-[10px] font-semibold uppercase tracking-wide text-ink-3">Bank operations</span>
            </span>
          </Link>
        </div>
        <div className="px-2 pb-3 md:pb-0">
          <SideNav items={items} />
        </div>
        <div className="hidden px-4 py-4 text-xs text-ink-3 md:absolute md:bottom-0 md:block">
          <div className="font-semibold text-ink-2">{user.name}</div>
          <div className="capitalize">{user.role}</div>
          <form action={signOut} className="mt-2">
            <button className="font-semibold text-brand-2">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
