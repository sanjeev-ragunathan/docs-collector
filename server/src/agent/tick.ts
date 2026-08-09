import { config } from "../lib/config";
import { listEmployeesForTick, updateEmployee, logEvent, getEmployee } from "../db/models";
import { sendReminderEmail } from "../email/sender";
import { pollInbox } from "./poller";

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
          status: "REMINDER_SENT",
          reminderCount: newCount,
          nextActionAt,
        });
        logEvent(employee.id, "REMINDER_SENT", `Reminder #${newCount} sent to ${employee.email}`);
      } catch (err: any) {
        logEvent(employee.id, "ERROR", `Failed to send reminder: ${err.message}`);
      }
    } else {
      updateEmployee(employee.id, { status: "HR_INTERVENTION" });
      logEvent(
        employee.id,
        "HR_INTERVENTION",
        `Max reminders (${config.maxReminders}) reached with no response. Escalated to HR.`
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
