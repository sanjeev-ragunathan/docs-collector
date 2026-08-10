import { config } from "../lib/config";
import { listEmployeesForTick, updateEmployee, logEvent } from "../db/models";
import { sendReminderEmail } from "../email/sender";
import { pollInbox } from "./poller";

/**
 * One reminder cadence (reminderCount/MAX_REMINDERS) for every non-paused employee not
 * yet at ALL_DOCS/HR_INTERVENTION — whether they haven't responded at all yet, or have
 * submitted something but it's still partial/invalid (sendReminderEmail's content reflects
 * whatever's actually still outstanding either way). Once exhausted, escalate to HR.
 */
async function runReminderEngine(): Promise<void> {
  const now = Date.now();
  const candidates = listEmployeesForTick();

  for (const employee of candidates) {
    if (!employee.nextActionAt) continue;
    if (new Date(employee.nextActionAt).getTime() > now) continue;

    if (employee.reminderCount < config.maxReminders) {
      try {
        await sendReminderEmail(employee);
        const newCount = employee.reminderCount + 1;
        const nextActionAt = new Date(now + config.reminderGapMinutes * 60_000).toISOString();
        updateEmployee(employee.id, {
          status: employee.status === "PARTIAL_DOCS" ? "PARTIAL_DOCS" : "REMINDER_SENT",
          reminderCount: newCount,
          nextActionAt,
        });
        logEvent(employee.id, "REMINDER_SENT", `Reminder #${newCount} sent to ${employee.email}`);
      } catch (err: any) {
        logEvent(employee.id, "ERROR", `Failed to send reminder: ${err.message}`);
      }
    } else {
      updateEmployee(employee.id, { paused: true, status: "HR_INTERVENTION" });
      logEvent(
        employee.id,
        "HR_INTERVENTION",
        `Max reminders (${config.maxReminders}) reached with onboarding still incomplete. Escalated to HR.`
      );
    }
  }
}

export async function runTick(): Promise<void> {
  await runReminderEngine();
  try {
    await pollInbox();
  } catch (err: any) {
    console.error("Inbox poll failed:", err.message);
  }
}
