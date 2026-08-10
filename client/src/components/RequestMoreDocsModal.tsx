import { useState } from "react";
import type { Employee } from "../types";
import { DOC_OPTIONS } from "../types";
import { requestMoreDocs } from "../api";

export function RequestMoreDocsModal({
  employee,
  onClose,
  onRequested,
}: {
  employee: Employee;
  onClose: () => void;
  onRequested: () => void;
}) {
  const [docs, setDocs] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDoc(doc: string) {
    setDocs((prev) => (prev.includes(doc) ? prev.filter((d) => d !== doc) : [...prev, doc]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (docs.length === 0) {
      setError("Select at least one document to request.");
      return;
    }
    setSubmitting(true);
    try {
      await requestMoreDocs(employee.id, docs);
      onRequested();
      onClose();
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Request Documents — {employee.name}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Documents</label>
            <div className="grid grid-cols-2 gap-2">
              {DOC_OPTIONS.map((doc) => (
                <label
                  key={doc}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={docs.includes(doc)}
                    onChange={() => toggleDoc(doc)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {doc}
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? "Sending..." : "Send Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
