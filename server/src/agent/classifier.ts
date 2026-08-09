import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { config } from "../lib/config";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

const SOP_TEXT = fs.readFileSync(path.join(__dirname, "..", "..", "sop.md"), "utf-8");

export interface ClassificationResult {
  type: "question" | "documents" | "other";
  providedDocs: string[];
  inScope: boolean;
  answer: string;
}

const SYSTEM_PROMPT = `You are an email classifier for a new-hire onboarding document collection system.

You will be given an inbound email from a candidate, the list of documents still required from
them, the documents already on file, and the company's SOP document (the only source of truth
for answering questions).

Classify the email into exactly one of these types:
- "question": the candidate is asking something (not just submitting documents)
- "documents": the candidate is submitting one or more documents (via attachment filenames and/or
  clearly stating in the body that a document is attached/enclosed)
- "other": anything else (e.g. an out-of-office auto-reply, a thank-you note, spam)

For "documents": infer which of the requiredDocs are present, based on attachment filenames and
the email body. Only include docs that are clearly present — do not guess.

For "question": determine if it can be answered using ONLY the SOP text provided. Set inScope
to true only if the SOP directly answers it. If inScope is true, write a warm, concise answer
using only SOP content. If inScope is false, leave answer as an empty string.

Respond with ONLY a JSON object, no other text, matching this exact shape:
{"type": "question"|"documents"|"other", "providedDocs": string[], "inScope": boolean, "answer": string}`;

export async function classifyEmail(input: {
  emailBody: string;
  attachmentFilenames: string[];
  requiredDocs: string[];
  receivedDocs: string[];
}): Promise<ClassificationResult> {
  const userPrompt = `SOP DOCUMENT:
"""
${SOP_TEXT}
"""

EMAIL BODY:
"""
${input.emailBody}
"""

ATTACHMENT FILENAMES: ${JSON.stringify(input.attachmentFilenames)}

REQUIRED DOCS: ${JSON.stringify(input.requiredDocs)}
ALREADY RECEIVED DOCS: ${JSON.stringify(input.receivedDocs)}

Classify this email now. Respond with only the JSON object.`;

  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "{}";

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);

  return {
    type: parsed.type === "question" || parsed.type === "documents" ? parsed.type : "other",
    providedDocs: Array.isArray(parsed.providedDocs) ? parsed.providedDocs : [],
    inScope: !!parsed.inScope,
    answer: typeof parsed.answer === "string" ? parsed.answer : "",
  };
}
