import { connection } from "next/server";
import { isConfigured } from "@/lib/env";

export const metadata = { title: "Setup" };

export default async function SetupPage() {
  await connection();
  const checks = [
    ["NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY", isConfigured()],
    ["SUPABASE_SERVICE_ROLE_KEY (server only)", Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)],
    ["ANTHROPIC_API_KEY (optional, enables AI features)", Boolean(process.env.ANTHROPIC_API_KEY)],
  ] as const;
  return (
    <main className="mx-auto w-full max-w-lg px-6 py-12">
      <h1 className="text-2xl font-bold">DisputeMate setup</h1>
      <p className="mt-2 text-sm text-ink-2">The app is deployed but needs its environment variables. Add them in Vercel (Project Settings, Environment Variables) or in .env.local, then redeploy.</p>
      <ul className="card mt-6 divide-y divide-line">
        {checks.map(([label, ok]) => (
          <li key={label} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>{label}</span>
            <span className={ok ? "font-semibold text-ok" : "font-semibold text-danger"}>{ok ? "Set" : "Missing"}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-ink-2">See README.md and docs/DEPLOYMENT.md in the repository for the full steps.</p>
    </main>
  );
}
