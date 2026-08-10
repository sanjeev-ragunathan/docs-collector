import nodemailer from "nodemailer";
import { config } from "../lib/config";
import { recordThreadMessage, type Employee } from "../db/models";
import { summarizeDocState } from "../agent/validator";

const transporter = nodemailer.createTransport({
  host: config.smtpHost,
  port: 465,
  secure: true,
  auth: {
    user: config.gmailUser,
    pass: config.gmailAppPassword,
  },
});

/**
 * Sends an email and, when the employee already has a thread going, sets
 * In-Reply-To/References so Gmail (and any RFC 5322-aware client) keeps it
 * in the same conversation instead of starting a new one. Records whatever
 * Message-ID this send generates as the new head of that thread.
 */
async function sendThreadedMail(employee: Employee, subject: string, text: string): Promise<void> {
  const info = await transporter.sendMail({
    from: config.gmailUser,
    to: employee.email,
    subject,
    text,
    inReplyTo: employee.lastMessageId || undefined,
    references: employee.threadReferences || undefined,
  });
  if (info.messageId) {
    recordThreadMessage(employee.id, info.messageId);
  }
}

function signOff(): string {
  return `Warm regards,\nHR Onboarding Team`;
}

const SUBMISSION_NOTE =
  "Please send only the number of documents requested. And if a document has multiple pages it is recommended to combine it all into a single respective document.";

/** Every email after the first replies to the same subject/thread. */
function replySubject(employee: Employee): string {
  return `Re: ${employee.emailSubject}`;
}

export async function sendInitialRequestEmail(employee: Employee): Promise<void> {
  const docList = employee.requiredDocs.map((d) => `  - ${d}`).join("\n");
  const extra = employee.additionalMessage ? `\n${employee.additionalMessage}\n` : "";
  const text = `Hi ${employee.name},

Welcome aboard! To get your onboarding paperwork moving, please reply to this email with the following documents attached:

${docList}
${extra}
You can reply directly to this email with the files attached, or ask any questions and we'll help.

${SUBMISSION_NOTE}

${signOff()}`;
  // First email in the thread — no In-Reply-To/References yet.
  await sendThreadedMail(employee, employee.emailSubject, text);
}

/**
 * The one ongoing reminder cadence (reminderCount/MAX_REMINDERS) — used whether the
 * candidate hasn't responded at all yet, or has submitted something but it's still
 * partial/invalid. Content always reflects exactly what's currently outstanding.
 */
export async function sendReminderEmail(employee: Employee): Promise<void> {
  const { notReceived, needsResubmission } = summarizeDocState(employee);
  const extra = employee.additionalMessage ? `\n${employee.additionalMessage}\n` : "";
  const text = `Hi ${employee.name},

Just a friendly reminder — we're still waiting on a few onboarding documents from you. ${buildDocStatusSections(
    notReceived,
    needsResubmission
  )}
${extra}
Please reply to this email with these attached at your earliest convenience.

${SUBMISSION_NOTE}

${signOff()}`;
  await sendThreadedMail(employee, replySubject(employee), text);
}

export async function sendTooManyDocumentsEmail(employee: Employee, stillNeeded: string[]): Promise<void> {
  const body =
    stillNeeded.length > 0
      ? `We received more attachments than we currently need. Please resend with only the following still-outstanding document(s):\n\n${stillNeeded
          .map((d) => `  - ${d}`)
          .join("\n")}`
      : `We received more attachments than we currently need — we don't have any outstanding documents to collect from you right now.`;

  const text = `Hi ${employee.name},

${body}

${SUBMISSION_NOTE}

${signOff()}`;
  await sendThreadedMail(employee, replySubject(employee), text);
}

export async function sendAdditionalDocsRequestEmail(employee: Employee, newDocs: string[]): Promise<void> {
  const docList = newDocs.map((d) => `  - ${d}`).join("\n");
  const text = `Hi ${employee.name},

Thanks again for everything you've sent so far. We need a couple of additional documents to complete your onboarding:

${docList}

Please reply to this email with these attached.

${SUBMISSION_NOTE}

${signOff()}`;
  await sendThreadedMail(employee, replySubject(employee), text);
}

function buildDocStatusSections(
  notReceived: string[],
  needsResubmission: { docType: string; reason: string }[]
): string {
  const sections: string[] = [];

  if (needsResubmission.length > 0) {
    const list = needsResubmission
      .map((d) => `  - ${d.docType} — ${d.reason}. Please resend a clear, current, valid copy.`)
      .join("\n");
    sections.push(`We couldn't accept the following — here's exactly why, and what we need instead:\n\n${list}`);
  }

  if (notReceived.length > 0) {
    const list = notReceived.map((d) => `  - ${d}`).join("\n");
    sections.push(`We still haven't received:\n\n${list}`);
  }

  return sections.join("\n\n");
}

export async function sendDocumentFeedbackEmail(
  employee: Employee,
  notReceived: string[],
  needsResubmission: { docType: string; reason: string }[]
): Promise<void> {
  const text = `Hi ${employee.name},

We reviewed what you sent. ${buildDocStatusSections(notReceived, needsResubmission)}

Please reply to this email with the corrected/remaining documents attached.

${signOff()}`;
  await sendThreadedMail(employee, replySubject(employee), text);
}

export async function sendQuestionReplyEmail(employee: Employee, answer: string): Promise<void> {
  const text = `Hi ${employee.name},

${answer}

${signOff()}`;
  await sendThreadedMail(employee, replySubject(employee), text);
}
