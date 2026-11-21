"use client";

import { useState } from "react";
import { FIELD_LABELS } from "@/lib/domain/rules";
import type { AiSummary } from "@/lib/domain/types";
import { AiLabel, cx } from "./ui";

/** Shows machine timestamps (2026-11-18T10:22:00+00:00) the way people read them. */
function tidy(text: string) {
  return text.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})/g, (iso) =>
    new Date(iso).toLocaleString("en-SG", {
      timeZone: "Asia/Singapore",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  );
}

type TabKey = "summary" | "evidence" | "next";

/**
 * The AI or template summary, split into three short tabs so it reads on a
 * phone without a long scroll. The transaction details are left out here
 * because the page already shows amount, date and reference above it.
 */
export function SummaryView({ summary, source }: { summary: AiSummary; source: "ai" | "template" | null }) {
  const [tab, setTab] = useState<TabKey>("summary");
  // The AI sometimes writes "No inconsistency found" as an item; that is not a warning.
  const inconsistencies = (summary.inconsistencies ?? []).filter((i) => !/^no\b.*inconsisten/i.test(i.trim()));
  const missing = summary.missing_information ?? [];

  const tabs: { key: TabKey; label: string; flag?: number }[] = [
    { key: "summary", label: "Summary" },
    { key: "evidence", label: "Evidence", flag: inconsistencies.length },
    { key: "next", label: "Next steps", flag: missing.length },
  ];

  return (
    <div className="text-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">{summary.dispute_category}</div>
        <AiLabel source={source} />
      </div>

      <div role="tablist" aria-label="Summary sections" className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-paper p-1 text-center text-xs font-semibold">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`sum-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`sum-panel-${t.key}`}
            onClick={() => setTab(t.key)}
            className={cx("rounded-lg py-2", tab === t.key ? "bg-brand text-white" : "text-ink-3")}
          >
            {t.label}
            {t.flag ? (
              <span className={cx("ml-1 rounded-full px-1.5 text-[10px]", tab === t.key ? "bg-white/25" : "bg-accent-soft text-[#8a5a12]")}>{t.flag}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`sum-panel-${tab}`} aria-labelledby={`sum-tab-${tab}`} className="space-y-3">
        {tab === "summary" && (
          <>
            <Block title="What happened">{tidy(summary.customer_explanation)}</Block>
            <Block title="Why it may qualify">{tidy(summary.recommended_filing_reason)}</Block>
          </>
        )}

        {tab === "evidence" && (
          <>
            <Block title="What supports it">
              <List items={summary.evidence_summary.map(tidy)} empty="No supporting evidence listed." />
            </Block>
            {inconsistencies.length > 0 && (
              <Block title="Possible differences" tone="warn">
                <List items={inconsistencies.map(tidy)} />
              </Block>
            )}
            <p className="text-[11px] text-ink-3">Sources: {summary.sources.join(", ")}</p>
          </>
        )}

        {tab === "next" && (
          <>
            {missing.length > 0 && (
              <Block title="Still missing" tone="warn">
                <List items={missing.map((m) => FIELD_LABELS[m] ?? m)} />
              </Block>
            )}
            <Block title="Suggested next steps">
              <List items={summary.suggested_next_steps.map(tidy)} empty="Nothing more to do." />
            </Block>
          </>
        )}
      </div>
    </div>
  );
}

function List({ items, empty }: { items: string[]; empty?: string }) {
  if (!items.length) return <p className="text-ink-3">{empty ?? "None."}</p>;
  return (
    <ul className="list-disc space-y-1 pl-4">
      {items.map((e, i) => (
        <li key={i}>{e}</li>
      ))}
    </ul>
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
