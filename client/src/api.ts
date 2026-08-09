import type { Employee } from "./types";

const BASE = "/api";

export async function fetchEmployees(): Promise<Employee[]> {
  const res = await fetch(`${BASE}/employees`);
  if (!res.ok) throw new Error("Failed to fetch employees");
  return res.json();
}

export async function createEmployee(input: {
  name: string;
  email: string;
  requiredDocs: string[];
  additionalMessage: string;
}): Promise<Employee> {
  const res = await fetch(`${BASE}/employees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to create employee" }));
    throw new Error(err.error || "Failed to create employee");
  }
  return res.json();
}

export async function runTick(): Promise<void> {
  const res = await fetch(`${BASE}/tick`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to run agent tick");
}
