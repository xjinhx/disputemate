import { NextResponse } from "next/server";
import { apiClient } from "../_guard";

// GET /api/disputes : the signed-in customer's disputes (RLS enforced)
export async function GET() {
  const c = await apiClient();
  if ("error" in c) return c.error;
  const { data, error } = await c.supabase
    .from("disputes")
    .select("dispute_id, status, dispute_category, submission_reference, filing_deadline, created_at, updated_at, transaction_id")
    .eq("user_id", c.user.id)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: "query_failed" }, { status: 500 });
  return NextResponse.json({ disputes: data });
}
