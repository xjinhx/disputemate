import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { computeRouting } from "@/lib/disputes";
import { signedUrl } from "@/lib/evidence";
import {
  acceptAiCategory,
  deleteDraft,
  generateSummary,
  removeEvidence,
  saveDetails,
  submitForReview,
  uploadEvidence,
} from "@/app/actions/customer";
import { CategoryForm } from "@/components/category-form";
import { EvidenceItem, Progress, SummaryView, Timeline } from "@/components/dispute-parts";
import { AiLabel, Card, cx, dateTime, money, Notice, PageTitle, Row, SectionTitle, StatusBadge } from "@/components/ui";
import { customerCanEdit, STATUS_EXPLANATIONS } from "@/lib/domain/status";
import { FIELD_LABELS, validateForSubmission } from "@/lib/domain/rules";
import { daysUntil } from "@/lib/domain/routing";
import type { Dispute, DisputeCategory, Evidence, StatusHistory, Transaction } from "@/lib/domain/types";

export const metadata = { title: "Dispute" };

type Step = "details" | "evidence" | "review" | "overview";

const NOTICES: Record<string, { tone: "ok" | "warn" | "info"; text: string }> = {
  submitted: { tone: "ok", text: "Sent. Your dispute is now with our review team." },
  already_active: { tone: "warn", text: "This transaction already has an active dispute, so we opened it for you." },
  conflict: { tone: "warn", text: "This dispute changed while you were working on it. Please check the latest status." },
};

export default async function DisputePage({ params, searchParams }: PageProps<"/app/disputes/[id]">) {
  const user = await requireUser(["customer"]);
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase.from("disputes").select("*").eq("dispute_id", id).eq("user_id", user.user_id).maybeSingle();
  if (!data) notFound();
  const dispute = data as Dispute;

  const [{ data: txnData }, { data: evData }, { data: histData }, { data: catData }] = await Promise.all([
    supabase.from("transactions").select("*").eq("transaction_id", dispute.transaction_id).single(),
    supabase.from("evidence").select("*").eq("dispute_id", id).order("uploaded_at"),
    supabase.from("dispute_status_history").select("*").eq("dispute_id", id).order("created_at"),
    supabase.from("dispute_categories").select("*").eq("is_active", true).order("sort_order"),
  ]);
  const txn = txnData as Transaction;
  const evidence = (evData as Evidence[]) ?? [];
  const history = (histData as StatusHistory[]) ?? [];
  const categories = (catData as DisputeCategory[]) ?? [];
  const catLabel = categories.find((c) => c.key === dispute.dispute_category)?.label ?? "Category not chosen";

  const editable = customerCanEdit(dispute.status);
  const requested = String(sp.step ?? "");
  const step: Step =
    editable && ["details", "evidence", "review"].includes(requested)
      ? (requested as Step)
      : editable && dispute.status === "draft" && requested !== "overview"
        ? "details"
        : "overview";

  const admin = createAdminClient();
  const urls = Object.fromEntries(await Promise.all(evidence.map(async (e) => [e.evidence_id, await signedUrl(admin, e.storage_path)] as const)));
  const notice = NOTICES[String(sp.notice ?? "")];

  return (
    <div>
      <PageTitle title={txn.merchant_name} subtitle={`${money(txn.amount, txn.currency)} · ${dateTime(txn.transaction_date)}`} back="/app/disputes" />
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      {step === "overview" ? (
        <Overview dispute={dispute} txn={txn} evidence={evidence} history={history} catLabel={catLabel} urls={urls} />
      ) : (
        <>
          <Stepper step={step} id={id} />
          {step === "details" && (
            <DetailsStep dispute={dispute} txn={txn} categories={categories} sp={sp} userId={user.user_id} />
          )}
          {step === "evidence" && <EvidenceStep dispute={dispute} txn={txn} evidence={evidence} urls={urls} error={sp.error} />}
          {step === "review" && <ReviewStep dispute={dispute} txn={txn} evidence={evidence} catLabel={catLabel} missing={sp.missing} />}
        </>
      )}
    </div>
  );
}

function Stepper({ step, id }: { step: Step; id: string }) {
  const steps: [Step, string][] = [
    ["details", "1. Details"],
    ["evidence", "2. Evidence"],
    ["review", "3. Review"],
  ];
  return (
    <nav className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-card p-1 text-center text-xs font-semibold">
      {steps.map(([k, l]) => (
        <Link key={k} href={`/app/disputes/${id}?step=${k}`} className={cx("rounded-lg py-2", step === k ? "bg-brand text-white" : "text-ink-3")}>
          {l}
        </Link>
      ))}
    </nav>
  );
}

