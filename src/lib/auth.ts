import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/env";
import type { AppUser, UserRole } from "@/lib/domain/types";

/** Returns the signed-in user's profile or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  if (!isConfigured()) return null;
  const supabase = await createClient();
  // getClaims verifies the session JWT locally when the project uses
  // asymmetric signing keys, saving a round trip to Supabase Auth.
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return null;
  const { data } = await supabase.from("users").select("*").eq("user_id", userId).single();
  return (data as AppUser) ?? null;
});

export async function requireUser(roles?: UserRole[]): Promise<AppUser> {
  // Always render per request: these pages depend on the session and env.
  await connection();
  if (!isConfigured()) redirect("/setup");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}

export const requireStaff = () => requireUser(["reviewer", "administrator"]);
export const requireAdmin = () => requireUser(["administrator"]);

export function homeFor(role: UserRole) {
  return role === "customer" ? "/app" : role === "administrator" ? "/admin" : "/review";
}
