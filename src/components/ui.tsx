import Link from "next/link";
import type { ReactNode } from "react";
import { STATUS_LABELS } from "@/lib/domain/status";
import type { DisputeStatus, TransactionStatus } from "@/lib/domain/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function money(amount: number | string, currency = "SGD") {
  const prefix = currency === "SGD" ? "S$" : `${currency} `;
  return `${prefix}${Number(amount).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function dateTime(d: string | null | undefined, opts: "date" | "datetime" = "datetime") {
  if (!d) return "Not set";
  return new Date(d).toLocaleString("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(opts === "datetime" ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

const STATUS_TONE: Record<DisputeStatus, string> = {
  draft: "bg-paper text-ink-2 border-line",
  pending_review: "bg-accent-soft text-[#8a5a12] border-[#f0d7a8]",
  info_required: "bg-danger-soft text-danger border-[#efc4be]",
  approved_for_filing: "bg-brand-soft text-brand border-[#c3dcd6]",
  submitted: "bg-brand-soft text-brand border-[#c3dcd6]",
  under_investigation: "bg-ai-soft text-ai border-[#d6d2f1]",
  resolved: "bg-ok-soft text-ok border-[#c3e2cd]",
  rejected: "bg-[#efecea] text-ink-2 border-line",
};

export function StatusBadge({ status }: { status: DisputeStatus }) {
  return (
    <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", STATUS_TONE[status])}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function TxnStatusBadge({ status }: { status: TransactionStatus }) {
  const tone =
    status === "failed"
      ? "text-danger bg-danger-soft"
      : status === "pending"
        ? "text-[#8a5a12] bg-accent-soft"
        : status === "reversed"
          ? "text-ink-2 bg-paper"
          : "text-ok bg-ok-soft";
  return <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", tone)}>{status}</span>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "danger" | "ai" | "accent" | "ok" }) {
  const map = {
    neutral: "bg-paper text-ink-2 border-line",
    danger: "bg-danger-soft text-danger border-[#efc4be]",
    ai: "bg-ai-soft text-ai border-[#d6d2f1]",
    accent: "bg-accent-soft text-[#8a5a12] border-[#f0d7a8]",
    ok: "bg-ok-soft text-ok border-[#c3e2cd]",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", map[tone])}>{children}</span>;
}

/** Marks AI-generated content so it is always distinguishable (FR-04, 6.4). */
export function AiLabel({ source }: { source?: "ai" | "template" | null }) {
  if (source === "template") return <Badge>Auto-generated from your records</Badge>;
  return (
    <Badge tone="ai">
      <span aria-hidden>✦</span> AI suggestion, please check
    </Badge>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("card p-4", className)}>{children}</section>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-3">{children}</h2>
      {action}
    </div>
  );
}

export function PageTitle({ title, subtitle, back }: { title: string; subtitle?: ReactNode; back?: string }) {
  return (
    <header className="mb-4">
      {back && (
        <Link href={back} className="mb-2 inline-block text-sm font-medium text-brand-2">
          ← Back
        </Link>
      )}
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
    </header>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  const map = {
    info: "border-[#c3dcd6] bg-brand-soft text-brand",
    warn: "border-[#f0d7a8] bg-accent-soft text-[#7a4f10]",
    error: "border-[#efc4be] bg-danger-soft text-danger",
    ok: "border-[#c3e2cd] bg-ok-soft text-ok",
  };
  return <div className={cx("mb-4 rounded-xl border px-3 py-2.5 text-sm", map[tone])}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-3">{children}</div>;
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-2 text-sm last:border-0">
      <span className="text-ink-3">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "danger" | "accent" }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</div>
      <div className={cx("mt-1 text-2xl font-bold tabular", tone === "danger" && "text-danger", tone === "accent" && "text-[#8a5a12]")}>{value}</div>
    </div>
  );
}
