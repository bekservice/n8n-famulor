# Famulor for n8n

Official community package for the [Famulor workspace API](https://docs.famulor.io/api-reference/introduction): **423 native actions**, **32 polling events** and **five signed webhook events**.

Package: `n8n-nodes-famulor` · Maintained by **BEK Service GmbH (@bekservice)** · [Famulor](https://app.famulor.io) · [Integration guide](https://docs.famulor.io/automations/n8n)

## Install and connect

1. Install `n8n-nodes-famulor` through **Settings → Community Nodes** in your n8n instance. See the [n8n installation guide](https://docs.n8n.io/integrations/community-nodes/installation-and-management/gui-installation/).
2. Create a Famulor API key in the workspace you want to automate. Give it only the read/write scopes needed by your workflow.
3. Add **Famulor API** credentials in n8n, paste the key, and leave the base URL at `https://app.famulor.io`. An HTTPS origin for your verified Famulor whitelabel domain is also supported. The workspace comes from the key.
4. Add **Famulor**, choose a resource and operation, and fill the required fields. Add optional fields only when you want to send them.

Minimum Node.js is 20.15. The package is compiled and checked against current `n8n-workflow` types and retains the saved version-2 nodes. Classic `.de` keys and `/api/user/*` endpoints are unsupported.

## Native actions

Every operation in the pinned public OpenAPI contract has a native **Resource → Operation** choice and its own input fields. There is no custom-request or operation-JSON step to construct first. Actions cover:

- Assistants, calls, campaigns, contacts, segments, suppression and phone numbers
- SMS, conversations, email, WhatsApp, history and messaging connectors
- Knowledge bases, files, reusable tools, automations and missions
- Bookings, event types, available slots and scheduled callbacks
- Voices, widgets, simulations, QA, translations, versions and catalog
- Account, API keys, settings, integrations, billing, dashboards and workspaces
- Loop, carrier connections, SIP trunks, caller IDs and whitelabel administration

Famulor enforces workspace scopes, permissions, plan entitlements, feature access and credits. An action being available in n8n does not grant additional access. Billable actions such as calls and SMS consume the normal workspace credits.

### Input and output behavior

- Optional fields stay absent until added to **Optional Fields**. Updating a label does not implicitly change unrelated boolean settings.
- Explicit `false`, `0`, empty arrays, empty strings and supported `null` values are preserved. **Additional Body Fields** accepts documented JSON fields; a selected named field takes precedence.
- Assistant, campaign, call, contact, number, knowledge, booking, event-type, tool, automation, segment, callback and mission references support a searchable workspace list or **By ID** mode. UUIDs can be mapped from previous nodes.
- Lists return one n8n item per record. A nested object response remains one item; scalar or empty responses use a `value` field. Audio previews return n8n binary data.
- Pagination inputs use the public endpoint's limit/offset contract. Actions send one request per input item; they do not silently fetch all pages or retry writes.
- Upload actions accept the API's documented URL/base64 JSON alternatives. The node does not read files from the host filesystem.
- Requests stay within the configured HTTPS Famulor origin and `/api/v1`. Redirects are not followed, credentials are not echoed in errors, and action output is linked to its input item.

Example read-only action: **Account → Get current user** (`getMe`). Example outbound call: **Calls → Create an outbound call**, select an assistant and provide `to_number` in E.164 format. Create/sending/purchase operations perform real writes when you execute them.

## Polling events

Add **Famulor Polling Trigger**, select an event and the polling schedule. Campaign-lead events also require the campaign UUID.

The 32 events include new inbound/outbound/web calls, call completion/failure/no-answer, new assistants/contacts/campaigns, campaign start/pause/completion and lead addition/completion, conversation/email/WhatsApp activity, new numbers/knowledge/tools/automations/missions/segments/suppression entries, bookings and booking cancellation/completion/event types, and callback creation/completion.

- The first active poll establishes a baseline and emits no historical events. Existing assignments and statuses are skipped.
- A call created before activation can still emit completion when it ends after activation. Reanalysis does not emit another completion.
- Conversation activity can emit again when its last-activity timestamp changes. Snapshot/status events emit the first observed occurrence per resource ID; re-adding a lead or repeating a status does not create another occurrence.
- Snapshot sources require full pagination because the API has no reliable change cursor. Transitions entirely between polls can be missed. Large workspaces have a higher read cost.
- Timestamp sources re-read a ten-minute window and deduplicate IDs and timestamps to catch delayed visibility. Records becoming visible more than ten minutes behind the newest observed timestamp may be missed. Timestamp dedupe entries expire outside that window; first-occurrence/status sources retain their observed IDs.
- Invalid data, failed later pages, API-capped results or scans beyond 50,000 records fail before updating state. Stored state is bounded to 50,000 resource IDs. A different event, campaign or credential establishes a new baseline.
- Manual tests return recent samples without changing active polling state. State uses n8n's workflow static data; persistence and retries follow the host's execution lifecycle. This is not an exactly-once guarantee. Make downstream writes idempotent where necessary.
- No Famulor webhook destinations are overwritten by the polling node.

## Signed webhooks

Add **Famulor Trigger** (version 3) for these events:

| Event | Configure the destination in Famulor |
|---|---|
| `call.completed` | Settings → Webhooks |
| `conversation.ended` | Settings → Webhooks with a signing secret |
| `booking.created` | Booking event type webhook |
| `booking.cancelled` | Booking event type webhook |
| `booking.rescheduled` | Booking event type webhook |

Copy the n8n Production URL to the appropriate Famulor destination and configure its signing secret. Store that same secret in **Famulor Webhook API** credentials in n8n. The node verifies `X-Famulor-Signature: sha256=<HMAC-SHA256(raw body, secret)>` before returning data. Missing or incorrect signatures are rejected with HTTP 401. The selected event and optional assistant filter must match. Manual webhook tests use the Test URL while the editor is listening.

The signing contract does not include a timestamp or nonce, so the signature alone does not prevent replay. Use event/resource identifiers for downstream idempotency. Existing webhook settings are never changed automatically.

## Upgrade from 2.0.0

This release is additive at the package level. Saved workflows using **Famulor version 2** or **Famulor Trigger version 2** keep their previous node definitions and parameters. New nodes default to version 3. The polling node is new.

To upgrade an existing action node, select version 3, choose the native resource/operation, and map the new fields. To upgrade a webhook node, select its event and move the old node's secret to **Famulor Webhook API** credentials. Test the workflow before activating it. Do not remove the old credentials until all dependent workflows have been updated.

## Development and release

```sh
npm ci
npm run build
npm run lint
npm test
node scripts/generate-catalog.mjs path/to/openapi.json --check
npm pack --dry-run
```

The catalog is pinned to the [public specification](https://docs.famulor.io/api-reference/openapi.json), with its SHA-256 and operation count stored in generated metadata. To refresh it, run the same generator without `--check` and review the resulting inputs and endpoint changes.

Tests execute all 423 registered native choices with actual n8n builder defaults, every polling event's baseline/emission/deduplication path, all signed webhook event choices, selectors, pagination failures, optional-input behavior and saved-node version routing against mocked HTTP. These tests do not start real calls, send messages, purchase resources or alter customer workspaces.

Release by pushing the reviewed commit and a matching version tag. The existing **Publish** GitHub Actions workflow installs the lockfile, builds, lints, tests, and publishes the package with npm provenance. npm publication and n8n Creator Portal verification are separate outcomes.
