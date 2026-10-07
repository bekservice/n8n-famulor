# Famulor workflows for the n8n template library

These are inactive, credential-free workflow exports for the n8n Creator Portal. Each workflow uses only built-in n8n nodes, a Famulor workspace API key stored in an **HTTP Header Auth** credential, and a preview gate that starts enabled. Importing a file does not start a schedule or send a message.

| File | Use case | Famulor scope | Destination |
| --- | --- | --- | --- |
| `famulor-booking-agenda-slack.json` | Daily agenda of confirmed bookings | `bookings:read` | Slack |
| `famulor-call-performance-slack.json` | Daily aggregate call performance | `calls:read` | Slack |
| `famulor-assistant-inventory-google-sheets.json` | Weekly assistant inventory without prompts | `assistants:read` | Google Sheets |

The agenda and performance workflows were adapted from inactive, synthetic-tested drafts in the Famulor n8n workspace. The public exports remove instance credential bindings and use generic Header Auth, so they also work without the Famulor community node. The inventory workflow is generated with `node templates/build.mjs`.

Before publishing, run `node templates/test.mjs`. In n8n, import each file, select the correct Famulor credential and destination credential, run a manual preview, inspect the output, then switch off `previewOnly` and activate the schedule only if desired. Set the business timezone and Slack channel for the two Slack workflows. The booking agenda excludes invitee names by default. The inventory requires the Google Sheets headers specified in its overview sticky note.

The n8n Creator Portal currently allows unverified creators to submit one new template at a time. Publish these sequentially; do not create duplicate submissions. A Creator Portal submission, an approved template, and a live n8n.io listing are separate states.
