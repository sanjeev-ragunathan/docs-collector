import { Router } from "express";
import { createEmployee, listEmployees, listEventsForEmployee } from "../db/models";
import { sendInitialRequestEmail } from "../email/sender";
import { config, DOC_OPTIONS } from "../lib/config";
import { logEvent } from "../db/models";

export const employeesRouter = Router();

employeesRouter.get("/", (_req, res) => {
  const employees = listEmployees();
  const withEvents = employees.map((e) => ({
    ...e,
    events: listEventsForEmployee(e.id),
  }));
  res.json(withEvents);
});

employeesRouter.post("/", async (req, res) => {
  const { name, email, requiredDocs, additionalMessage } = req.body;

  if (!name || !email || !Array.isArray(requiredDocs) || requiredDocs.length === 0) {
    res.status(400).json({ error: "name, email, and at least one requiredDoc are required" });
    return;
  }

  const invalid = requiredDocs.filter((d: string) => !DOC_OPTIONS.includes(d as any));
  if (invalid.length > 0) {
    res.status(400).json({ error: `Invalid doc types: ${invalid.join(", ")}` });
    return;
  }

  const nextActionAt = new Date(Date.now() + config.firstReminderMinutes * 60_000).toISOString();

  const employee = createEmployee({
    name,
    email,
    requiredDocs,
    additionalMessage: additionalMessage || "",
    nextActionAt,
  });

  try {
    await sendInitialRequestEmail(employee);
    logEvent(employee.id, "REQUEST_SENT", `Initial document request sent to ${employee.email}`);
  } catch (err: any) {
    logEvent(employee.id, "ERROR", `Failed to send initial email: ${err.message}`);
  }

  res.status(201).json(employee);
});
