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

export type DocVerdict =
  | "VALID"
  | "WRONG_TYPE"
  | "EXPIRED"
  | "INCONSISTENT"
  | "LOW_CONFIDENCE"
  | "ILLEGIBLE";

export interface DocFields {
  fullName: string | null;
  dateOfBirth: string | null;
  expirationDate: string | null;
  documentNumber: string | null;
}

export interface DocValidation {
  docType: string;
  detectedType: string;
  verdict: DocVerdict;
  confidence: number;
  fields: DocFields;
  issues: string[];
  filename: string;
  validatedAt: string;
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
  docValidations: DocValidation[];
  events: EventRow[];
}

export const DOC_OPTIONS = [
  "Passport",
  "Driver's License",
  "Transcript",
  "EAD",
  "Degree Certificate",
] as const;
