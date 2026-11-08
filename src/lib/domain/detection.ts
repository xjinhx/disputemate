import type { Transaction } from "./types";

/**
 * FR-03 deterministic detection rules. Detection never files a dispute; it
 * only produces alerts that the customer confirms or dismisses.
 */
export interface DetectionSettings {
  duplicateWindowMinutes: number;
  duplicateEnabled: boolean;
  failedDebitEnabled: boolean;
}

export const DEFAULT_DETECTION: DetectionSettings = {
  duplicateWindowMinutes: 30,
  duplicateEnabled: true,
  failedDebitEnabled: true,
};

export interface DetectedAlert {
  alert_type: "duplicate" | "failed_debited";
  transaction_id: string;
  related_transaction_id: string | null;
  explanation: string;
  dedupe_key: string;
}

const normaliseMerchant = (m: string) => m.trim().toLowerCase().replace(/\s+/g, " ");

export function detectDuplicates(txns: Transaction[], windowMinutes: number): DetectedAlert[] {
  const eligible = txns
    .filter((t) => t.transaction_status === "success")
    .sort((a, b) => +new Date(a.transaction_date) - +new Date(b.transaction_date));

  const alerts: DetectedAlert[] = [];
  const flagged = new Set<string>();
  const windowMs = windowMinutes * 60_000;

  for (let i = 0; i < eligible.length; i++) {
    const a = eligible[i];
    for (let j = i + 1; j < eligible.length; j++) {
      const b = eligible[j];
      const gap = +new Date(b.transaction_date) - +new Date(a.transaction_date);
      if (gap > windowMs) break;
      if (flagged.has(b.transaction_id)) continue;
      if (
        normaliseMerchant(a.merchant_name) === normaliseMerchant(b.merchant_name) &&
        Number(a.amount) === Number(b.amount) &&
        a.currency === b.currency
      ) {
        const mins = Math.round(gap / 60_000);
        flagged.add(b.transaction_id);
        alerts.push({
          alert_type: "duplicate",
          // The later charge is the one the customer would dispute.
          transaction_id: b.transaction_id,
          related_transaction_id: a.transaction_id,
          explanation: `Two successful charges of ${a.currency} ${Number(a.amount).toFixed(2)} at ${a.merchant_name} were made ${mins} minute${mins === 1 ? "" : "s"} apart (within the ${windowMinutes}-minute duplicate window).`,
          dedupe_key: `duplicate:${a.transaction_id}:${b.transaction_id}`,
        });
      }
    }
  }
  return alerts;
}

export function detectFailedDebits(txns: Transaction[]): DetectedAlert[] {
  return txns
    .filter((t) => t.transaction_status === "failed" && t.account_debited)
    .map((t) => ({
      alert_type: "failed_debited" as const,
      transaction_id: t.transaction_id,
      related_transaction_id: null,
      explanation: `This ${t.payment_method.toUpperCase()} transaction is marked as failed, but ${t.currency} ${Number(t.amount).toFixed(2)} was debited from your account.`,
      dedupe_key: `failed_debited:${t.transaction_id}`,
    }));
}

export function runDetection(txns: Transaction[], settings: DetectionSettings = DEFAULT_DETECTION) {
  return [
    ...(settings.duplicateEnabled ? detectDuplicates(txns, settings.duplicateWindowMinutes) : []),
    ...(settings.failedDebitEnabled ? detectFailedDebits(txns) : []),
  ];
}
