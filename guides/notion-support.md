# AI Stats Support (Notion) – Usage Guide

This guide explains how the Notion-backed support system works, how to configure it, and how to use it day-to-day.

## What it does
- Creates support tickets in a Notion database when users submit the contact form.
- Lets users view their tickets and reply (two-way messaging) from the /contact page.
- Stores attachments as Notion file uploads (images only).

## 1) One-time setup

### A. Create or select the Notion database
If you already ran the setup script, you should already have the DB created.

If you need to create it again, run:

```
node scripts/create-notion-support-db.mjs "<NOTION_PAGE_URL>"
```

This will:
- Create a database named “AI Stats Support”.
- Write the database ID into `.env.local` as `NOTION_SUPPORT_DATABASE_ID`.

### B. Share the database with the integration
In Notion:
- Open the Support database.
- Share it with the integration used by `NOTION_INTEGRATION_SECRET`.

### C. Enable Notion capabilities
The integration needs:
- Read/Write access to the database
- Comments capability
- File upload capability

## 2) Required environment variables
Set these in **both**:
- `/.env.local`
- `/apps/web/.env.local`

Required:
- `NOTION_INTEGRATION_SECRET`
- `NOTION_SUPPORT_DATABASE_ID`

Optional but recommended:
- `NOTION_SUPPORT_STATUS_DEFAULT=New`
- `NOTION_API_VERSION=2025-09-03`

Optional overrides (only if you rename DB properties):
- `NOTION_SUPPORT_TITLE_PROPERTY` (default: Name)
- `NOTION_SUPPORT_EMAIL_PROPERTY` (default: Email)
- `NOTION_SUPPORT_STATUS_PROPERTY` (default: Status)
- `NOTION_SUPPORT_ISSUE_TYPE_PROPERTY`
- `NOTION_SUPPORT_ISSUE_AREA_PROPERTY`
- `NOTION_SUPPORT_CUSTOMER_TYPE_PROPERTY`
- `NOTION_SUPPORT_SUBJECT_PROPERTY`
- `NOTION_SUPPORT_DETAILS_PROPERTY`
- `NOTION_SUPPORT_REFERENCES_PROPERTY`
- `NOTION_SUPPORT_CONTACTS_PROPERTY`
- `NOTION_SUPPORT_ATTACHMENTS_PROPERTY`
- `NOTION_SUPPORT_INTERNAL_ID_PROPERTY`
- `NOTION_SUPPORT_ACCOUNT_LINK_PROPERTY`
- `NOTION_SUPPORT_GITHUB_LINK_PROPERTY`
- `NOTION_SUPPORT_LINEAR_LINK_PROPERTY`

Optional assignment:
- `NOTION_SUPPORT_ASSIGNEE_PROPERTY` (default: Assignee)
- `NOTION_SUPPORT_ASSIGNEE_ID` (Notion user ID)

## 3) How users submit support
1. Go to `/contact`.
2. Use the support form (issue type, summary, details, attachments).
3. Submit. A Notion page is created in the Support database.

## 4) How two-way messaging works
### In the app
- Signed-in users see “Your tickets” on `/contact`.
- Selecting a ticket loads the message thread.
- Users can reply and attach images.

### In Notion
- Reply directly using Notion comments on the ticket page.
- Those comments are pulled into the UI as “Support” messages.

**Note:** customer messages are prefixed as:
```
Customer (email): <message>
```
So replies in Notion should just be normal comments; they will show as support replies.

## 5) Attachments policy
- Images only (PNG, JPG, WEBP, GIF, SVG).
- Max 3 files.
- 5MB per file, 12MB total.

## 6) Troubleshooting
- **403 on comments:** Ensure the integration has “Comments” capability enabled.
- **Missing tickets in UI:** Ticket list is filtered by the logged-in user’s email.
- **Missing env vars:** Make sure `NOTION_INTEGRATION_SECRET` and `NOTION_SUPPORT_DATABASE_ID` exist in both `.env.local` files.

## 7) Quick verification
You can run the Notion smoke test script (we use a temporary page and archive it):

```
node .tmp-notion-test.cjs
```

(Use the script from your local notes if needed.)