async function DetailsStep({
  dispute,
  txn,
  categories,
  sp,
  userId,
}: {
  dispute: Dispute;
  txn: Transaction;
  categories: DisputeCategory[];
  sp: Record<string, string | string[] | undefined>;
  userId: string;
}) {
  const supabase = await createClient();
  const { data: same } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .eq("merchant_name", txn.merchant_name)
    .neq("transaction_id", txn.transaction_id);
  const aiDisagrees = sp.ai === "check" && dispute.ai_recommended_category && dispute.ai_recommended_category !== dispute.dispute_category;

  return (
    <div>
      {dispute.status === "info_required" && <InfoRequest dispute={dispute} />}
      {sp.error === "category" && <Notice tone="error">Choose a dispute category to continue.</Notice>}
      {sp.accepted && <Notice tone="ok">Category updated. Please answer the questions for the new category.</Notice>}
      {aiDisagrees && (
        <Card className="mb-4 border-[#d6d2f1] bg-ai-soft/60">
          <AiLabel />
          <p className="mt-2 text-sm">
            Based on what you wrote, this looks more like <b>{categories.find((c) => c.key === dispute.ai_recommended_category)?.label}</b>.
          </p>
          {dispute.ai_category_reasoning && <p className="mt-1 text-xs text-ink-2">{dispute.ai_category_reasoning}</p>}
          <div className="mt-3 flex gap-2">
            <form action={acceptAiCategory}>
              <input type="hidden" name="dispute_id" value={dispute.dispute_id} />
              <button className="btn-primary">Use suggestion</button>
            </form>
            <Link href={`/app/disputes/${dispute.dispute_id}?step=evidence`} className="btn-secondary">
              Keep my choice
            </Link>
          </div>
        </Card>
      )}
      <CategoryForm
        disputeId={dispute.dispute_id}
        categories={categories}
        initialCategory={dispute.dispute_category}
        description={dispute.customer_description}
        answers={dispute.category_answers}
        relatedOptions={(same as Transaction[]) ?? []}
        relatedId={dispute.related_transaction_id}
        action={saveDetails}
      />
      {dispute.status === "draft" && (
        <form action={deleteDraft} className="mt-6 text-center">
          <input type="hidden" name="dispute_id" value={dispute.dispute_id} />
          <button className="text-sm font-medium text-danger">Delete this draft</button>
        </form>
      )}
    </div>
  );
}

async function EvidenceStep({
  dispute,
  txn,
  evidence,
  urls,
  error,
}: {
  dispute: Dispute;
  txn: Transaction;
  evidence: Evidence[];
  urls: Record<string, string | null>;
  error?: string | string[];
}) {
  const routing = await computeRouting(createAdminClient(), dispute, txn);
  const needed = routing.requiredFields.filter((f) => f !== "customer_description");
  const check = validateForSubmission(dispute, evidence.length, routing.requiredFields, true);

  return (
    <div>
      {dispute.status === "info_required" && <InfoRequest dispute={dispute} />}
      {error && <Notice tone="error">{String(error)}</Notice>}

      <Card>
        <div className="text-sm font-semibold">Checklist</div>
        <ul className="mt-2 space-y-1.5 text-sm">
          <li className="flex gap-2">
            <span className="text-ok">✓</span> Bank transaction record (retrieved automatically)
          </li>
          {dispute.related_transaction_id && (
            <li className="flex gap-2">
              <span className="text-ok">✓</span> Matching charge record (retrieved automatically)
            </li>
          )}
          {["dispute_category", "customer_description", ...needed].map((f) => (
            <li key={f} className="flex gap-2">
              <span className={check.missing.includes(f) ? "text-danger" : "text-ok"}>{check.missing.includes(f) ? "○" : "✓"}</span>
              {FIELD_LABELS[f] ?? f}
            </li>
          ))}
          {!needed.includes("evidence") && (
            <li className="flex gap-2 text-ink-3">
              <span>{evidence.length ? "✓" : "○"}</span> Receipts or screenshots (optional but helpful)
            </li>
          )}
        </ul>
      </Card>

      <SectionTitle>Upload evidence</SectionTitle>
      <form action={uploadEvidence} className="card space-y-3 p-4">
        <input type="hidden" name="dispute_id" value={dispute.dispute_id} />
        <input
          type="file"
          name="file"
          required
          accept="image/png,image/jpeg,image/webp,application/pdf,text/plain"
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand"
        />
        <input name="note" placeholder="What is this file? (optional)" className="input" maxLength={500} />
        <p className="text-xs text-ink-3">Receipts, screenshots or emails. PNG, JPG, WEBP, PDF or TXT up to 4 MB.</p>
        <button className="btn-secondary w-full">Upload</button>
      </form>

      {evidence.length > 0 && (
        <>
          <SectionTitle>Your files</SectionTitle>
          <ul className="space-y-2">
            {evidence.map((e) => (
              <EvidenceItem key={e.evidence_id} e={e} url={urls[e.evidence_id]}>
                {dispute.status === "draft" && e.evidence_source === "customer_upload" && (
                  <form action={removeEvidence}>
                    <input type="hidden" name="dispute_id" value={dispute.dispute_id} />
                    <input type="hidden" name="evidence_id" value={e.evidence_id} />
                    <button className="text-xs font-semibold text-danger">Remove</button>
                  </form>
                )}
              </EvidenceItem>
            ))}
          </ul>
        </>
      )}

      <form action={generateSummary} className="mt-6">
        <input type="hidden" name="dispute_id" value={dispute.dispute_id} />
        <button className="btn-primary w-full">Prepare my dispute summary</button>
        <p className="mt-2 text-center text-xs text-ink-3">We will draft a summary for you to check. Nothing is sent yet.</p>
      </form>
    </div>
  );
}

