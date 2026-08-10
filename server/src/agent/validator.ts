import Anthropic from "@anthropic-ai/sdk";
import { config } from "../lib/config";
import type { Employee } from "../db/models";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

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
  docType: string; // key this validation is stored under (detected type, or "Unknown (<filename>)")
  detectedType: string;
  verdict: DocVerdict;
  confidence: number;
  fields: DocFields;
  issues: string[];
  filename: string;
  validatedAt: string;
}

export interface RawAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

const RESUBMIT_VERDICTS: DocVerdict[] = ["WRONG_TYPE", "EXPIRED", "ILLEGIBLE"];

const VERDICT_EXPLANATION: Record<DocVerdict, string> = {
  VALID: "",
  WRONG_TYPE: "the file you sent doesn't match a document type we still need from you",
  EXPIRED: "the document has expired",
  ILLEGIBLE: "the scan/photo was too blurry, cropped, or unreadable to verify",
  INCONSISTENT: "the details on it didn't match your other documents",
  LOW_CONFIDENCE: "we couldn't confidently verify the details on it",
};

/**
 * Derives the current "what's still outstanding" picture for an employee purely from
 * requiredDocs + docValidations — no fresh attachments needed. Used both right after a
 * submission (to compose the feedback email) and later by the cron-driven follow-up
 * reminder (which has no new email to work from, only what's already on file).
 *
 * Every flagged submission is surfaced with its specific reason, even when its detected
 * type doesn't line up with a required doc's name (e.g. a WRONG_TYPE submission is, by
 * definition, never the type we asked for — and an illegible file is stored under a
 * generic "Unknown (filename)" key) — otherwise that reason silently vanishes and the
 * candidate just gets a bare "still waiting on X" with no explanation.
 */
export function summarizeDocState(employee: {
  requiredDocs: string[];
  docValidations: DocValidation[];
}): {
  notReceived: string[];
  needsResubmission: { docType: string; reason: string }[];
} {
  const validTypes = new Set(
    employee.docValidations.filter((v) => v.verdict === "VALID").map((v) => v.docType)
  );
  const stillMissing = employee.requiredDocs.filter((d) => !validTypes.has(d));

  const flagged = employee.docValidations.filter((v) => RESUBMIT_VERDICTS.includes(v.verdict));

  const needsResubmission = flagged.map((v) => {
    const label = employee.requiredDocs.includes(v.docType)
      ? v.docType
      : `"${v.filename}" (detected as ${v.detectedType})`;
    const reason = v.issues[0] || VERDICT_EXPLANATION[v.verdict];
    return { docType: label, reason };
  });

  // A still-missing required doc only counts as "flagged" (and thus excluded from the plain
  // not-received list) when a rejected submission's detected type actually matches its name —
  // an unrelated wrong-type file doesn't explain away a document that was never attempted.
  const flaggedRequiredTypes = new Set(flagged.map((v) => v.docType));
  const notReceived = stillMissing.filter((d) => !flaggedRequiredTypes.has(d));

  return { notReceived, needsResubmission };
}

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);
const SUPPORTED_PDF_TYPE = "application/pdf";

const DOC_TYPES = ["Passport", "Driver's License", "Transcript", "EAD", "Degree Certificate", "Unknown"];

const VALIDATION_SYSTEM_PROMPT = `You are a document verification assistant for an HR onboarding
system. You will be shown one attachment a candidate submitted and told which document type(s)
are still needed from them. Examine the document image/PDF and respond with ONLY a JSON object,
no other text, matching this exact shape:

{
  "detectedType": "Passport"|"Driver's License"|"Transcript"|"EAD"|"Degree Certificate"|"Unknown",
  "matchesRequested": boolean,
  "fields": { "fullName": string|null, "dateOfBirth": string|null (ISO date or null), "expirationDate": string|null (ISO date or null), "documentNumber": string|null },
  "legible": boolean,
  "missingExpectedElements": string[],
  "confidence": number (0-1),
  "issues": string[]
}

"matchesRequested" is true only if detectedType is one of the still-needed document types given
to you. "legible" is false if the scan/photo is blurry, cropped, or otherwise unreadable. Do not
claim to detect forgery or tampering — only report legibility, extracted fields, and type match.`;

function attachmentBlock(att: RawAttachment, mime: string, kind: "image" | "document") {
  const data = att.content.toString("base64");
  if (kind === "image") {
    return {
      type: "image" as const,
      source: { type: "base64" as const, media_type: mime as "image/jpeg" | "image/png", data },
    };
  }
  return {
    type: "document" as const,
    source: { type: "base64" as const, media_type: "application/pdf" as const, data },
  };
}

async function classifyAttachment(
  att: RawAttachment,
  mime: string,
  kind: "image" | "document",
  neededDocTypes: string[]
): Promise<{
  detectedType: string;
  matchesRequested: boolean;
  fields: DocFields;
  legible: boolean;
  missingExpectedElements: string[];
  confidence: number;
  issues: string[];
} | null> {
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: VALIDATION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          attachmentBlock(att, mime, kind),
          {
            type: "text",
            text: `File name: ${att.filename}\nStill-needed document types: ${JSON.stringify(
              neededDocTypes
            )}\n\nValidate this document now. Respond with only the JSON object.`,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "{}";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      detectedType: DOC_TYPES.includes(parsed.detectedType) ? parsed.detectedType : "Unknown",
      matchesRequested: !!parsed.matchesRequested,
      fields: {
        fullName: parsed.fields?.fullName ?? null,
        dateOfBirth: parsed.fields?.dateOfBirth ?? null,
        expirationDate: parsed.fields?.expirationDate ?? null,
        documentNumber: parsed.fields?.documentNumber ?? null,
      },
      legible: !!parsed.legible,
      missingExpectedElements: Array.isArray(parsed.missingExpectedElements)
        ? parsed.missingExpectedElements
        : [],
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  } catch {
    return null;
  }
}

