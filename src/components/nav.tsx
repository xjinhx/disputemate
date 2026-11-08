"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: string; badge?: number };

export function BottomNav({ items }: { items: Item[] }) {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {items.map((i) => {
          const active = i.href === "/app" ? path === "/app" : path.startsWith(i.href);
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                className={`relative flex flex-col items-center gap-0.5 px-3 py-2 text-[11px] font-semibold ${active ? "text-brand" : "text-ink-3"}`}
              >
                <span aria-hidden className="text-lg leading-none">{i.icon}</span>
                {i.label}
                {!!i.badge && (
                  <span className="absolute right-1 top-1 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] text-white">{i.badge}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SideNav({ items }: { items: Item[] }) {
  const path = usePathname();
  return (
    <ul className="flex gap-1 overflow-x-auto md:flex-col">
      {items.map((i) => {
        const active = i.href === "/review" || i.href === "/admin" ? path === i.href : path.startsWith(i.href);
        return (
          <li key={i.href}>
            <Link
              href={i.href}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-brand text-white" : "text-ink-2 hover:bg-paper"}`}
            >
              <span aria-hidden>{i.icon}</span>
              {i.label}
              {!!i.badge && <span className="ml-auto rounded-full bg-accent px-1.5 text-[11px] text-ink">{i.badge}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
