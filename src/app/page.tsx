import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/lib/auth";
import { connection } from "next/server";
import { isConfigured } from "@/lib/env";

export default async function Landing() {
  await connection();
  const user = isConfigured() ? await getCurrentUser() : null;
  if (user) redirect(homeFor(user.role));

  return (
    <main className="flex min-h-screen flex-col bg-brand text-white">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-between px-6 py-10">
        <div className="flex items-center gap-2 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-brand">D</span>
          DisputeMate
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight">Something wrong with a payment? Sort it out in minutes.</h1>
          <p className="mt-4 text-white/75">
            DisputeMate spots charges worth a second look, helps you put your case together and keeps you updated until it is resolved. A bank reviewer checks every dispute before it is filed.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-white/85">
            <li>✓ Duplicate charge and failed transfer detection</li>
            <li>✓ AI help to prepare your dispute, always editable</li>
            <li>✓ Live tracking with clear next steps</li>
          </ul>
        </div>
        <div className="space-y-3">
          {isConfigured() ? (
            <>
              <Link href="/login" className="w-full bg-accent text-brand hover:opacity-90 inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold">
                Sign in
              </Link>
              <Link href="/login?mode=signup" className="block text-center text-sm font-medium text-white/80">
                New here? Create a demo account
              </Link>
            </>
          ) : (
            <Link href="/setup" className="inline-flex w-full items-center justify-center rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-brand">
              Finish setup
            </Link>
          )}
          <p className="text-center text-[11px] text-white/50">IS419 Group 5 prototype. Simulated bank data only, no real payments.</p>
        </div>
      </div>
    </main>
  );
}
