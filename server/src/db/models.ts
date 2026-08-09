import { db } from "./index";

export type EmployeeStatus =
  | "REQUEST_SENT"
  | "REMINDER_SENT"
  | "PARTIAL_DOCS"
  | "ALL_DOCS"
  | "HR_INTERVENTION";

export interface EmployeeRow {
  id: number;
  name: string;
  email: string;
  requiredDocs: string; // JSON string[]
  receivedDocs: string; // JSON string[]
  additionalMessage: string;
  status: EmployeeStatus;
  reminderCount: number;
  paused: number; // 0 | 1
  nextActionAt: string | null;
  createdAt: string;
  emailSubject: string;
  lastMessageId: string | null;
  threadReferences: string;
}

export interface Employee extends Omit<EmployeeRow, "requiredDocs" | "receivedDocs" | "paused"> {
  requiredDocs: string[];
  receivedDocs: string[];
  paused: boolean;
}

export interface EventRow {
  id: number;
  employeeId: number;
  type: string;
  message: string;
  createdAt: string;
}

function rowToEmployee(row: EmployeeRow): Employee {
  return {
    ...row,
    requiredDocs: JSON.parse(row.requiredDocs),
    receivedDocs: JSON.parse(row.receivedDocs),
    paused: !!row.paused,
  };
}

export function createEmployee(input: {
  name: string;
  email: string;
  requiredDocs: string[];
  additionalMessage: string;
  nextActionAt: string;
}): Employee {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO employees (name, email, requiredDocs, receivedDocs, additionalMessage, status, reminderCount, paused, nextActionAt, createdAt)
    VALUES (@name, @email, @requiredDocs, '[]', @additionalMessage, 'REQUEST_SENT', 0, 0, @nextActionAt, @createdAt)
  `);
  const result = stmt.run({
    name: input.name,
    email: input.email,
    requiredDocs: JSON.stringify(input.requiredDocs),
    additionalMessage: input.additionalMessage,
    nextActionAt: input.nextActionAt,
    createdAt: now,
  });
  const id = result.lastInsertRowid as number;

  // Fixed once at creation so every email in the thread reuses the exact same
  // subject line — that's what Gmail's threading keys off (along with the
  // In-Reply-To/References headers set in email/sender.ts).
  const emailSubject = `Onboarding Documents – ${input.name}`;
  db.prepare(`UPDATE employees SET emailSubject = ? WHERE id = ?`).run(emailSubject, id);

  return getEmployee(id)!;
}

export function getEmployee(id: number): Employee | undefined {
  const row = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(id) as EmployeeRow | undefined;
  return row ? rowToEmployee(row) : undefined;
}

export function listEmployees(): Employee[] {
  const rows = db.prepare(`SELECT * FROM employees ORDER BY createdAt DESC`).all() as EmployeeRow[];
  return rows.map(rowToEmployee);
}

export function findEmployeeByEmail(email: string): Employee | undefined {
  const row = db
    .prepare(`SELECT * FROM employees WHERE lower(email) = lower(?)`)
    .get(email) as EmployeeRow | undefined;
  return row ? rowToEmployee(row) : undefined;
}

export function updateEmployee(
  id: number,
  fields: Partial<{
    status: EmployeeStatus;
    reminderCount: number;
    paused: boolean;
    nextActionAt: string | null;
    receivedDocs: string[];
  }>
): void {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };

  if (fields.status !== undefined) {
    sets.push("status = @status");
    params.status = fields.status;
  }
  if (fields.reminderCount !== undefined) {
    sets.push("reminderCount = @reminderCount");
    params.reminderCount = fields.reminderCount;
  }
  if (fields.paused !== undefined) {
    sets.push("paused = @paused");
    params.paused = fields.paused ? 1 : 0;
  }
  if (fields.nextActionAt !== undefined) {
    sets.push("nextActionAt = @nextActionAt");
    params.nextActionAt = fields.nextActionAt;
  }
  if (fields.receivedDocs !== undefined) {
    sets.push("receivedDocs = @receivedDocs");
    params.receivedDocs = JSON.stringify(fields.receivedDocs);
  }
  if (sets.length === 0) return;

  db.prepare(`UPDATE employees SET ${sets.join(", ")} WHERE id = @id`).run(params);
}

/**
 * Records a message (inbound or outbound) as the newest one in the employee's
 * email thread, so the next outbound email can set In-Reply-To/References to
 * keep everything in one Gmail thread instead of starting a new conversation.
 */
export function recordThreadMessage(employeeId: number, messageId: string): void {
  const employee = getEmployee(employeeId);
  if (!employee) return;
  const threadReferences = employee.threadReferences
    ? `${employee.threadReferences} ${messageId}`
    : messageId;
  db.prepare(`UPDATE employees SET lastMessageId = ?, threadReferences = ? WHERE id = ?`).run(
    messageId,
    threadReferences,
    employeeId
  );
}

export function logEvent(employeeId: number, type: string, message: string): void {
  db.prepare(
    `INSERT INTO events (employeeId, type, message, createdAt) VALUES (?, ?, ?, ?)`
  ).run(employeeId, type, message, new Date().toISOString());
}

export function listEventsForEmployee(employeeId: number): EventRow[] {
  return db
    .prepare(`SELECT * FROM events WHERE employeeId = ? ORDER BY createdAt ASC`)
    .all(employeeId) as EventRow[];
}

export function listEmployeesForTick(): Employee[] {
  const rows = db
    .prepare(
      `SELECT * FROM employees WHERE paused = 0 AND status NOT IN ('ALL_DOCS', 'HR_INTERVENTION')`
    )
    .all() as EmployeeRow[];
  return rows.map(rowToEmployee);
}
