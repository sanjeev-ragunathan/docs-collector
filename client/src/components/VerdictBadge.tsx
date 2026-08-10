import type { DocVerdict } from "../types";

const STYLES: Record<DocVerdict, string> = {
  VALID: "bg-emerald-100 text-emerald-700 ring-emerald-600/20",
  WRONG_TYPE: "bg-red-100 text-red-700 ring-red-600/20",
  EXPIRED: "bg-red-100 text-red-700 ring-red-600/20",
  INCONSISTENT: "bg-amber-100 text-amber-700 ring-amber-600/20",
  LOW_CONFIDENCE: "bg-amber-100 text-amber-700 ring-amber-600/20",
  ILLEGIBLE: "bg-red-100 text-red-700 ring-red-600/20",
};

const LABELS: Record<DocVerdict, string> = {
  VALID: "Valid",
  WRONG_TYPE: "Wrong Type",
  EXPIRED: "Expired",
  INCONSISTENT: "Inconsistent",
  LOW_CONFIDENCE: "Low Confidence",
  ILLEGIBLE: "Illegible",
};

export function VerdictBadge({ verdict }: { verdict: DocVerdict }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[verdict]}`}
    >
      {LABELS[verdict]}
    </span>
  );
}
