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

/**
 * Creates an already-confirmed account with the service role, so Supabase
 * sends no confirmation email (and its email rate limit never applies), then
 * signs the user straight in.
 */
async function createAndSignIn(email: string, password: string, name: string, errorPath: string) {
  const { error: createError } = await createAdminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (createError) redirect(errorPath + encodeURIComponent(createError.message));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(errorPath + encodeURIComponent(error.message));
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80) || email.split("@")[0];
  if (password.length < 6) redirect("/login?mode=signup&error=" + encodeURIComponent("Use at least 6 characters for your password."));
  await createAndSignIn(email, password, name, "/login?mode=signup&error=");
  redirect("/app");
}

/** One-click guest access: a throwaway customer account with sample data. */
export async function tryAsGuest() {
  const id = crypto.randomUUID();
  const email = `guest-${id.slice(0, 12)}@guest.disputemate.app`;
  const password = crypto.randomUUID() + crypto.randomUUID();
  await createAndSignIn(email, password, "Guest", "/login?error=");
  redirect("/app");
}

/** Demo profiles anyone can switch to from the login page. Prototype only. */
const PROFILES = {
  customer: { local: "customer", name: "He Jinhong" },
  reviewer: { local: "reviewer", name: "Calvin Ang" },
  administrator: { local: "admin", name: "Domnick Jerom" },
} as const satisfies Record<UserRole, { local: string; name: string }>;

/**
 * One-click sign-in to a demo profile, no password. Mints a one-time
 * magic-link token with the service role and redeems it server side. Creates
 * the account (with its role) on first use, so the seed script is optional.
 */
export async function signInAsProfile(formData: FormData) {
  const role = String(formData.get("role") ?? "") as UserRole;
  const profile = PROFILES[role as keyof typeof PROFILES];
  if (!profile) redirect("/login?error=" + encodeURIComponent("Unknown profile."));
  const email = `${profile.local}@${process.env.DEMO_EMAIL_DOMAIN ?? "demo.disputemate.app"}`;
  const admin = createAdminClient();

  let link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: crypto.randomUUID() + crypto.randomUUID(),
      email_confirm: true,
      user_metadata: { name: profile.name },
    });
    if (createError || !created.user) redirect("/login?error=" + encodeURIComponent(createError?.message ?? "Could not create profile"));
    await admin.from("users").update({ role, name: profile.name }).eq("user_id", created.user.id);
    link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  }
  const tokenHash = link.data.properties?.hashed_token;
  if (link.error || !tokenHash) redirect("/login?error=" + encodeURIComponent(link.error?.message ?? "Sign-in failed"));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (error || !data.user) redirect("/login?error=" + encodeURIComponent(error?.message ?? "Sign-in failed"));

  const userId = data.user.id;
  try {
    await Promise.all([
      // Keep the profile's display name in sync with PROFILES (renames apply on next sign-in).
      admin.from("users").update({ name: profile.name }).eq("user_id", userId).neq("name", profile.name),
      audit(admin, userId, "auth.sign_in", "user", userId),
    ]);
  } catch {
    /* name sync and audit are best-effort */
  }
  redirect(homeFor(role));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
