import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isConfigured } from "@/lib/env";
import { signInAsProfile, tryAsGuest } from "@/app/actions/auth";
import { Notice } from "@/components/ui";

export const metadata = { title: "Choose a profile" };

const PROFILES = [
  { role: "customer", name: "Tan Mei Ling", title: "Customer", blurb: "Spot a problem, prepare a dispute with AI help, track it." },
  { role: "reviewer", name: "Rahul Nair", title: "Bank reviewer", blurb: "Work the queue, approve, reject or request more info." },
  { role: "administrator", name: "Siti Rahman", title: "Administrator", blurb: "Routing rules, categories, users, AI monitoring, audit log." },
] as const;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  await connection();
  if (!isConfigured()) redirect("/setup");
  const sp = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2 font-bold">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-accent">D</span>
        DisputeMate
      </Link>
      <h1 className="text-2xl font-bold">Choose a profile</h1>
      <p className="mb-6 mt-1 text-sm text-ink-2">No password needed. You can switch profiles at any time.</p>
      {sp.error && <Notice tone="error">{String(sp.error)}</Notice>}

      <div className="space-y-3">
        {PROFILES.map((p) => (
          <form key={p.role} action={signInAsProfile}>
            <input type="hidden" name="role" value={p.role} />
            <button className="w-full rounded-xl border border-line bg-card p-4 text-left transition hover:border-brand-2">
              <span className="block text-xs font-semibold uppercase tracking-wide text-brand-2">{p.title}</span>
              <span className="mt-0.5 block font-semibold">{p.name}</span>
              <span className="mt-1 block text-sm text-ink-2">{p.blurb}</span>
            </button>
          </form>
        ))}
      </div>

      <form action={tryAsGuest} className="mt-5">
        <button className="btn-secondary w-full">Fresh guest customer</button>
        <p className="mt-2 text-center text-xs text-ink-3">A new customer account with recent transactions.</p>
      </form>
    </main>
  );
}
