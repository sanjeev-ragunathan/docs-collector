import { useEffect, useState, useCallback } from "react";
import type { Employee } from "./types";
import { fetchEmployees, runTick } from "./api";
import { AddEmployeeModal } from "./components/AddEmployeeModal";
import { EmployeeRow } from "./components/EmployeeRow";

const POLL_INTERVAL_MS = 4000;

export default function App() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [running, setRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchEmployees();
      setEmployees(data);
    } catch {
      // swallow transient poll errors
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleRunAgentNow() {
    setRunning(true);
    try {
      await runTick();
      await refresh();
    } catch {
      // no-op — surface nothing blocking for the demo
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              New Hire Document Collection
            </h1>
            <p className="text-sm text-slate-500">
              Autonomous agent for chasing down onboarding paperwork.
            </p>
          </div>
          <div className="flex gap-2">
            {/* <button
              onClick={handleRunAgentNow}
              disabled={running}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {running ? "Running..." : "Run Agent Now"}
            </button> */}
            <button
              onClick={() => setShowModal(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              + Add New Employee
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Reminders</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Docs</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <EmployeeRow key={emp.id} employee={emp} />
              ))}
            </tbody>
          </table>

          {loaded && employees.length === 0 && (
            <div className="px-6 py-16 text-center">
              <p className="text-slate-400">
                No employees yet. Click "+ Add New Employee" to start collecting documents.
              </p>
            </div>
          )}
        </div>
      </main>

      {showModal && (
        <AddEmployeeModal onClose={() => setShowModal(false)} onCreated={refresh} />
      )}
    </div>
  );
}
