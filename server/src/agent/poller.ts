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
import { sendMissingDocsFollowUpEmail, sendQuestionReplyEmail } from "../email/sender";

async function findEmployeeForMessage(fromAddress: string): Promise<Employee | undefined> {
  return findEmployeeByEmail(fromAddress);
}

async function handleClassifiedEmail(employee: Employee, emailBody: string, attachmentFilenames: string[]) {
  const result = await classifyEmail({
    emailBody,
    attachmentFilenames,
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
    const merged = Array.from(new Set([...employee.receivedDocs, ...result.providedDocs]));
    const stillMissing = employee.requiredDocs.filter((d) => !merged.includes(d));

    if (stillMissing.length === 0) {
      updateEmployee(employee.id, { receivedDocs: merged, status: "ALL_DOCS" });
      logEvent(employee.id, "ALL_DOCS", `All required documents received: ${merged.join(", ")}`);
    } else {
      updateEmployee(employee.id, {
        receivedDocs: merged,
        status: "PARTIAL_DOCS",
        paused: true,
      });
      logEvent(
        employee.id,
        "PARTIAL_DOCS",
        `Received: ${result.providedDocs.join(", ") || "none new"}. Still missing: ${stillMissing.join(", ")}`
      );
      const employeeAfterUpdate = getEmployee(employee.id)!;
      await sendMissingDocsFollowUpEmail(employeeAfterUpdate, stillMissing);
      logEvent(employee.id, "FOLLOW_UP_SENT", `Sent single follow-up listing missing docs: ${stillMissing.join(", ")}`);
    }
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
        const attachmentFilenames = (parsed.attachments || []).map((a) => a.filename || "attachment");

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
          await handleClassifiedEmail(freshEmployee, bodyText, attachmentFilenames);
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
