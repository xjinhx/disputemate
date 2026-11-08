"use server";

import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { homeFor } from "@/lib/auth";
import type { UserRole } from "@/lib/domain/types";

const safeNext = (n: FormDataEntryValue | null) => {
  const s = String(n ?? "");
  return s.startsWith("/") && !s.startsWith("//") ? s : null;
};

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) redirect(`/login?error=${encodeURIComponent(error?.message ?? "Sign in failed")}`);

  const { data: profile } = await supabase.from("users").select("role").eq("user_id", data.user.id).single();
  const role = (profile?.role ?? "customer") as UserRole;
  try {
    await audit(createAdminClient(), data.user.id, "auth.sign_in", "user", data.user.id);
  } catch {
    /* audit is best-effort */
  }
  redirect(safeNext(formData.get("next")) ?? homeFor(role));
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (password.length < 8) redirect("/login?mode=signup&error=" + encodeURIComponent("Use at least 8 characters for your password."));
  const supabase = await createClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name }, emailRedirectTo: `${site}/auth/callback` },
  });
  if (error) redirect("/login?mode=signup&error=" + encodeURIComponent(error.message));
  if (!data.session) redirect("/login?notice=check_email");
  redirect("/app");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