function normalize(s: string | null): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

function isNearExpiry(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const daysAway = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return daysAway >= 0 && daysAway <= 30;
}

/**
 * Validates each newly-received attachment with one Claude multimodal call per attachment,
 * then applies deterministic checks (expiration, cross-document identity consistency,
 * duplicates) in code. Returns the full merged validation list (existing + upserted new
 * results, keyed by docType) plus just the newly-produced results for this batch.
 */
export async function validateAttachments(
  employee: Employee,
  attachments: RawAttachment[]
): Promise<{ merged: DocValidation[]; newResults: DocValidation[] }> {
  const existing = employee.docValidations;
  const newResults: DocValidation[] = [];

  for (const att of attachments) {
    const mime = (att.contentType || "").toLowerCase();
    const isImage = SUPPORTED_IMAGE_TYPES.has(mime);
    const isPdf = mime === SUPPORTED_PDF_TYPE;
    const now = new Date().toISOString();

    if (!isImage && !isPdf) {
      newResults.push({
        docType: `Unknown (${att.filename})`,
        detectedType: "Unknown",
        verdict: "ILLEGIBLE",
        confidence: 0,
        fields: { fullName: null, dateOfBirth: null, expirationDate: null, documentNumber: null },
        issues: [`Unsupported file type for validation: ${att.contentType || "unknown"}`],
        filename: att.filename,
        validatedAt: now,
      });
      continue;
    }

    const stillNeeded = employee.requiredDocs.filter(
      (d) => ![...existing, ...newResults].some((v) => v.docType === d && v.verdict === "VALID")
    );

    const llm = await classifyAttachment(att, mime, isImage ? "image" : "document", stillNeeded);

    if (!llm) {
      newResults.push({
        docType: `Unknown (${att.filename})`,
        detectedType: "Unknown",
        verdict: "LOW_CONFIDENCE",
        confidence: 0,
        fields: { fullName: null, dateOfBirth: null, expirationDate: null, documentNumber: null },
        issues: ["Validation model returned an unparseable response."],
        filename: att.filename,
        validatedAt: now,
      });
      continue;
    }

    const issues = [...llm.issues];
    if (llm.missingExpectedElements.length > 0) {
      issues.push(`Missing expected elements: ${llm.missingExpectedElements.join(", ")}`);
    }

    let verdict: DocVerdict;
    if (!llm.legible) {
      verdict = "ILLEGIBLE";
    } else if (llm.confidence < config.confidenceThreshold) {
      verdict = "LOW_CONFIDENCE";
    } else if (!llm.matchesRequested) {
      verdict = "WRONG_TYPE";
      issues.push(`Detected "${llm.detectedType}" but this document was not one of the required types still outstanding.`);
    } else if (isExpired(llm.fields.expirationDate)) {
      verdict = "EXPIRED";
      issues.push(`Document expired on ${llm.fields.expirationDate}.`);
    } else {
      verdict = "VALID";
      if (isNearExpiry(llm.fields.expirationDate)) {
        issues.push(`Expires soon (${llm.fields.expirationDate}) — within 30 days.`);
      }
    }

    const docType =
      verdict === "ILLEGIBLE" || llm.detectedType === "Unknown"
        ? `Unknown (${att.filename})`
        : llm.detectedType;

    newResults.push({
      docType,
      detectedType: llm.detectedType,
      verdict,
      confidence: llm.confidence,
      fields: llm.fields,
      issues,
      filename: att.filename,
      validatedAt: now,
    });
  }

  // Cross-document identity consistency check, run across everything valid-so-far
  // (existing VALID/INCONSISTENT-eligible docs + this batch's VALID candidates).
  const pool = [...existing, ...newResults].filter(
    (v) => v.verdict === "VALID" && (v.fields.fullName || v.fields.dateOfBirth)
  );
  for (const result of newResults) {
    if (result.verdict !== "VALID") continue;
    const conflict = pool.find(
      (other) =>
        other !== result &&
        ((normalize(other.fields.fullName) &&
          normalize(result.fields.fullName) &&
          normalize(other.fields.fullName) !== normalize(result.fields.fullName)) ||
          (normalize(other.fields.dateOfBirth) &&
            normalize(result.fields.dateOfBirth) &&
            normalize(other.fields.dateOfBirth) !== normalize(result.fields.dateOfBirth)))
    );
    if (conflict) {
      result.verdict = "INCONSISTENT";
      result.issues.push(
        `Identity fields disagree with previously validated "${conflict.docType}" (name/DOB mismatch).`
      );
    }
  }

  // Duplicate detection: same detectedType + documentNumber already validated.
  for (const result of newResults) {
    if (!result.fields.documentNumber) continue;
    const dupe = [...existing, ...newResults].find(
      (other) =>
        other !== result &&
        other.detectedType === result.detectedType &&
        other.fields.documentNumber &&
        normalize(other.fields.documentNumber) === normalize(result.fields.documentNumber)
    );
    if (dupe) {
      result.issues.push(`Duplicate submission: document number matches "${dupe.docType}" already on file.`);
    }
  }

  // Merge into existing list, upserting by docType.
  const byDocType = new Map(existing.map((v) => [v.docType, v]));
  for (const result of newResults) {
    byDocType.set(result.docType, result);
  }

  return { merged: Array.from(byDocType.values()), newResults };
}
