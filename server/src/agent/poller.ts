import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { config } from "../lib/config";
import {
  findEmployeeByEmail,
  getEmployee,
  logEvent,
  recordThreadMessage,
  updateEmployee,
  type Employee,
} from "../db/models";
import { classifyEmail } from "./classifier";
import { summarizeDocState, validateAttachments, type RawAttachment } from "./validator";
import { sendDocumentFeedbackEmail, sendQuestionReplyEmail, sendTooManyDocumentsEmail } from "../email/sender";

async function findEmployeeForMessage(fromAddress: string): Promise<Employee | undefined> {
  return findEmployeeByEmail(fromAddress);
}

async function handleClassifiedEmail(
  employee: Employee,
  emailBody: string,
  attachments: RawAttachment[]
) {
  const result = await classifyEmail({
    emailBody,
    attachmentFilenames: attachments.map((a) => a.filename),
    requiredDocs: employee.requiredDocs,
    receivedDocs: employee.receivedDocs,
  });

  if (result.type === "question") {
    if (result.inScope) {
      await sendQuestionReplyEmail(employee, result.answer);
      logEvent(employee.id, "QUESTION_ANSWERED", `Answered in-scope question: "${result.answer}"`);
    } else {
      updateEmployee(employee.id, { paused: true, status: "HR_INTERVENTION" });
      logEvent(
        employee.id,
        "HR_INTERVENTION",
        `Out-of-scope question received. Paused and escalated to HR: "${emailBody.slice(0, 200)}"`
      );
    }
    return;
  }

  if (result.type === "documents") {
    const stillNeeded = employee.requiredDocs.filter(
      (d) => !employee.docValidations.some((v) => v.docType === d && v.verdict === "VALID")
    );

    if (attachments.length > stillNeeded.length) {
      await sendTooManyDocumentsEmail(employee, stillNeeded);
      logEvent(
        employee.id,
        "TOO_MANY_DOCS",
        `Received ${attachments.length} attachment(s) but only ${stillNeeded.length} document(s) are still needed. Asked candidate to resend only what's requested.`
      );
      return;
    }

    const { merged, newResults } = await validateAttachments(employee, attachments);

    for (const r of newResults) {
      logEvent(
        employee.id,
        "DOC_VALIDATED",
        `"${r.filename}" → ${r.docType} — ${r.verdict} (confidence ${r.confidence.toFixed(2)})${
          r.issues.length ? `. Issues: ${r.issues.join("; ")}` : ""
        }`
      );
    }

    const receivedDocs = employee.requiredDocs.filter((d) =>
      merged.some((v) => v.docType === d && v.verdict === "VALID")
    );
    const needsHumanReview = newResults.some(
      (r) => r.verdict === "INCONSISTENT" || r.verdict === "LOW_CONFIDENCE"
    );

    if (needsHumanReview) {
      updateEmployee(employee.id, {
        receivedDocs,
        docValidations: merged,
        paused: true,
        status: "HR_INTERVENTION",
      });
      const flagged = newResults.filter(
        (r) => r.verdict === "INCONSISTENT" || r.verdict === "LOW_CONFIDENCE"
      );
      logEvent(
        employee.id,
        "HR_INTERVENTION",
        `Document(s) need human review: ${flagged.map((r) => `${r.docType} (${r.verdict})`).join(", ")}`
      );
      return;
    }

    const stillMissing = employee.requiredDocs.filter((d) => !receivedDocs.includes(d));

    if (stillMissing.length === 0) {
      updateEmployee(employee.id, { receivedDocs, docValidations: merged, status: "ALL_DOCS" });
      logEvent(employee.id, "ALL_DOCS", `All required documents received and validated: ${receivedDocs.join(", ")}`);
      return;
    }

    // Unpaused (not indefinitely paused): the normal reminder cadence (reminderCount/
    // MAX_REMINDERS in tick.ts) picks this back up automatically if the candidate doesn't
    // respond again, using the same detailed "what's still outstanding" content.
    const nextActionAt = new Date(Date.now() + config.reminderGapMinutes * 60_000).toISOString();
    updateEmployee(employee.id, {
      receivedDocs,
      docValidations: merged,
      status: "PARTIAL_DOCS",
      paused: false,
      nextActionAt,
    });

    const { notReceived, needsResubmission } = summarizeDocState({
      requiredDocs: employee.requiredDocs,
      docValidations: merged,
    });

    logEvent(employee.id, "PARTIAL_DOCS", `Still missing: ${stillMissing.join(", ")}`);

    const employeeAfterUpdate = getEmployee(employee.id)!;
    await sendDocumentFeedbackEmail(employeeAfterUpdate, notReceived, needsResubmission);
    logEvent(employee.id, "FOLLOW_UP_SENT", `Sent document feedback email.`);
    return;
  }

  logEvent(employee.id, "OTHER", `Email classified as other, no action taken.`);
}

export async function pollInbox(): Promise<void> {
  const client = new ImapFlow({
    host: config.imapHost,
    port: 993,
    secure: true,
    auth: {
      user: config.gmailUser,
      pass: config.gmailAppPassword,
    },
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      if (!uids || uids.length === 0) return;

      for (const uid of uids) {
        const message = await client.fetchOne(String(uid), { source: true, uid: true }, { uid: true });
        if (!message || !message.source) continue;

        const parsed = await simpleParser(message.source);
        const fromAddress = parsed.from?.value?.[0]?.address || "";
        const bodyText = parsed.text || parsed.html?.toString() || "";
        // Attachment bytes come straight from the parsed MIME source (already in memory
        // from the fetch above) — never written to disk, discarded once this loop iteration ends.
        const attachments: RawAttachment[] = (parsed.attachments || []).map((a) => ({
          filename: a.filename || "attachment",
          contentType: a.contentType || "",
          content: a.content,
        }));

        // Mark seen regardless of whether we can match, to avoid reprocessing loops.
        await client.messageFlagsAdd({ uid: String(uid) } as any, ["\\Seen"], { uid: true });

        const employee = await findEmployeeForMessage(fromAddress);
        if (!employee) {
          continue;
        }

        // Record this inbound message as the thread head *before* replying, so
        // our reply's In-Reply-To/References point at the message the
        // candidate actually just sent, keeping everything in one Gmail thread.
        if (parsed.messageId) {
          recordThreadMessage(employee.id, parsed.messageId);
        }
        const freshEmployee = getEmployee(employee.id)!;

        try {
          await handleClassifiedEmail(freshEmployee, bodyText, attachments);
        } catch (err: any) {
          logEvent(employee.id, "ERROR", `Failed to process inbound email: ${err.message}`);
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}
