import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", "..", "..", ".env") });

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const config = {
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  gmailUser: required("GMAIL_USER"),
  gmailAppPassword: required("GMAIL_APP_PASSWORD"),
  imapHost: process.env.IMAP_HOST || "imap.gmail.com",
  smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
  firstReminderMinutes: Number(process.env.FIRST_REMINDER_MINUTES || 2),
  reminderGapMinutes: Number(process.env.REMINDER_GAP_MINUTES || 2),
  maxReminders: Number(process.env.MAX_REMINDERS || 3),
  pollCron: process.env.POLL_CRON || "*/1 * * * *",
  port: Number(process.env.PORT || 4000),
  confidenceThreshold: Number(process.env.CONFIDENCE_THRESHOLD || 0.6),
};

export const DOC_OPTIONS = [
  "Passport",
  "Driver's License",
  "Transcript",
  "EAD",
  "Degree Certificate",
] as const;
