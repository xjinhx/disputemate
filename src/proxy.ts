import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Refreshes the Supabase session cookie and redirects signed-out users away
// from protected pages. Page-level checks in lib/auth.ts enforce roles.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
