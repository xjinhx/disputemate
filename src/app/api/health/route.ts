import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/env";

// Used to verify deployments. Reports configuration, never secret values.
export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "disputemate",
    supabaseConfigured: isConfigured(),
    serviceRoleConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    environment: process.env.VERCEL_ENV ?? "local",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  });
}
