import { Router } from "express";
import {
  addAdditionalDocs,
  createEmployee,
  findEmployeeByEmail,
  getEmployee,
  listEmployees,
  listEventsForEmployee,
} from "../db/models";
import { sendAdditionalDocsRequestEmail, sendInitialRequestEmail } from "../email/sender";
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

  if (findEmployeeByEmail(email)) {
    res.status(409).json({
      error: "This email address has already been used for a previous employee record.",
    });
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

employeesRouter.post("/:id/request-more-docs", async (req, res) => {
  const id = Number(req.params.id);
  const employee = getEmployee(id);
  if (!employee) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  const { additionalDocs } = req.body;
  if (!Array.isArray(additionalDocs) || additionalDocs.length === 0) {
    res.status(400).json({ error: "additionalDocs must be a non-empty array" });
    return;
  }

  const invalid = additionalDocs.filter((d: string) => !DOC_OPTIONS.includes(d as any));
  if (invalid.length > 0) {
    res.status(400).json({ error: `Invalid doc types: ${invalid.join(", ")}` });
    return;
  }

  const nextActionAt = new Date(Date.now() + config.firstReminderMinutes * 60_000).toISOString();
  // Union into requiredDocs (idempotent for docs already on the list), but the email always
  // lists exactly what HR selected — including a resend/nudge for docs already required.
  const updated = addAdditionalDocs(id, additionalDocs, nextActionAt);

  try {
    await sendAdditionalDocsRequestEmail(updated, additionalDocs);
    logEvent(id, "ADDITIONAL_DOCS_REQUESTED", `HR requested documents: ${additionalDocs.join(", ")}`);
  } catch (err: any) {
    logEvent(id, "ERROR", `Failed to send additional docs request: ${err.message}`);
  }

  res.json(getEmployee(id));
});
