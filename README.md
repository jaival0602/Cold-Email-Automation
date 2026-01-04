# Cold Email Automation System

This project automates cold outreach using self-hosted n8n and Google Sheets, with Gmail for sending emails.

## A. System Overview
- **Core Engine**: n8n (Self-hosted via Docker).
- **Database**: Google Sheets (Stores leads & status).
- **Email**: Gmail (via OAuth).
- **Triggers**: Daily Schedule (Cron) or Manual Webhook.
- **Constraints**: 40 emails/day max, 30-90s delay between actions.
- **Features**: 
  - Generates personalized emails using AI.
  - Generates LinkedIn connection messages (saved to sheet).
  - Handles basic follow-ups (2 days later).

## B. Google Sheets Schema
Create a new Google Sheet with the following headers in Row 1:

| Column | Header | Description |
| :--- | :--- | :--- |
| A | `first_name` | Lead's First Name |
| B | `last_name` | Lead's Last Name |
| C | `company` | Company Name |
| D | `role` | Job Title |
| E | `email` | Email Address |
| F | `linkedin_url` | LinkedIn Profile URL |
| G | `company_type` | `mnc` or `startup` |
| H | `status` | `new`, `emailed`, `followed_up`, `replied`, `error` |
| I | `last_contacted_date` | Date (YYYY-MM-DD) |
| J | `email_subject` | Generated Subject Line |
| K | `email_body` | Generated Email Body |
| L | `linkedin_message` | Generated LinkedIn Note |
| M | `error_reason` | Error logs |

## C. n8n Workflow Instructions
Follow these steps to build the workflows in n8n.

### Prerequisites (n8n Setup)
Run n8n using Docker:
```bash
docker run -it --rm --name n8n -p 5678:5678 -v ~/.n8n:/home/node/.n8n n8nio/n8n
```
Access at `http://localhost:5678`.

### Credentials Needed
12.  **Google Cloud (OAuth)**: Enable "Gmail API" and "Google Sheets API". Create OAuth Client ID. Add `http://localhost:5678/oauth2/callback` as redirect URI.
3.  **Google Gemini**: API Key (from Google AI Studio) for the LLM node.

---

### Workflow 1: Daily Outreach (New Leads)
**1. Trigger: Schedule Request**
*   **Node**: `Schedule Trigger`
*   **Settings**: Trigger Interval: `Days`, Time: `9:00 AM` (or preferred time).

**2. Read New Leads (Split Strategy)**
We will read 20 MNCs and 20 Startups in parallel.
*   **Node A**: `Google Sheets` (Get Many Rows)
    *   Filters: `status`=`new` AND `company_type`=`mnc`
    *   Limit: `20`
*   **Node B**: `Google Sheets` (Get Many Rows)
    *   Filters: `status`=`new` AND `company_type`=`startup`
    *   Limit: `20`

**3. Merge & Loop**
*   **Node**: `Merge`
    *   Mode: `Append` (Connect both Sheet nodes to this).
*   **Node**: `Split In Batches`
    *   Batch Size: `1`.

**4. Generate Content (AI)**
*   **Node**: `Google Gemini Chat`
*   **Model**: `gemini-flash` or `gemini-pro`.
*   **Prompt**:
    > You are a sales expert. Write a cold email for {{ $json.first_name }} at {{ $json.company }}.
    > Role: {{ $json.role }}.
    > Output JSON with keys: "subject", "body", "linkedin_message".
    > limit body to 100 words. linkedin_message max 300 chars.

**5. Send Email**
*   **Node**: `Gmail`
*   **Operation**: `Send`
*   **Account**: Select your Google OAuth Credential.
*   **To**: `{{ $json.email }}`
*   **Subject**: `{{ $json.output.subject }}`
*   **Body**: `{{ $json.output.body }}`

**6. Rate Limiting (Delay)**
*   **Node**: `Wait`
*   **Settings**: Resume: `After time interval`.
*   **Amount**: `{{ Math.floor(Math.random() * (90 - 30 + 1) + 30) }}` (Seconds).

**7. Update Status**
*   **Node**: `Google Sheets`
*   **Operation**: `Update Row`
*   **Match**: Row Number (if available) or filter by Email.
*   **Fields to Update**:
    *   `status`: `emailed`
    *   `last_contacted_date`: `{{ new Date().toISOString().split('T')[0] }}`
    *   `email_subject`: `{{ $json.output.subject }}`
    *   `email_body`: `{{ $json.output.body }}`
    *   `linkedin_message`: `{{ $json.output.linkedin_message }}`

**8. Error Handler (Optional)**
*   Connect the "Error" output of the Gmail node to a new Google Sheets node that updates `status` to `error`.

---

### Workflow 2: Follow-Up (2 Days Later)
**1. Trigger: Schedule Request**
*   **Node**: `Schedule Trigger`
*   **Time**: `10:00 AM`.

**2. Read Emailed Leads**
*   **Node**: `Google Sheets`
*   **Operation**: `Get Many Rows`
*   **Filters**: `status` Equal to `emailed`.

**3. Filter by Date**
*   **Node**: `If`
*   **Condition**: `last_contacted_date` is before `{{ new Date(new Date().setDate(new Date().getDate() - 2)).toISOString().split('T')[0] }}`.

**4. Loop Over Leads**
*   **Node**: `Loop`.

**5. Check for Reply**
*   **Node**: `Gmail`
*   **Operation**: `Get Messages`.
*   **Query**: `from:{{ $json.email }}`.
*   **Limit**: `1`.

**6. Branch on Reply**
*   **Node**: `If`.
*   **Condition**: If message count > 0 (Reply exists).
    *   **TRUE**: Update Sheet -> `status` = `replied`.
    *   **FALSE**: Proceed to follow up.

**7. Send Follow-up (If False)**
*   **Node**: `AI` (Generate polite bump).
*   **Node**: `Gmail` (Send).
*   **Node**: `Wait` (30-90s).
*   **Node**: `Google Sheets` (Update `status` = `followed_up`).

## D. Node.js Helper Scripts
(Files located in this directory)
1.  `package.json` - Dependencies (`axios`, `dotenv`).
2.  `trigger_workflow.js` - Script to manually trigger the workflow via webhook.
3.  `.env.example` - Template for environment variables.

To use:
```bash
npm install
cp .env.example .env
# Edit .env and add your n8n Webhook URL
node trigger_workflow.js
```

## E. Rate Limiting & Safety
1.  **Volume**: Max 40 emails/day is safe for a warmed-up Gmail account.
2.  **Delays**: The random 30-90 second delay mimics human behavior.
3.  **Spam Check**: Ensure your subject lines are not "clickbaity".
4.  **Unsubscribe**: Manually honor any unsubscribe requests immediately.

## F. Test Plan
1.  **Setup**:
    *   Start n8n: `docker run ...`
    *   Configure Credentials in n8n.
    *   Create Google Sheet with 2 test rows (status: `new`).
2.  **Dry Run**:
    *   Disconnect the "Send Email" node in n8n temporarily (or replace with a Logger).
    *   Run the workflow to verify it reads sheets and generates AI content.
3.  **Email Test**:
    *   Reconnect Gmail node.
    *   Run workflow for **1** row.
    *   Verify email lands in inbox (not spam).
    *   Verify Sheet updates to `emailed`.
4.  **Follow-up Test**:
    *   Manually set a row's `last_contacted_date` to 3 days ago.
    *   Run Follow-up workflow.
    *   Verify it sends a second email.
