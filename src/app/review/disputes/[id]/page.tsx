import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/evidence";
import { addNote, assignToMe, escalateToFraud, retryFiling, reviewAction, updateCategory } from "@/app/actions/reviewer";
import { EvidenceItem, SummaryView, Timeline } from "@/components/dispute-parts";
import { Badge, Card, cx, dateTime, money, Notice, PageTitle, Row, SectionTitle, StatusBadge } from "@/components/ui";
import { allowedActions } from "@/lib/domain/status";
import { CATEGORY_QUESTIONS } from "@/lib/domain/rules";
import { daysUntil } from "@/lib/domain/routing";
import type { Dispute, DisputeCategory, Evidence, RoutingRule, StatusHistory, Transaction } from "@/lib/domain/types";

export const metadata = { title: "Review dispute" };

const NOTICE_TEXT: Record<string, string> = {
  approve: "Approved. The simulated filing ran and the customer was notified.",
  reject: "Rejected. The customer was notified with your explanation.",
  request_info: "Request sent to the customer.",
  return_for_correction: "Returned to the customer for correction.",
  start_investigation: "Investigation started.",
  resolve: "Marked as resolved.",
  reject_after_investigation: "Investigation closed as rejected.",
  escalated: "Escalated to the fraud team.",
  recategorised: "Category updated and routing recalculated.",
};

