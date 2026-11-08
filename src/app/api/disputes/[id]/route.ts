import { NextResponse } from "next/server";
import { apiClient } from "../../_guard";

// GET /api/disputes/:id : dispute with status history (RLS enforced)
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const c = await apiClient();
  if ("error" in c) return c.error;
  const { data: dispute } = await c.supabase.from("disputes").select("*").eq("dispute_id", id).maybeSingle();
  if (!dispute) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data: history } = await c.supabase
    .from("dispute_status_history")
    .select("previous_status, new_status, action, remarks, created_at")
    .eq("dispute_id", id)
    .order("created_at");
  return NextResponse.json({ dispute, history });
}
