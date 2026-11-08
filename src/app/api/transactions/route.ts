import { NextResponse, type NextRequest } from "next/server";
import { apiClient } from "../_guard";

// GET /api/transactions?status=success&from=2026-11-01&to=2026-11-30
export async function GET(req: NextRequest) {
  const c = await apiClient();
  if ("error" in c) return c.error;
  const p = req.nextUrl.searchParams;
  let q = c.supabase.from("transactions").select("*").eq("user_id", c.user.id).order("transaction_date", { ascending: false });
  if (p.get("status")) q = q.eq("transaction_status", p.get("status")!);
  if (p.get("from")) q = q.gte("transaction_date", p.get("from")!);
  if (p.get("to")) q = q.lte("transaction_date", p.get("to")!);
  const { data, error } = await q.limit(200);
  if (error) return NextResponse.json({ error: "query_failed" }, { status: 500 });
  return NextResponse.json({ transactions: data });
}
