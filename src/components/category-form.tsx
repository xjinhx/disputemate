"use client";

import { useState } from "react";
import { CATEGORY_QUESTIONS } from "@/lib/domain/rules";
import type { DisputeCategory, DisputeCategoryKey, Transaction } from "@/lib/domain/types";

interface Props {
  disputeId: string;
  categories: DisputeCategory[];
  initialCategory: DisputeCategoryKey | null;
  description: string;
  answers: Record<string, string>;
  relatedOptions: Transaction[];
  relatedId: string | null;
  action: (fd: FormData) => Promise<void>;
}

export function CategoryForm(p: Props) {
  const [category, setCategory] = useState<DisputeCategoryKey | null>(p.initialCategory);
  const [desc, setDesc] = useState(p.description);
  const questions = category ? CATEGORY_QUESTIONS[category] : [];

  return (
    <form action={p.action} className="space-y-5">
      <input type="hidden" name="dispute_id" value={p.disputeId} />

      <fieldset>
        <legend className="label">What went wrong?</legend>
        <div className="space-y-2">
          {p.categories.map((c) => (
            <label
              key={c.key}
              className={`card flex cursor-pointer gap-3 p-3 ${category === c.key ? "border-brand-2 ring-2 ring-brand-soft" : ""}`}
            >
              <input
                type="radio"
                name="dispute_category"
                value={c.key}
                checked={category === c.key}
                onChange={() => setCategory(c.key)}
                className="mt-1 accent-[#0f3d3e]"
              />
              <span>
                <span className="block text-sm font-semibold">{c.label}</span>
                <span className="block text-xs text-ink-2">{c.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="desc" className="label">
          Tell us what happened
        </label>
        <textarea
          id="desc"
          name="customer_description"
          rows={5}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="For example: I was charged twice for the same purchase at ABC Store on 5 Nov."
          className="input"
          maxLength={4000}
        />
        <p className={`mt-1 text-xs ${desc.trim().length < 20 ? "text-ink-3" : "text-ok"}`}>
          {desc.trim().length < 20 ? `At least 20 characters (${desc.trim().length}/20)` : "Looks good"}
        </p>
      </div>

      {category === "duplicate" && (
        <div>
          <label htmlFor="related" className="label">
            Which charge is the original?
          </label>
          <select id="related" name="related_transaction_id" defaultValue={p.relatedId ?? ""} className="input">
            <option value="">Select the matching charge</option>
            {p.relatedOptions.map((t) => (
              <option key={t.transaction_id} value={t.transaction_id}>
                {t.merchant_name} · S${Number(t.amount).toFixed(2)} ·{" "}
                {new Date(t.transaction_date).toLocaleString("en-SG", { timeZone: "Asia/Singapore", dateStyle: "medium", timeStyle: "short" })}
              </option>
            ))}
          </select>
        </div>
      )}

      {questions.length > 0 && (
        <div className="space-y-3">
          <div className="label">A few quick questions</div>
          {questions.map((q) => (
            <div key={q.id} className="card p-3">
              <div className="text-sm font-medium">
                {q.label} {q.required && <span className="text-danger">*</span>}
              </div>
              {q.type === "yesno" ? (
                <div className="mt-2 flex gap-4 text-sm">
                  {["yes", "no"].map((v) => (
                    <label key={v} className="flex items-center gap-1.5 capitalize">
                      <input type="radio" name={`q_${q.id}`} value={v} defaultChecked={p.answers[q.id] === v} className="accent-[#0f3d3e]" />
                      {v}
                    </label>
                  ))}
                </div>
              ) : (
                <input name={`q_${q.id}`} defaultValue={p.answers[q.id] ?? ""} className="input mt-2" />
              )}
            </div>
          ))}
        </div>
      )}

      <button className="btn-primary w-full" disabled={!category}>
        Save and continue
      </button>
    </form>
  );
}
