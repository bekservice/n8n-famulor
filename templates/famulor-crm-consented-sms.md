# Preview and send consent-checked SMS follow-ups from CRM lead events

## Who is this for?
CRM teams following up with leads who explicitly consented to SMS.

## How it works
An authenticated webhook accepts trusted CRM events. It requires a stable external_id, an E.164 phone and boolean consent_sms=true; invalid events go to a review branch. The message comes from workflow configuration. Preview is on by default, and the included synthetic manual example cannot send even when previewOnly is false.

## Setup
Configure the webhook Header Auth credential and your CRM payload. Select a Famulor HTTP Header Auth credential with sms:send in Send authorized SMS. Enter an existing outbound SMS-capable number UUID and your message text in Configure SMS. Run previews, verify rejected cases, then perform a separately authorized end-to-end test with a designated test sender/recipient before setting previewOnly to false.

## Limits
SMS costs credits; consent and applicable messaging rules are your responsibility. The webhook immediately acknowledges receipt, not delivery. Duplicate event IDs are blocked within an execution only. The source CRM must prevent cross-request duplicates. This workflow does not automatically retry writes; inspect an uncertain send in Famulor before retrying.
