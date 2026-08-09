import type { EmployeeStatus } from "../types";

const STYLES: Record<EmployeeStatus, string> = {
  REQUEST_SENT: "bg-blue-100 text-blue-700 ring-blue-600/20",
  REMINDER_SENT: "bg-amber-100 text-amber-700 ring-amber-600/20",
  PARTIAL_DOCS: "bg-orange-100 text-orange-700 ring-orange-600/20",
  ALL_DOCS: "bg-emerald-100 text-emerald-700 ring-emerald-600/20",
  HR_INTERVENTION: "bg-red-100 text-red-700 ring-red-600/20",
};

const LABELS: Record<EmployeeStatus, string> = {
  REQUEST_SENT: "Request Sent",
  REMINDER_SENT: "Reminder Sent",
  PARTIAL_DOCS: "Partial Docs",
  ALL_DOCS: "All Docs",
  HR_INTERVENTION: "HR Intervention",
};

export function StatusBadge({ status }: { status: EmployeeStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
