# New Hire Document Collection Agent

An autonomous HR agent that emails new hires for onboarding documents, follows up with reminders
on a schedule, reads their inbox replies, answers in-scope questions, tracks which documents have
been received, and escalates to HR when it can't handle something on its own.

**Stack:** React + Vite + TypeScript + Tailwind (client) · Node + Express + TypeScript + node-cron
(server, single process) · SQLite via better-sqlite3 · nodemailer (send) + imapflow (read) over
Gmail · `@anthropic-ai/sdk` (`claude-sonnet-5`) for email classification.

---

## 1. Create a Gmail App Password

The agent sends and reads mail through a real Gmail inbox, so you need an App Password (not your
normal Gmail password):

1. Go to your [Google Account](https://myaccount.google.com/) → **Security**.
2. Under "How you sign in to Google," enable **2-Step Verification** if it isn't already on
   (App Passwords require it).
3. Search for **App Passwords** (or go directly to
   [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)).
4. Create a new app password — name it something like "HR Doc Agent" — and copy the 16-character
   code Google gives you (spaces don't matter).
5. Also confirm IMAP is enabled: Gmail → Settings (gear icon) → **See all settings** → **Forwarding
   and POP/IMAP** → make sure **IMAP is enabled**.

You'll use your Gmail address and this app password in `.env` below.

---

## 2. Configure `.env`

Copy the example and fill in your values:

```bash
cp .env.example .env
```

```env
ANTHROPIC_API_KEY=sk-ant-...
GMAIL_USER=youraddress@gmail.com
GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
IMAP_HOST=imap.gmail.com
SMTP_HOST=smtp.gmail.com

# These simulate the real "2 days between reminders" cadence, compressed to
# minutes so the whole flow is demoable in one sitting. Change these, not
# hardcoded intervals in code, to slow the demo down or speed it up.
FIRST_REMINDER_MINUTES=2
REMINDER_GAP_MINUTES=2
MAX_REMINDERS=3

# How often the background cron worker runs one agent cycle automatically
POLL_CRON=*/1 * * * *
```

The `.env` file lives at the repo root — both the server (which reads it) and the demo scripts
expect it there.

---

## 3. Run

```bash
npm install       # installs root + server + client workspaces
npm run dev        # runs the API server (with cron worker) and the Vite dev server together
```

- Server: http://localhost:4000
- Client: http://localhost:5173 (proxies `/api/*` to the server)

The SQLite database (`server/data.sqlite`) is created automatically on first boot — nothing to
seed. Every demo run starts from a clean slate unless you delete this file yourself.

---

## 4. Demo Script (5 steps)

This walks through the full loop: initial request → reminder → a candidate question (both in-scope
and out-of-scope) → partial docs → all docs. Use a second real email address you control (e.g. a
personal Gmail) to play the "candidate" and reply to the agent's emails from there.

### Step 1 — Initial request email

1. Open the app, click **+ Add New Employee**.
2. Fill in the candidate's name, use an email address you control, check 2–3 documents (e.g.
   Passport, Transcript), optionally add a note, click **Collect Docs**.
3. Within a few seconds the table shows the new row with status **Request Sent**. Check the
   candidate's inbox — they've received a `[DOC-<id>]` welcome email listing the required docs.
4. Click the row to expand the event timeline and confirm a `REQUEST_SENT` event logged.

### Step 2 — A reminder fires automatically

1. Wait `FIRST_REMINDER_MINUTES` (default 2 minutes) without replying, or click **Run Agent Now**
   after that time has passed.
2. Status flips to **Reminder Sent**, the reminder count increments, and a new reminder email
   lands in the candidate's inbox. The cron worker does this automatically every `POLL_CRON`
   tick — clicking **Run Agent Now** just forces an immediate cycle for the demo.

### Step 3a — Ask an in-scope question

1. From the candidate's inbox, reply to any of the agent's emails asking something covered by
   `server/sop.md` — e.g. *"What file formats do you accept for documents?"*
2. Click **Run Agent Now** (or wait for the next cron tick) so the agent polls the inbox.
3. The candidate receives a direct, SOP-grounded answer by email. Status and reminder cadence are
   unaffected — the agent does **not** pause for in-scope questions. Expand the timeline to see a
   `QUESTION_ANSWERED` event.

### Step 3b — Ask an out-of-scope question

1. Reply again with something not covered by the SOP — e.g. *"Can I negotiate my start date?"*
2. Click **Run Agent Now**.
3. Status flips to **HR Intervention** and the row pauses (no more reminders will be sent). The
   timeline shows an `HR_INTERVENTION` event with the question that triggered it, ready for a
   human to pick up.

   → Start a fresh employee row for the remaining steps, since this one is now paused.

### Step 4 — Partial document submission

1. Reply to the request email with **one but not all** of the required documents attached (any
   file works — the agent infers presence from filenames/body, it never reads contents).
2. Click **Run Agent Now**.
3. Status flips to **Partial Docs**, the row pauses, and the candidate receives a single follow-up
   email listing exactly what's still missing. No further reminders go out per the spec — only
   this one follow-up.

### Step 5 — All documents received

1. Reply once more with the remaining missing document(s) attached.
2. Click **Run Agent Now**.
3. Status flips to **All Docs** (green badge) — onboarding document collection is complete, no
   further agent action will be taken on this employee.

---

## How the agent works

`runTick()` (in `server/src/agent/tick.ts`) is the single function the cron worker calls every
`POLL_CRON` interval, and the same function `POST /tick` calls for the **Run Agent Now** button:

1. **Reminder engine** — for every non-paused employee not in `ALL_DOCS`/`HR_INTERVENTION` whose
   `nextActionAt` has passed: send a reminder (up to `MAX_REMINDERS`) or escalate to
   `HR_INTERVENTION` once exhausted.
2. **Inbox poller** — fetches unseen emails via IMAP, matches each to an employee by sender address
   (falling back to `[DOC-<id>]` in the subject), sends the email body + attachment filenames +
   the SOP to Claude for classification, and routes the result:
   - in-scope question → reply directly, no pause
   - out-of-scope question → pause, escalate to HR
   - documents, all required present → mark `ALL_DOCS`
   - documents, some still missing → pause, send **one** follow-up listing what's missing
   - anything else → log and take no action

Every action is logged to the `events` table and shown in the row's expandable timeline. Attachment
*contents* are never stored — only which required documents appear to be present.
