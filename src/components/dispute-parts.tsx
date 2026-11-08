import { STATUS_LABELS } from "@/lib/domain/status";
import { FIELD_LABELS } from "@/lib/domain/rules";
import type { AiSummary, DisputeStatus, Evidence, StatusHistory } from "@/lib/domain/types";
import { AiLabel, Badge, cx, dateTime } from "./ui";

const ACTION_LABELS: Record<string, string> = {
  create: "Dispute started",
  submit_for_review: "Sent for review",
  resubmit: "Additional information provided",
  approve: "Approved by reviewer",
  reject: "Rejected by reviewer",
  request_info: "More information requested",
  return_for_correction: "Returned for correction",
  file: "Dispute filed",
  start_investigation: "Investigation started",
  resolve: "Resolved",
  reject_after_investigation: "Investigation concluded",
  escalate_fraud: "Escalated to fraud team",
};

export function Timeline({ history, showInternal = false }: { history: StatusHistory[]; showInternal?: boolean }) {
  const items = showInternal ? history : history.filter((h) => h.action !== "escalate_fraud");
  return (
    <ol className="relative ml-2 border-l border-line">
      {items.map((h) => (
        <li key={h.history_id} className="mb-4 ml-4 last:mb-0">
          <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-brand-2" />
          <div className="text-sm font-semibold">{ACTION_LABELS[h.action] ?? STATUS_LABELS[h.new_status]}</div>
          <div className="text-xs text-ink-3">{dateTime(h.created_at)}</div>
          {h.remarks && <div className="mt-1 text-sm text-ink-2">{h.remarks}</div>}
        </li>
      ))}
    </ol>
  );
}

const STEPS: { key: DisputeStatus; label: string }[] = [
  { key: "draft", label: "Prepare" },
  { key: "pending_review", label: "Review" },
  { key: "submitted", label: "Filed" },
  { key: "under_investigation", label: "Investigation" },
  { key: "resolved", label: "Outcome" },
];
const ORDER: Record<DisputeStatus, number> = {
  draft: 0,
  info_required: 1,
  pending_review: 1,
  approved_for_filing: 1,
  submitted: 2,
  under_investigation: 3,
  resolved: 4,
  rejected: 4,
};

export function Progress({ status }: { status: DisputeStatus }) {
  const at = ORDER[status];
  return (
    <ol className="flex gap-1">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex-1">
          <div className={cx("h-1.5 rounded-full", i <= at ? (status === "rejected" && i === 4 ? "bg-ink-3" : status === "info_required" && i === 1 ? "bg-danger" : "bg-brand-2") : "bg-line")} />
          <div className={cx("mt-1 text-[10px] font-medium", i === at ? "text-ink" : "text-ink-3")}>{s.label}</div>
        </li>
      ))}
    </ol>
  );
}

export function SummaryView({ summary, source }: { summary: AiSummary; source: "ai" | "template" | null }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{summary.dispute_category}</div>
        <AiLabel source={source} />
      </div>
      <Block title="Transaction">{summary.transaction_details}</Block>
      <Block title="Customer explanation">{summary.customer_explanation}</Block>
      <Block title="Supporting evidence">
        <ul className="list-disc space-y-1 pl-4">
          {summary.evidence_summary.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </Block>
      {summary.inconsistencies?.length > 0 && (
        <Block title="Possible inconsistencies" tone="warn">
          <ul className="list-disc pl-4">
            {summary.inconsistencies.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </Block>
      )}
      {summary.missing_information.length > 0 && (
        <Block title="Missing information" tone="warn">
          <ul className="list-disc pl-4">
            {summary.missing_information.map((e, i) => (
              <li key={i}>{FIELD_LABELS[e] ?? e}</li>
            ))}
          </ul>
        </Block>
      )}
      <Block title="Recommended filing reason">{summary.recommended_filing_reason}</Block>
      <Block title="Suggested next steps">
        <ul className="list-disc pl-4">
          {summary.suggested_next_steps.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </Block>
      <p className="text-[11px] text-ink-3">Sources: {summary.sources.join(", ")}</p>
    </div>
  );
}

function Block({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "warn" }) {
  return (
    <div className={cx("rounded-xl p-3", tone === "warn" ? "bg-accent-soft" : "bg-paper")}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{title}</div>
      <div className="text-ink">{children}</div>
    </div>
  );
}

export function EvidenceItem({
  e,
  url,
  children,
}: {
  e: Evidence;
  url: string | null;
  children?: React.ReactNode;
}) {
  return (
    <li className="card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="block truncate text-sm font-semibold text-brand-2 underline">
              {e.file_name}
            </a>
          ) : (
            <div className="truncate text-sm font-semibold">{e.file_name}</div>
          )}
          <div className="text-xs text-ink-3">
            {e.file_type} · {dateTime(e.uploaded_at)}
          </div>
        </div>
        {children}
      </div>
      {e.customer_description && <p className="mt-2 text-xs text-ink-2">Note: {e.customer_description}</p>}
      {e.ai_summary ? (
        <div className="mt-2 rounded-lg bg-ai-soft p-2 text-xs text-ink">
          <Badge tone="ai">✦ AI extraction, not verified</Badge>
          <p className="mt-1">{e.ai_summary}</p>
        </div>
      ) : e.processing_status === "failed" ? (
        <p className="mt-2 text-xs text-ink-3">Automatic reading was not available. A reviewer will look at the original file.</p>
      ) : null}
    </li>
  );
}
