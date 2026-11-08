import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/env";

/** Returns an RLS-scoped client for the signed-in user, or a 401 response. */
export async function apiClient() {
  if (!isConfigured()) return { error: NextResponse.json({ error: "not_configured" }, { status: 503 }) } as const;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorised" }, { status: 401 }) } as const;
  return { supabase, user } as const;
}
