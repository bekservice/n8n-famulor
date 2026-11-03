# Famulor workflows for the n8n template library

These are inactive, credential-free workflow exports for the n8n Creator Portal. Each workflow uses only built-in n8n nodes, a Famulor workspace API key stored in an **HTTP Header Auth** credential, and a preview gate that starts enabled. The CRM-to-SMS template also requires a separate Header Auth credential for its inbound webhook. Importing a file does not start a schedule or send a message.

| File | Use case | Famulor scope | Destination |
| --- | --- | --- | --- |
| `famulor-booking-agenda-slack.json` | Daily agenda of confirmed bookings | `bookings:read` | Slack |
| `famulor-call-performance-slack.json` | Daily aggregate call performance | `calls:read` | Slack |
| `famulor-assistant-inventory-google-sheets.json` | Weekly assistant inventory without prompts | `assistants:read` | Google Sheets |
| `famulor-freshdesk-support-triage.json` | Daily negative-call triage ticket | `calls:read` | Freshdesk |
| `famulor-zendesk-support-triage.json` | Daily private handoff ticket for unsuccessful calls | `calls:read` | Zendesk |
| `famulor-jira-support-triage.json` | Daily investigation issue for failed calls | `calls:read` | Jira Cloud |
| `famulor-whatsapp-freshdesk-review.json` | Daily unsuccessful WhatsApp conversation triage, without message bodies | `calls:read` | Freshdesk |
| `famulor-crm-consented-sms.json` | Authenticated CRM events, explicit consent checks and preview before SMS | `sms:send` | Famulor SMS |
| `famulor-email-hubspot-follow-up.json` | Failed or overdue native email replies as bounded review tasks | `calls:read` | HubSpot |
| `famulor-webchat-outcomes-sheets.json` | Weekly completed web chat outcomes per assistant with repeatable report keys | `calls:read` | Google Sheets |

The agenda and performance workflows were adapted from inactive, synthetic-tested drafts in the Famulor n8n workspace. The public exports remove instance credential bindings and use generic Header Auth, so they also work without the Famulor community node. The inventory workflow is generated with `node templates/build.mjs`.

Before publishing, run `node templates/test.mjs` and `node templates/test-support.mjs`. Regenerate support workflows with `node templates/build-support.mjs`. The support templates create one daily aggregate ticket only when matching calls exist, include no contact details, and keep summaries off by default. Freshdesk and Zendesk require an existing requester ID; Jira requires customer-selected project and issue type. Read each matching Markdown setup guide before disabling the preview gate. In n8n, import each file, select the correct Famulor credential and destination credential, run a manual preview, inspect the output, then switch off `previewOnly` and activate the schedule only if desired. Set the business timezone and Slack channel for the two Slack workflows. The booking agenda excludes invitee names by default. The inventory requires the Google Sheets headers specified in its overview sticky note.

On October 20, 2026, the Creator Portal showed this creator as verified with three published templates. The current verified-creator guidelines allow up to four new submissions at once. Check the current portal limit before submitting; do not create duplicate submissions. A Creator Portal submission, an approved template, and a live n8n.io listing are separate states.


## Channel templates: validation and submission

Regenerate the four channel exports and run their fixture checks with:

```bash
node templates/build-channels.mjs
node templates/test-channels.mjs
```

The checks execute embedded Code-node functions with synthetic input and inspect the workflow graph. They cover complete pagination, channel boundaries, invalid events, consent and preview gates, write caps, repeat behavior and output privacy. They do not import workflows into n8n or prove that a destination accepted a write.

The four channel templates are prepared exports, not submitted or approved Creator Portal listings. Before submission, import each exact export into a fresh workflow and test every intended branch and the actual result in a designated test destination. The SMS workflow additionally requires explicit authorization for a real test message. Keep preview enabled and customer resource selections blank in the public export. Follow the current Creator Portal guidelines and submission terms; never attest to tests that have not run.
