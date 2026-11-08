import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isConfigured } from "@/lib/env";
import { signIn, signUp } from "@/app/actions/auth";
import { Notice } from "@/components/ui";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  await connection();
  if (!isConfigured()) redirect("/setup");
  const sp = await searchParams;
  const signup = sp.mode === "signup";
  const next = typeof sp.next === "string" ? sp.next : "";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2 font-bold">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-accent">D</span>
        DisputeMate
      </Link>
      <h1 className="text-2xl font-bold">{signup ? "Create your account" : "Welcome back"}</h1>
      <p className="mb-6 mt-1 text-sm text-ink-2">
        {signup ? "New accounts get a sample transaction history to try disputes with." : "Sign in to view your transactions and disputes."}
      </p>
      {sp.error && <Notice tone="error">{String(sp.error)}</Notice>}
      {sp.notice === "check_email" && <Notice tone="ok">Check your email to confirm your account, then sign in.</Notice>}

      <form action={signup ? signUp : signIn} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        {signup && (
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input id="name" name="name" className="input" autoComplete="name" required />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" className="input" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 8 : undefined} required />
        </div>
        <button className="btn-primary w-full">{signup ? "Create account" : "Sign in"}</button>
      </form>

      <p className="mt-4 text-center text-sm text-ink-2">
        {signup ? (
          <>Already have an account? <Link href="/login" className="font-semibold text-brand-2">Sign in</Link></>
        ) : (
          <>New here? <Link href="/login?mode=signup" className="font-semibold text-brand-2">Create an account</Link></>
        )}
      </p>
      <p className="mt-8 rounded-xl border border-line bg-card p-3 text-xs text-ink-3">
        Demo accounts are created by the seed script (see README). Reviewer and admin roles cannot be self-assigned.
      </p>
    </main>
  );
}
