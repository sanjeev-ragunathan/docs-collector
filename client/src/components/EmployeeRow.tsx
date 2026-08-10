import { useState } from "react";
import type { Employee } from "../types";
import { StatusBadge } from "./StatusBadge";
import { VerdictBadge } from "./VerdictBadge";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EmployeeRow({
  employee,
  onRequestMoreDocs,
}: {
  employee: Employee;
  onRequestMoreDocs: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        onClick={() => setExpanded((e) => !e)}
        className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              className={`text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`}
            >
              ▶
            </span>
            <span className="font-medium text-slate-900">{employee.name}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-slate-600">{employee.email}</td>
        <td className="px-4 py-3 text-slate-600">
          {employee.reminderCount}
          <span className="text-slate-400"> / 3</span>
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={employee.status} />
        </td>
        <td className="px-4 py-3 text-slate-500">
          {employee.receivedDocs.length}/{employee.requiredDocs.length} received
        </td>
        <td className="px-4 py-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRequestMoreDocs();
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Request More Docs
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-slate-100 bg-slate-50/70">
          <td colSpan={6} className="px-4 py-4">
            <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-500">
              <span>
                <span className="font-medium text-slate-600">Required:</span>{" "}
                {employee.requiredDocs.join(", ")}
              </span>
              <span>
                <span className="font-medium text-slate-600">Received:</span>{" "}
                {employee.receivedDocs.length ? employee.receivedDocs.join(", ") : "none yet"}
              </span>
              {employee.additionalMessage && (
                <span>
                  <span className="font-medium text-slate-600">Note:</span>{" "}
                  {employee.additionalMessage}
                </span>
              )}
            </div>
            {employee.docValidations.length > 0 && (
              <>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Document Validation
                </h4>
                <div className="mb-4 grid gap-2 sm:grid-cols-2">
                  {employee.docValidations.map((v) => (
                    <div
                      key={v.docType}
                      className="rounded-lg border border-slate-200 bg-white p-3 text-xs"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-700">{v.docType}</span>
                        <VerdictBadge verdict={v.verdict} />
                      </div>
                      <p className="text-slate-400">
                        {v.filename} · confidence {(v.confidence * 100).toFixed(0)}%
                      </p>
                      {(v.fields.fullName || v.fields.dateOfBirth || v.fields.expirationDate) && (
                        <p className="mt-1 text-slate-500">
                          {v.fields.fullName && <>{v.fields.fullName}</>}
                          {v.fields.dateOfBirth && <> · DOB {v.fields.dateOfBirth}</>}
                          {v.fields.expirationDate && <> · Expires {v.fields.expirationDate}</>}
                        </p>
                      )}
                      {v.issues.length > 0 && (
                        <ul className="mt-1 list-disc pl-4 text-slate-500">
                          {v.issues.map((issue, i) => (
                            <li key={i}>{issue}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Event Timeline
            </h4>
            {employee.events.length === 0 ? (
              <p className="text-sm text-slate-400">No events yet.</p>
            ) : (
              <ol className="space-y-2 border-l-2 border-slate-200 pl-4">
                {employee.events.map((ev) => (
                  <li key={ev.id} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-indigo-400" />
                    <span className="font-medium text-slate-700">{ev.type}</span>
                    <span className="ml-2 text-slate-400">{formatDate(ev.createdAt)}</span>
                    <p className="text-slate-600">{ev.message}</p>
                  </li>
                ))}
              </ol>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
