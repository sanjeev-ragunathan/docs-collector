import nodemailer from "nodemailer";
import { config } from "../lib/config";
import { recordThreadMessage, type Employee } from "../db/models";

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

${signOff()}`;
  // First email in the thread — no In-Reply-To/References yet.
  await sendThreadedMail(employee, employee.emailSubject, text);
}

export async function sendReminderEmail(employee: Employee): Promise<void> {
  const missing = employee.requiredDocs.filter((d) => !employee.receivedDocs.includes(d));
  const docList = missing.map((d) => `  - ${d}`).join("\n");
  const extra = employee.additionalMessage ? `\n${employee.additionalMessage}\n` : "";
  const text = `Hi ${employee.name},

Just a friendly reminder — we're still waiting on a few onboarding documents from you:

${docList}
${extra}
Please reply to this email with these attached at your earliest convenience.

${signOff()}`;
  await sendThreadedMail(employee, replySubject(employee), text);
}

export async function sendMissingDocsFollowUpEmail(employee: Employee, missingDocs: string[]): Promise<void> {
  const docList = missingDocs.map((d) => `  - ${d}`).join("\n");
  const text = `Hi ${employee.name},

Thanks for sending those over! We received some of your documents, but we're still missing the following:

${docList}

Please reply with these remaining documents when you get a chance.

${signOff()}`;
  await sendThreadedMail(employee, replySubject(employee), text);
}

export async function sendQuestionReplyEmail(employee: Employee, answer: string): Promise<void> {
  const text = `Hi ${employee.name},

${answer}

${signOff()}`;
  await sendThreadedMail(employee, replySubject(employee), text);
}