function ReviewStep({
  dispute,
  txn,
  evidence,
  catLabel,
  missing,
}: {
  dispute: Dispute;
  txn: Transaction;
  evidence: Evidence[];
  catLabel: string;
  missing?: string | string[];
}) {
  const missingList = missing ? String(missing).split(",").filter(Boolean) : [];
  if (!dispute.ai_summary) {
    return (
      <Card>
        <p className="text-sm">Your summary has not been prepared yet, or your details changed since it was made.</p>
        <form action={generateSummary} className="mt-3">
          <input type="hidden" name="dispute_id" value={dispute.dispute_id} />
          <button className="btn-primary w-full">Prepare my dispute summary</button>
        </form>
      </Card>
    );
  }
  const s = dispute.ai_summary;
  return (
    <form action={submitForReview} className="space-y-4">
      <input type="hidden" name="dispute_id" value={dispute.dispute_id} />
      {missingList.length > 0 && (
        <Notice tone="error">
          Please complete these before submitting:
          <ul className="mt-1 list-disc pl-5">
            {missingList.map((m) => (
              <li key={m}>{FIELD_LABELS[m] ?? (m === "summary" ? "Dispute summary" : m)}</li>
            ))}
          </ul>
        </Notice>
      )}

      <Card>
        <Row label="Category">{catLabel}</Row>
        <Row label="Amount">{money(txn.amount, txn.currency)}</Row>
        <Row label="Date">{dateTime(txn.transaction_date)}</Row>
        <Row label="Reference">{txn.reference_number}</Row>
        <Row label="Files attached">{evidence.length}</Row>
      </Card>

      <Card>
        <SummaryView summary={s} source={dispute.ai_summary_source} />
      </Card>

      <Card className="space-y-3">
        <div className="text-sm font-semibold">Edit before sending</div>
        <div>
          <label className="label" htmlFor="se">
            Your explanation
          </label>
          <textarea id="se" name="summary_explanation" rows={4} defaultValue={s.customer_explanation} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="sr">
            Reason for the dispute
          </label>
          <textarea id="sr" name="summary_reason" rows={2} defaultValue={s.recommended_filing_reason} className="input" />
        </div>
      </Card>

      <label className="card flex gap-3 p-3 text-sm">
        <input type="checkbox" name="confirm" className="mt-0.5 accent-[#0f3d3e]" />
        <span>I confirm the information is accurate to the best of my knowledge. I understand a bank reviewer will check it before it is filed.</span>
      </label>
      <button className="btn-primary w-full">{dispute.status === "info_required" ? "Send updated information" : "Submit for review"}</button>
    </form>
  );
}

function InfoRequest({ dispute }: { dispute: Dispute }) {
  return (
    <Notice tone="warn">
      <b>The bank asked for more information.</b> Update the details or add files, then go to Review to send it back.
      {dispute.routing_explanation ? null : null}
    </Notice>
  );
}

