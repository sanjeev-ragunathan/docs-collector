export type EmployeeStatus =
  | "REQUEST_SENT"
  | "REMINDER_SENT"
  | "PARTIAL_DOCS"
  | "ALL_DOCS"
  | "HR_INTERVENTION";

export interface EventRow {
  id: number;
  employeeId: number;
  type: string;
  message: string;
  createdAt: string;
}

export interface Employee {
  id: number;
  name: string;
  email: string;
  requiredDocs: string[];
  receivedDocs: string[];
  additionalMessage: string;
  status: EmployeeStatus;
  reminderCount: number;
  paused: boolean;
  nextActionAt: string | null;
  createdAt: string;
  events: EventRow[];
}

export const DOC_OPTIONS = [
  "Passport",
  "Driver's License",
  "Transcript",
  "EAD",
  "Degree Certificate",
] as const;
