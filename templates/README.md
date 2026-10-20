# Famulor workflows for the n8n template library

These are inactive, credential-free workflow exports for the n8n Creator Portal. Each workflow uses only built-in n8n nodes, a Famulor workspace API key stored in an **HTTP Header Auth** credential, and a preview gate that starts enabled. Importing a file does not start a schedule or send a message.

| File | Use case | Famulor scope | Destination |
| --- | --- | --- | --- |
| `famulor-booking-agenda-slack.json` | Daily agenda of confirmed bookings | `bookings:read` | Slack |
| `famulor-call-performance-slack.json` | Daily aggregate call performance | `calls:read` | Slack |
| `famulor-assistant-inventory-google-sheets.json` | Weekly assistant inventory without prompts | `assistants:read` | Google Sheets |
| `famulor-freshdesk-support-triage.json` | Daily negative-call triage ticket | `calls:read` | Freshdesk |
| `famulor-zendesk-support-triage.json` | Daily private handoff ticket for unsuccessful calls | `calls:read` | Zendesk |
| `famulor-jira-support-triage.json` | Daily investigation issue for failed calls | `calls:read` | Jira Cloud |

The agenda and performance workflows were adapted from inactive, synthetic-tested drafts in the Famulor n8n workspace. The public exports remove instance credential bindings and use generic Header Auth, so they also work without the Famulor community node. The inventory workflow is generated with `node templates/build.mjs`.

Before publishing, run `node templates/test.mjs` and `node templates/test-support.mjs`. Regenerate support workflows with `node templates/build-support.mjs`. The support templates create one daily aggregate ticket only when matching calls exist, include no contact details, and keep summaries off by default. Freshdesk and Zendesk require an existing requester ID; Jira requires customer-selected project and issue type. Read each matching Markdown setup guide before disabling the preview gate. In n8n, import each file, select the correct Famulor credential and destination credential, run a manual preview, inspect the output, then switch off `previewOnly` and activate the schedule only if desired. Set the business timezone and Slack channel for the two Slack workflows. The booking agenda excludes invitee names by default. The inventory requires the Google Sheets headers specified in its overview sticky note.

On October 20, 2026, the Creator Portal showed this creator as verified with three published templates. The current verified-creator guidelines allow up to four new submissions at once. Check the current portal limit before submitting; do not create duplicate submissions. A Creator Portal submission, an approved template, and a live n8n.io listing are separate states.