function Overview({
  dispute,
  txn,
  evidence,
  history,
  catLabel,
  urls,
}: {
  dispute: Dispute;
  txn: Transaction;
  evidence: Evidence[];
  history: StatusHistory[];
  catLabel: string;
  urls: Record<string, string | null>;
}) {
  const lastRequest = [...history].reverse().find((h) => h.action === "request_info" || h.action === "return_for_correction");
  const latest = history[history.length - 1];
  const days = daysUntil(dispute.filing_deadline);
  const final = dispute.status === "resolved" || dispute.status === "rejected";

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between">
          <StatusBadge status={dispute.status} />
          {dispute.submission_reference && <span className="font-mono text-xs font-semibold">{dispute.submission_reference}</span>}
        </div>
        <p className="mt-3 text-sm text-ink-2">{STATUS_EXPLANATIONS[dispute.status]}</p>
        <div className="mt-4">
          <Progress status={dispute.status} />
        </div>
        {latest && (
          <p className="mt-3 text-xs text-ink-3">
            Last updated {dateTime(latest.created_at)}
          </p>
        )}
      </Card>

      {dispute.status === "info_required" && (
        <Card className="border-[#efc4be]">
          <div className="text-sm font-semibold text-danger">Action needed</div>
          {lastRequest?.remarks && <p className="mt-1 text-sm">&ldquo;{lastRequest.remarks}&rdquo;</p>}
          <Link href={`/app/disputes/${dispute.dispute_id}?step=evidence`} className="btn-primary mt-3 w-full">
            Add information
          </Link>
        </Card>
      )}

      {dispute.status === "draft" && (
        <Link href={`/app/disputes/${dispute.dispute_id}?step=details`} className="btn-primary w-full">
          Continue my dispute
        </Link>
      )}

      {final && <Decision dispute={dispute} />}

      <Card>
        <div className="mb-2 text-sm font-semibold">Details</div>
        <Row label="Category">{catLabel}</Row>
        <Row label="Amount">{money(txn.amount, txn.currency)}</Row>
        <Row label="Transaction date">{dateTime(txn.transaction_date)}</Row>
        <Row label="Payment method">{txn.payment_method.toUpperCase()}</Row>
        <Row label="Submitted">{dispute.submitted_at ? dateTime(dispute.submitted_at) : dispute.customer_confirmed_at ? `Sent for review ${dateTime(dispute.customer_confirmed_at, "date")}` : "Not yet"}</Row>
        {dispute.filing_deadline && !final && (
          <Row label="Filing deadline">
            {dateTime(dispute.filing_deadline, "date")}
            {days !== null && <span className={cx("ml-1 text-xs", days < 14 ? "text-danger" : "text-ink-3")}>({days} days)</span>}
          </Row>
        )}
      </Card>

      {dispute.customer_description && (
        <Card>
          <div className="mb-1 text-sm font-semibold">Your explanation</div>
          <p className="text-sm text-ink-2">{dispute.ai_summary?.customer_explanation ?? dispute.customer_description}</p>
        </Card>
      )}

      {evidence.length > 0 && (
        <div>
          <SectionTitle>Submitted evidence</SectionTitle>
          <ul className="space-y-2">
            {evidence.map((e) => (
              <EvidenceItem key={e.evidence_id} e={e} url={urls[e.evidence_id]} />
            ))}
          </ul>
        </div>
      )}

      <div>
        <SectionTitle>Timeline</SectionTitle>
        <Card>
          <Timeline history={history} />
        </Card>
      </div>
    </div>
  );
}

function Decision({ dispute }: { dispute: Dispute }) {
  return (
    <Card className={dispute.status === "resolved" ? "border-[#c3e2cd]" : ""}>
      <div className="text-sm font-semibold">Bank decision</div>
      <p className="mt-1 text-base font-bold">{dispute.decision ?? (dispute.status === "resolved" ? "Resolved" : "Rejected")}</p>
      {dispute.decision_reason && (
        <div className="mt-2 rounded-xl bg-paper p-3 text-sm">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Reason given by the bank</div>
          {dispute.decision_reason}
        </div>
      )}
      {dispute.decision_explanation && (
        <div className="mt-2 rounded-xl bg-ai-soft p-3 text-sm">
          <AiLabel />
          <p className="mt-1">{dispute.decision_explanation}</p>
          <p className="mt-1 text-[11px] text-ink-3">This is a plain-language version. The bank&apos;s reason above is the official decision.</p>
        </div>
      )}
      <div className="mt-3 text-sm">
        <div className="font-semibold">What you can do next</div>
        <p className="mt-1 text-ink-2">
          {dispute.next_steps ??
            (dispute.status === "rejected"
              ? "If you disagree, you can contact the bank with new information. If you are still not satisfied, you may be able to approach the Financial Industry Disputes Resolution Centre (FIDReC)."
              : "No further action is needed. Keep your reference number for your records.")}
        </p>
      </div>
    </Card>
  );
}
