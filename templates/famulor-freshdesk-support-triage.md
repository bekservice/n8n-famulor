# Create a daily Freshdesk triage ticket for negative Famulor calls

## Who is this for?
Support and operations teams using Famulor and Freshdesk who want a focused daily negative-call triage queue.

## How it works
Each morning, the workflow reads completed calls with a negative sentiment created during the previous UTC day. It validates every API page before preparing one aggregate ticket. Empty results produce no write. The preview branch starts enabled, so manual previews show the draft without changing Freshdesk.

## Setup
1. Store a Famulor workspace key with calls:read in an n8n HTTP Header Auth credential: header Authorization, value Bearer followed by your key. Select it in Read matching Famulor calls.
2. Connect your Freshdesk credential. Enter an existing requester ID in Configure triage. This avoids automatically creating a contact.
3. Run a preview and inspect the draft. Optional summaries start disabled; enable them only if your ticket audience may see conversation summaries. Raw transcripts, phone numbers and email addresses are excluded.
4. Switch previewOnly off and activate the daily schedule when ready.

## Requirements and customization
Uses only built-in n8n nodes and works without a community package. Change the schedule if needed; the query window always uses UTC. Scans above 2,000 records or incomplete pagination fail before writes. One draft contains at most 50 call references and clearly reports omitted rows. Re-running a non-preview window can create another ticket; this is not exactly-once delivery. Check destination notification rules before activation. [Famulor API setup](https://docs.famulor.io/automations/n8n).
