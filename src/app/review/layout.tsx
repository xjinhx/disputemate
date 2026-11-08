import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StaffShell } from "@/components/staff-shell";

export default async function ReviewLayout({ children }: LayoutProps<"/review">) {
  const user = await requireStaff();
  const supabase = await createClient();
  const { count } = await supabase.from("disputes").select("dispute_id", { count: "exact", head: true }).eq("status", "pending_review");
  return (
    <StaffShell user={user} pending={count ?? 0}>
      {children}
    </StaffShell>
  );
}