export default async function ReviewDisputePage({ params, searchParams }: PageProps<"/review/disputes/[id]">) {
  const staff = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase.from("disputes").select("*").eq("dispute_id", id).maybeSingle();
  if (!data) notFound();
  const d = data as Dispute;

  const [txnR, relR, evR, histR, notesR, custR, catR, ruleR, reviewerR] = await Promise.all([
    supabase.from("transactions").select("*").eq("transaction_id", d.transaction_id).single(),
    d.related_transaction_id ? supabase.from("transactions").select("*").eq("transaction_id", d.related_transaction_id).single() : Promise.resolve({ data: null }),
    supabase.from("evidence").select("*").eq("dispute_id", id).order("uploaded_at"),
    supabase.from("dispute_status_history").select("*").eq("dispute_id", id).order("created_at"),
    supabase.from("reviewer_notes").select("*, author:users!reviewer_notes_author_id_fkey(name)").eq("dispute_id", id).order("created_at"),
    supabase.from("users").select("name, email, created_at").eq("user_id", d.user_id).single(),
    supabase.from("dispute_categories").select("*").order("sort_order"),
    d.routing_rule_id ? supabase.from("routing_rules").select("*").eq("rule_id", d.routing_rule_id).single() : Promise.resolve({ data: null }),
    d.assigned_reviewer_id ? supabase.from("users").select("name").eq("user_id", d.assigned_reviewer_id).single() : Promise.resolve({ data: null }),
  ]);
  const txn = txnR.data as Transaction;
  const related = relR.data as Transaction | null;
  const evidence = (evR.data as Evidence[]) ?? [];
  const history = (histR.data as StatusHistory[]) ?? [];
  const notes = (notesR.data as { note_id: string; body: string; created_at: string; author: { name: string } | null }[]) ?? [];
  const categories = (catR.data as DisputeCategory[]) ?? [];
  const rule = ruleR.data as RoutingRule | null;
  const admin = createAdminClient();
  const urls = Object.fromEntries(await Promise.all(evidence.map(async (e) => [e.evidence_id, await signedUrl(admin, e.storage_path)] as const)));
  const actions = allowedActions(d.status, "staff");
  const days = daysUntil(d.filing_deadline);
  const questions = d.dispute_category ? CATEGORY_QUESTIONS[d.dispute_category] : [];

  return (
    <div>
      <PageTitle
        title={`${txn.merchant_name} · ${money(txn.amount, txn.currency)}`}
        subtitle={<span className="font-mono text-xs">{d.submission_reference ?? d.dispute_id}</span>}
        back="/review/queue"
      />
      {sp.notice && NOTICE_TEXT[String(sp.notice)] && <Notice tone="ok">{NOTICE_TEXT[String(sp.notice)]}</Notice>}
      {sp.error && <Notice tone="error">{String(sp.error)}</Notice>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={d.status} />
        {d.escalated_to_fraud && <Badge tone="danger">Fraud team</Badge>}
        {d.requires_human_routing && <Badge tone="accent">Human routing required</Badge>}
        {d.ai_category_confidence !== null && d.ai_category_confidence < 0.6 && <Badge tone="accent">Low AI confidence</Badge>}
        <span className="text-xs text-ink-3">Assigned to {reviewerR.data?.name ?? "nobody"}</span>
        {d.assigned_reviewer_id !== staff.user_id && (
          <form action={assignToMe}>
            <input type="hidden" name="dispute_id" value={id} />
            <button className="btn-ghost px-2 py-1 text-xs">Assign to me</button>
          </form>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {d.scam_indicators.length > 0 && (
            <Card className="border-[#efc4be] bg-danger-soft/50">
              <div className="text-sm font-semibold text-danger">Scam indicators (deterministic checks)</div>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {d.scam_indicators.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-2">Escalate to the fraud team if a scam is suspected. The system makes no fraud or liability decision.</p>
            </Card>
          )}

          <Card>
            <div className="mb-2 text-sm font-semibold">Transaction (bank record)</div>
            <Row label="Merchant">{txn.merchant_name}</Row>
            <Row label="Amount">{money(txn.amount, txn.currency)}</Row>
            <Row label="Date">{dateTime(txn.transaction_date)}</Row>
            <Row label="Method / status">{txn.payment_method.toUpperCase()} · {txn.transaction_status}</Row>
            <Row label="Reference"><span className="font-mono text-xs">{txn.reference_number}</span></Row>
            {related && (
              <Row label="Matching charge">
                {money(related.amount, related.currency)} · {dateTime(related.transaction_date)} · <span className="font-mono text-xs">{related.reference_number}</span>
              </Row>
            )}
          </Card>

          <Card>
            <div className="mb-2 text-sm font-semibold">Customer</div>
            <Row label="Name">{custR.data?.name}</Row>
            <Row label="Email">{custR.data?.email}</Row>
            <Row label="Customer ID"><span className="font-mono text-[10px]">{d.user_id}</span></Row>
            <div className="mt-3 text-sm font-semibold">Customer explanation</div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{d.customer_description || "None"}</p>
            {questions.length > 0 && (
              <div className="mt-3 space-y-1 text-sm">
                {questions.map((q) => (
                  <div key={q.id} className="flex justify-between gap-4">
                    <span className="text-ink-3">{q.label}</span>
                    <span className="font-semibold capitalize">{d.category_answers[q.id] ?? "Not answered"}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {d.ai_summary && (
            <Card>
              <SummaryView summary={d.ai_summary} source={d.ai_summary_source} />
            </Card>
          )}

          <div>
            <SectionTitle>Original evidence</SectionTitle>
            {evidence.length ? (
              <ul className="space-y-2">
                {evidence.map((e) => (
                  <EvidenceItem key={e.evidence_id} e={e} url={urls[e.evidence_id]}>
                    <span className="text-[11px] text-ink-3">{e.evidence_source.replace("_", " ")}</span>
                  </EvidenceItem>
                ))}
              </ul>
            ) : (
              <div className="card p-4 text-sm text-ink-3">No uploads. Bank transaction records are attached automatically.</div>
            )}
          </div>

          <div>
            <SectionTitle>Status history</SectionTitle>
            <Card>
              <Timeline history={history} showInternal />
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <div className="mb-2 text-sm font-semibold">Routing recommendation (rules engine)</div>
            <Row label="Rule">{rule?.name ?? "No matching rule"}</Row>
            <Row label="Reason code">{d.recommended_reason_code ?? "None"}</Row>
            <Row label="Queue">{rule?.review_queue ?? "disputes"}</Row>
            <Row label="Filing deadline">
              <span className={cx(days !== null && days <= 14 && "text-danger")}>
                {d.filing_deadline ? `${dateTime(d.filing_deadline, "date")} (${days} days)` : "Not determined"}
              </span>
            </Row>
            {d.routing_explanation && <p className="mt-2 text-xs text-ink-2">{d.routing_explanation}</p>}
            {d.ai_recommended_category && (
              <p className="mt-2 text-xs text-ai">
                ✦ AI suggested category: {d.ai_recommended_category} ({Math.round((d.ai_category_confidence ?? 0) * 100)}% confidence). {d.ai_category_reasoning}
              </p>
            )}
          </Card>

          {d.status === "pending_review" && (
            <Card>
              <form action={updateCategory} className="flex gap-2">
                <input type="hidden" name="dispute_id" value={id} />
                <select name="dispute_category" defaultValue={d.dispute_category ?? ""} className="input">
                  {categories.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
                <button className="btn-secondary">Recategorise</button>
              </form>
            </Card>
          )}

          {actions.length > 0 && (
            <Card>
              <div className="mb-2 text-sm font-semibold">Decision</div>
              <form action={reviewAction} className="space-y-2">
                <input type="hidden" name="dispute_id" value={id} />
                {(actions.includes("resolve") || actions.includes("reject_after_investigation")) && (
                  <>
                    <label className="label" htmlFor="decision">Outcome</label>
                    <select id="decision" name="decision" className="input">
                      <option>Resolved in customer&apos;s favour, refund issued</option>
                      <option>Resolved in customer&apos;s favour, partial refund</option>
                      <option>Resolved, merchant refunded customer directly</option>
                    </select>
                    <input name="next_steps" placeholder="Next steps for the customer (optional)" className="input" />
                  </>
                )}
                <textarea
                  name="remarks"
                  rows={3}
                  placeholder="Explanation (required for reject, info requests and outcomes). Customers can see this."
                  className="input"
                />
                <div className="grid grid-cols-2 gap-2">
                  {actions.includes("approve") && <button name="action" value="approve" className="btn-primary col-span-2">Approve and file</button>}
                  {actions.includes("request_info") && <button name="action" value="request_info" className="btn-secondary">Request info</button>}
                  {actions.includes("return_for_correction") && <button name="action" value="return_for_correction" className="btn-secondary">Return for correction</button>}
                  {actions.includes("reject") && <button name="action" value="reject" className="btn-danger col-span-2">Reject</button>}
                  {actions.includes("start_investigation") && <button name="action" value="start_investigation" className="btn-primary col-span-2">Start investigation</button>}
                  {actions.includes("resolve") && <button name="action" value="resolve" className="btn-primary">Resolve</button>}
                  {actions.includes("reject_after_investigation") && <button name="action" value="reject_after_investigation" className="btn-danger">Close as rejected</button>}
                </div>
              </form>
            </Card>
          )}

          {d.status === "approved_for_filing" && (
            <Card>
              <p className="text-sm">Approved but not yet filed (the filing step did not complete).</p>
              <form action={retryFiling} className="mt-2">
                <input type="hidden" name="dispute_id" value={id} />
                <button className="btn-primary w-full">Retry filing</button>
              </form>
            </Card>
          )}

          {!d.escalated_to_fraud && !["resolved", "rejected"].includes(d.status) && (
            <Card>
              <form action={escalateToFraud} className="space-y-2">
                <input type="hidden" name="dispute_id" value={id} />
                <input name="remarks" placeholder="Why escalate? (internal)" className="input" required />
                <button className="btn-secondary w-full text-danger">Escalate to fraud team</button>
              </form>
            </Card>
          )}

          <Card>
            <div className="mb-2 text-sm font-semibold">Internal notes</div>
            <ul className="mb-3 space-y-2">
              {notes.map((n) => (
                <li key={n.note_id} className="rounded-lg bg-paper p-2 text-sm">
                  <div className="whitespace-pre-wrap">{n.body}</div>
                  <div className="mt-1 text-[11px] text-ink-3">{n.author?.name} · {dateTime(n.created_at)}</div>
                </li>
              ))}
              {!notes.length && <li className="text-xs text-ink-3">No notes yet. Notes are never shown to the customer.</li>}
            </ul>
            <form action={addNote} className="space-y-2">
              <input type="hidden" name="dispute_id" value={id} />
              <textarea name="body" rows={2} className="input" placeholder="Add an investigation note" />
              <button className="btn-secondary w-full">Add note</button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
