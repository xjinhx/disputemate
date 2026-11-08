import { requireAdmin } from "@/lib/auth";
import { StaffShell } from "@/components/staff-shell";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireAdmin();
  return <StaffShell user={user}>{children}</StaffShell>;
}
